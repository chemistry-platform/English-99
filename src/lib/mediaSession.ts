/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const MEDIA_SESSION_ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'seekbackward',
  'seekforward',
  'seekto',
  'previoustrack',
  'nexttrack',
  'stop',
];

/**
 * Clears navigator.mediaSession metadata, playbackState, and action handlers
 * so Android/iOS notification cards never linger when video is unstarted, paused, or closed.
 */
export function clearMediaSession(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
    for (const action of MEDIA_SESSION_ACTIONS) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // Ignore unsupported MediaSessionAction on older browsers
      }
    }
  } catch {
    // Ignore MediaSession errors
  }
}

interface SyncMediaSessionOptions {
  title: string;
  chapter?: string;
  onPlay: () => void;
  onPause: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onSeekTo?: (timeSeconds: number) => void;
}

/**
 * Binds platform-controlled MediaSession handlers ONLY while video is actively playing.
 */
export function syncPlatformMediaSession(options: SyncMediaSessionOptions): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (typeof window !== 'undefined' && 'MediaMetadata' in window) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: options.title || 'English Lesson',
        artist: 'Miss Asmaa',
        album: options.chapter || 'English with Miss Asmaa',
      });
    }
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.setActionHandler('play', options.onPlay);
    navigator.mediaSession.setActionHandler('pause', options.onPause);
    if (options.onSeekBackward) {
      navigator.mediaSession.setActionHandler('seekbackward', options.onSeekBackward);
    }
    if (options.onSeekForward) {
      navigator.mediaSession.setActionHandler('seekforward', options.onSeekForward);
    }
    if (options.onSeekTo) {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
          options.onSeekTo?.(details.seekTime);
        }
      });
    }
  } catch {
    // Ignore unsupported MediaSession calls
  }
}

/**
 * Pauses a <video> element and strips its src + reloads to release buffers, network, and OS audio session.
 */
export function cleanupVideoElement(videoEl: HTMLVideoElement | null | undefined): void {
  if (!videoEl) return;
  try {
    videoEl.pause();
  } catch {}
  try {
    videoEl.removeAttribute('src');
    videoEl.load();
  } catch {}
}

/**
 * Ensures no other <video> element on the page stays playing simultaneously.
 */
export function pauseOtherVideoElements(activeEl: HTMLVideoElement | null | undefined): void {
  if (typeof document === 'undefined') return;
  try {
    const videos = document.querySelectorAll('video');
    videos.forEach((v) => {
      if (v !== activeEl && !v.paused) {
        try {
          v.pause();
        } catch {}
      }
    });
  } catch {}
}

/**
 * Strips autoplay=1 / autoplay=true parameters from external media URLs (YouTube/Drive).
 */
export function stripAutoplayParam(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.searchParams.has('autoplay')) {
      parsed.searchParams.delete('autoplay');
    }
    return parsed.toString();
  } catch {
    return trimmed.replace(/([?&])autoplay=(?:1|true)(?:&|$)/gi, '$1').replace(/[?&]$/, '');
  }
}
