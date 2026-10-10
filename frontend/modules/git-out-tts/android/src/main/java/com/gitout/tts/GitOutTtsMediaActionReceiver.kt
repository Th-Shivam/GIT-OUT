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
    val session = GitOutTtsMediaSession.current ?: return
    val down = KeyEvent(KeyEvent.ACTION_DOWN, keyCode)
    val up = KeyEvent(KeyEvent.ACTION_UP, keyCode)
    session.dispatchMediaButtonEvent(
      Intent(Intent.ACTION_MEDIA_BUTTON).putExtra(Intent.EXTRA_KEY_EVENT, down),
    )
    session.dispatchMediaButtonEvent(
      Intent(Intent.ACTION_MEDIA_BUTTON).putExtra(Intent.EXTRA_KEY_EVENT, up),
    )
  }
}

object GitOutTtsMediaSession {
  @Volatile
  var current: android.media.session.MediaSession? = null
  var playbackId: String? = null
  var stopPlayback: (() -> Unit)? = null
}
