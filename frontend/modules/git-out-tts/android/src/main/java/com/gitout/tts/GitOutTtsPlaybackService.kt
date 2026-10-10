package com.gitout.tts

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.os.Parcelable
import android.media.session.MediaSession

/**
 * Keeps an already-started TTS utterance eligible to finish after the Activity
 * is backgrounded. It never opens the microphone or starts speech by itself.
 */
class GitOutTtsPlaybackService : Service() {
  private var playbackId: String? = null
  private var stopping = false
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { stopCurrentPlayback() }
  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val token = intent?.mediaSessionToken() ?: run {
      stopSelfResult(startId)
      return START_NOT_STICKY
    }
    playbackId = intent.getStringExtra(EXTRA_PLAYBACK_ID)

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notification = builder
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle("Git Out")
      .setContentText("Speaking a local answer")
      .setCategory(Notification.CATEGORY_TRANSPORT)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .addAction(action("Play", ACTION_PLAY, android.R.drawable.ic_media_play))
      .addAction(action("Pause", ACTION_PAUSE, android.R.drawable.ic_media_pause))
      .addAction(action("Stop", ACTION_STOP, android.R.drawable.ic_media_pause))
      .setStyle(
        Notification.MediaStyle()
          .setMediaSession(token)
          .setShowActionsInCompactView(0, 1, 2),
      )
      .build()

    startForeground(NOTIFICATION_ID, notification)
    // A very short utterance may finish before Android delivers this start.
    if (playbackId == null || playbackId != GitOutTtsMediaSession.playbackId) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelfResult(startId)
    } else {
      handler.removeCallbacks(timeout)
      handler.postDelayed(timeout, 10 * 60 * 1000L)
    }
    return START_NOT_STICKY
  }

  private fun stopCurrentPlayback() {
    if (stopping) return
    stopping = true
    if (playbackId != null && playbackId == GitOutTtsMediaSession.playbackId) {
      GitOutTtsMediaSession.stopPlayback?.invoke()
    }
    stopSelf()
  }

  override fun onTaskRemoved(rootIntent: Intent?) { stopCurrentPlayback() }

  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    if (!stopping && playbackId != null && playbackId == GitOutTtsMediaSession.playbackId) {
      stopping = true
      GitOutTtsMediaSession.stopPlayback?.invoke()
    }
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun action(label: String, action: String, icon: Int): Notification.Action =
    Notification.Action.Builder(
      android.graphics.drawable.Icon.createWithResource(this, icon),
      label,
      PendingIntent.getBroadcast(
        this,
        action.hashCode(),
        Intent(this, GitOutTtsMediaActionReceiver::class.java).putExtra(EXTRA_ACTION, action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      ),
    ).build()

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Git Out voice", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Controls for an answer that is already being spoken"
        setShowBadge(false)
      },
    )
  }

  companion object {
    const val CHANNEL_ID = "git-out-voice"
    const val NOTIFICATION_ID = 1207
    const val EXTRA_SESSION_TOKEN = "git_out_media_session_token"
    const val EXTRA_PLAYBACK_ID = "git_out_playback_id"
    const val EXTRA_ACTION = "git_out_media_action"
    const val ACTION_PLAY = "play"
    const val ACTION_PAUSE = "pause"
    const val ACTION_STOP = "stop"

  }

  private fun Intent.mediaSessionToken(): MediaSession.Token? {
    @Suppress("DEPRECATION")
    return if (Build.VERSION.SDK_INT >= 33) {
      getParcelableExtra(EXTRA_SESSION_TOKEN, MediaSession.Token::class.java)
    } else {
      getParcelableExtra<Parcelable>(EXTRA_SESSION_TOKEN) as? MediaSession.Token
    }
  }
}
