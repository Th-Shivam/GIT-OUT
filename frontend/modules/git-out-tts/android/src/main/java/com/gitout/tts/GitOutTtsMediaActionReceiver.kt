package com.gitout.tts

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.view.KeyEvent

/** Delivers notification actions through the same MediaSession callback path. */
class GitOutTtsMediaActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val keyCode = when (intent.getStringExtra(GitOutTtsPlaybackService.EXTRA_ACTION)) {
      GitOutTtsPlaybackService.ACTION_PLAY -> KeyEvent.KEYCODE_MEDIA_PLAY
      GitOutTtsPlaybackService.ACTION_PAUSE -> KeyEvent.KEYCODE_MEDIA_PAUSE
      GitOutTtsPlaybackService.ACTION_STOP -> KeyEvent.KEYCODE_MEDIA_STOP
      else -> return
    }
    val controller = GitOutTtsMediaSession.current?.controller ?: return
    val down = KeyEvent(KeyEvent.ACTION_DOWN, keyCode)
    val up = KeyEvent(KeyEvent.ACTION_UP, keyCode)
    // MediaSession owns the callback, but media-button dispatch is exposed by
    // its controller. Reuse that controller so notification actions and
    // headset events follow the same native callback path without creating a
    // second session or opening the microphone.
    try {
      controller.dispatchMediaButtonEvent(down)
      controller.dispatchMediaButtonEvent(up)
    } catch (_: IllegalStateException) {
      // The module may be releasing the session at the same time as a stale
      // notification broadcast. There is no active session to handle it.
    }
  }
}

object GitOutTtsMediaSession {
  @Volatile
  var current: android.media.session.MediaSession? = null
  var playbackId: String? = null
  var stopPlayback: (() -> Unit)? = null
}
