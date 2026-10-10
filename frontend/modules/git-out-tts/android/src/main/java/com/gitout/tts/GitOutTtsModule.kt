package com.gitout.tts

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

/** All engine operations and mutable state are confined to the main thread. */
class GitOutTtsModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var engine: TextToSpeech? = null
  private var ready = false
  private var foreground = true
  private var generation = 0
  private var activeId: String? = null
  private val initializationWaiters = mutableListOf<Promise>()
  private var initTimeout: Runnable? = null
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private var focusGeneration = 0
  private var receiverContext: Context? = null
  private var mediaSession: MediaSession? = null
  private var mediaEventGeneration = 0L
  private var pocketEnabled = false
  private var lastMediaTime = -1000L
  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) stopPlayback()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("GitOutTts")
    Events("utterance", "mediaAction")

    AsyncFunction("initialize") { promise: Promise -> initialize(promise) }
      .runOnQueue(Queues.MAIN)

    AsyncFunction("speak") { id: String, text: String, language: String, voiceId: String, promise: Promise ->
      speak(id, text, language, voiceId, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") { promise: Promise ->
      val result = stopPlayback()
      if (result == TextToSpeech.ERROR) {
        // If stop fails, release the engine rather than leaving audio playing.
        shutdownEngine()
        promise.reject("STOP_FAILED", "Android could not stop TTS; the engine was released. Retry speech.", null)
      } else {
        promise.resolve(null)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("shutdown") { shutdownEngine() }.runOnQueue(Queues.MAIN)

    AsyncFunction("setPocketControls") { enabled: Boolean ->
      pocketEnabled = enabled
      if (enabled) appContext.reactContext?.applicationContext?.let(::ensureMediaSession)
      updateMediaSession(if (activeId != null) PlaybackState.STATE_PLAYING else PlaybackState.STATE_STOPPED)
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersBackground {
      main.post {
        foreground = false
        updateMediaSession(if (activeId != null) PlaybackState.STATE_PLAYING else PlaybackState.STATE_STOPPED)
      }
    }
    OnActivityEntersForeground { main.post {
      foreground = true
      updateMediaSession(if (activeId != null) PlaybackState.STATE_PLAYING else PlaybackState.STATE_STOPPED)
    } }
    OnDestroy {
      main.post {
        // The JS event emitter may already be gone; release without emitting.
        activeId = null
        shutdownEngine()
        releaseMediaSession()
      }
    }
  }

  private fun initialize(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.reject("ANDROID_VERSION_UNSUPPORTED", "Git Out speech output requires Android 8 or newer. Read the answer as text on this device.", null)
      return
    }
    if (ready) {
      resolveCapabilities(promise)
      return
    }
    initializationWaiters.add(promise)
    if (engine != null) return
    val context = appContext.reactContext?.applicationContext
    if (context == null) {
      failInitialization("Android TTS context is unavailable. Reopen the app.")
      return
    }
    val token = ++generation
    initTimeout = Runnable {
      if (token == generation && !ready) {
        failInitialization("Android TTS initialization timed out. Enable a text-to-speech engine in Android Settings and retry.")
      }
    }.also { main.postDelayed(it, 10_000) }
    try {
      // No text is submitted during initialization. Only the system-selected engine is used.
      engine = TextToSpeech(context) { status ->
        // Even a synchronous/binder-thread callback must wait until engine is assigned.
        main.post {
          if (token != generation) return@post
          if (status != TextToSpeech.SUCCESS) {
            failInitialization("Android TTS could not initialize. Enable or update your text-to-speech engine in Android Settings.")
            return@post
          }
          initTimeout?.let(main::removeCallbacks)
          initTimeout = null
          val listener = object : UtteranceProgressListener() {
            override fun onStart(id: String) = dispatch(token, id, "speaking")
            override fun onDone(id: String) = dispatch(token, id, "completed")
            override fun onStop(id: String, interrupted: Boolean) = dispatch(token, id, "stopped")
            @Deprecated("Android callback")
            override fun onError(id: String) = dispatch(token, id, "error", "Android TTS synthesis failed. Check installed voice data and retry.")
            override fun onError(id: String, errorCode: Int) = dispatch(token, id, "error", "Android TTS synthesis failed (code $errorCode). Check installed voice data and retry.")
          }
          try {
            if (engine?.setOnUtteranceProgressListener(listener) != TextToSpeech.SUCCESS) {
              failInitialization("Android could not attach TTS playback callbacks. Restart the app or update your speech engine.")
              return@post
            }
          } catch (_: Exception) {
            failInitialization("Android TTS setup failed. Restart the app or update your speech engine.")
            return@post
          }
          ready = true
          val waiters = initializationWaiters.toList()
          initializationWaiters.clear()
          waiters.forEach(::resolveCapabilities)
        }
      }
    } catch (_: Exception) {
      failInitialization("Android TTS is unavailable. Install or enable a text-to-speech engine in Android Settings.")
    }
  }

  private fun ensureMediaSession(context: Context) {
    if (mediaSession != null) return
    mediaSession = MediaSession(context, "GitOutTts").apply {
      setFlags(
        MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS,
      )
      setCallback(object : MediaSession.Callback() {
        override fun onPlay() { handleMediaAction("play") }
        override fun onPause() { handleMediaAction("pause") }
        override fun onStop() { handleMediaAction("stop") }
        override fun onMediaButtonEvent(intent: Intent): Boolean {
          @Suppress("DEPRECATION")
          val key = intent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return false
          val action = when (key.keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
            KeyEvent.KEYCODE_MEDIA_PAUSE -> "pause"
            KeyEvent.KEYCODE_MEDIA_STOP -> "stop"
            KeyEvent.KEYCODE_HEADSETHOOK, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "toggle"
            else -> return false
          }
          if (key.action == KeyEvent.ACTION_DOWN && key.repeatCount == 0) handleMediaAction(action)
          return true
        }
      }, main)
    }
    GitOutTtsMediaSession.current = mediaSession
    GitOutTtsMediaSession.stopPlayback = { stopPlayback() }
  }

  private fun handleMediaAction(action: String) {
    val now = SystemClock.elapsedRealtime()
    if (action != "stop" && now - lastMediaTime < 600) return
    lastMediaTime = now
    // Normalize an interruption before sending to JS: it may receive this after
    // the stopped utterance event, and must never interpret it as a new mic turn.
    if (action == "stop" || (activeId != null && action != "play")) {
      stopPlayback()
      dispatchMediaAction("stop")
    } else if (foreground && pocketEnabled) {
      dispatchMediaAction(action)
    }
  }

  private fun updateMediaSession(state: Int) {
    val session = mediaSession ?: return
    val actions = PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_STOP or PlaybackState.ACTION_PLAY_PAUSE
    session.setPlaybackState(
      PlaybackState.Builder()
        .setActions(actions)
        .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, if (state == PlaybackState.STATE_PLAYING) 1f else 0f)
        .build(),
    )
    session.isActive = activeId != null || (pocketEnabled && foreground)
  }

  private fun startPlaybackService(context: Context) {
    val session = mediaSession ?: return
    val intent = Intent(context, GitOutTtsPlaybackService::class.java)
      .putExtra(GitOutTtsPlaybackService.EXTRA_SESSION_TOKEN, session.sessionToken)
      .putExtra(GitOutTtsPlaybackService.EXTRA_PLAYBACK_ID, activeId)
    GitOutTtsMediaSession.playbackId = activeId
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(context, intent)
      } else {
        context.startService(intent)
      }
    } catch (_: Exception) {
      // The notification is an enhancement. TTS remains controlled by audio focus.
    }
  }

  private fun stopPlaybackService(context: Context? = appContext.reactContext?.applicationContext) {
    GitOutTtsMediaSession.playbackId = null
    context?.let {
      try { it.stopService(Intent(it, GitOutTtsPlaybackService::class.java)) } catch (_: Exception) { }
    }
  }

  private fun dispatchMediaAction(action: String) {
    sendEvent(
      "mediaAction",
      mapOf("id" to "media-${++mediaEventGeneration}", "action" to action),
    )
  }

  private fun releaseMediaSession() {
    updateMediaSession(PlaybackState.STATE_NONE)
    GitOutTtsMediaSession.current = null
    GitOutTtsMediaSession.stopPlayback = null
    try { mediaSession?.release() } catch (_: Exception) { }
    mediaSession = null
    stopPlaybackService()
  }

  private fun installed(voice: Voice): Boolean =
    !voice.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)

  private fun resolveCapabilities(promise: Promise) {
    try {
      val voices = engine?.voices.orEmpty().sortedBy { it.name }.map { voice ->
        mapOf(
          "id" to voice.name,
          "language" to voice.locale.toLanguageTag(),
          "networkRequired" to voice.isNetworkConnectionRequired,
          "installed" to installed(voice)
        )
      }
      promise.resolve(mapOf("voices" to voices, "maxSpeechInputLength" to TextToSpeech.getMaxSpeechInputLength()))
    } catch (_: Exception) {
      promise.reject("VOICE_QUERY_FAILED", "Android could not list TTS voices. Check the installed engine and voice data in Settings.", null)
    }
  }

  private fun failInitialization(message: String) {
    val waiters = initializationWaiters.toList()
    initializationWaiters.clear()
    shutdownEngine()
    waiters.forEach { it.reject("INITIALIZATION_FAILED", message, null) }
  }

  private fun speak(id: String, text: String, language: String, voiceId: String, promise: Promise) {
    val tts = engine
    if (!ready || tts == null || !foreground) {
      promise.reject("TTS_UNAVAILABLE", "TTS is not ready or the app is in the background. Return to Git Out and retry.", null)
      return
    }
    if (text.isBlank() || text.length > TextToSpeech.getMaxSpeechInputLength()) {
      promise.reject("INVALID_TEXT", "The response is empty or exceeds Android's speech input limit. The text is still available.", null)
      return
    }
    try {
      if (stopPlayback() == TextToSpeech.ERROR) throw IllegalStateException("stop failed")
      // Recheck on the native side just before speaking; JS cannot bypass the policy.
      val locale = Locale.forLanguageTag(language)
      val voice = tts.voices.orEmpty().firstOrNull {
        it.name == voiceId && it.locale.toLanguageTag().equals(locale.toLanguageTag(), ignoreCase = true) &&
          !it.isNetworkConnectionRequired && installed(it)
      }
      if (voice == null || tts.isLanguageAvailable(locale) < TextToSpeech.LANG_AVAILABLE) {
        promise.reject("VOICE_UNAVAILABLE", "No installed non-network TTS voice is available for $language. Install voice data in Android Text-to-speech settings and retry.", null)
        return
      }
      // Do not call setLanguage: some engines silently substitute a default voice.
      if (tts.setVoice(voice) == TextToSpeech.ERROR || tts.voice?.name != voice.name ||
        tts.voice?.isNetworkConnectionRequired != false) {
        promise.reject("VOICE_UNAVAILABLE", "Android could not select the requested offline voice. Check installed voice data in Settings.", null)
        return
      }
      val context = appContext.reactContext ?: throw IllegalStateException("context unavailable")
      val applicationContext = context.applicationContext
      ensureMediaSession(applicationContext)
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
      tts.setAudioAttributes(attributes)
      val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val focusToken = ++focusGeneration
      val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes)
        .setOnAudioFocusChangeListener({ change ->
          if (change < 0 && focusToken == focusGeneration) stopPlayback()
        }, main)
        .build()
      if (manager.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        promise.reject("AUDIO_FOCUS_UNAVAILABLE", "Another app is using audio. Retry speech when it finishes.", null)
        return
      }
      audioManager = manager
      focusRequest = focus
      if (receiverContext == null) {
        ContextCompat.registerReceiver(context, noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED)
        receiverContext = context
      }
      activeId = id
      if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), id) == TextToSpeech.ERROR) {
        stopPlayback()
        promise.reject("SYNTHESIS_FAILED", "Android rejected speech synthesis. Check offline voice data and retry.", null)
      } else {
        updateMediaSession(PlaybackState.STATE_PLAYING)
        startPlaybackService(applicationContext)
        promise.resolve(null)
      }
    } catch (_: Exception) {
      stopPlayback()
      promise.reject("SYNTHESIS_FAILED", "Android TTS failed. Check your speech engine and installed voice data, then retry.", null)
    }
  }

  private fun dispatch(token: Int, id: String, state: String, message: String = "") {
    main.post {
      if (token != generation || activeId != id) return@post
      if (state != "speaking") {
        activeId = null
        releaseAudio()
        updateMediaSession(PlaybackState.STATE_NONE)
        stopPlaybackService()
      }
      sendEvent("utterance", mapOf("id" to id, "state" to state, "message" to message))
    }
  }

  private fun releaseAudio() {
    focusGeneration++
    try { focusRequest?.let { audioManager?.abandonAudioFocusRequest(it) } } catch (_: Exception) { }
    focusRequest = null
    audioManager = null
    receiverContext?.let { context ->
      try { context.unregisterReceiver(noisyReceiver) } catch (_: IllegalArgumentException) { }
    }
    receiverContext = null
  }

  private fun stopPlayback(): Int {
    val id = activeId
    activeId = null
    val result = try { engine?.stop() ?: TextToSpeech.SUCCESS } catch (_: Exception) { TextToSpeech.ERROR }
    releaseAudio()
    updateMediaSession(PlaybackState.STATE_NONE)
    stopPlaybackService()
    if (result == TextToSpeech.ERROR) resetEngine()
    if (id != null) sendEvent("utterance", mapOf("id" to id, "state" to "stopped", "message" to ""))
    return result
  }

  private fun shutdownEngine() {
    pocketEnabled = false
    stopPlayback()
    resetEngine()
    releaseMediaSession()
  }

  private fun resetEngine() {
    generation++
    initTimeout?.let(main::removeCallbacks)
    initTimeout = null
    try { engine?.shutdown() } catch (_: Exception) { }
    engine = null
    ready = false
    initializationWaiters.forEach { it.reject("CANCELLED", "TTS initialization was cancelled.", null) }
    initializationWaiters.clear()
  }
}
