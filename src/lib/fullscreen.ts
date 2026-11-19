/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function getActiveFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitCurrentFullScreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.webkitCurrentFullScreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement ||
    null
  );
}

export function isMobileOrTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  return Boolean(coarse || window.innerWidth < 1024);
}

export async function tryLockLandscapeOnMobile(): Promise<void> {
  if (typeof window === 'undefined' || !isMobileOrTouchDevice()) return;
  try {
    const orientation = window.screen?.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('landscape');
    }
  } catch {
    // Ignore unsupported browsers (iOS Safari / desktop / non-fullscreen restrictions)
  }
}

export function tryUnlockOrientation(): void {
  if (typeof window === 'undefined') return;
  try {
    const orientation = window.screen?.orientation as ScreenOrientation & {
      unlock?: () => void;
    };
    if (orientation && typeof orientation.unlock === 'function') {
      orientation.unlock();
    }
  } catch {
    // Ignore
  }
}

export async function requestCrossBrowserFullscreen(
  containerEl: HTMLElement | null,
  options?: {
    videoEl?: HTMLVideoElement | null;
    lockLandscapeOnMobile?: boolean;
  }
): Promise<'native' | 'css-fallback'> {
  if (!containerEl || containerEl.tagName === 'VIDEO') return 'css-fallback';

  const el = containerEl as HTMLElement & {
    webkitRequestFullscreen?: (options?: any) => Promise<void> | void;
    webkitRequestFullScreen?: (options?: any) => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  let enteredNative = false;

  try {
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen();
      enteredNative = Boolean(getActiveFullscreenElement());
    } else if (typeof el.webkitRequestFullscreen === 'function') {
      await Promise.resolve(el.webkitRequestFullscreen());
      enteredNative = Boolean(getActiveFullscreenElement());
      if (!enteredNative) {
        await new Promise((r) => setTimeout(r, 50));
        enteredNative = Boolean(getActiveFullscreenElement());
      }
    } else if (typeof el.webkitRequestFullScreen === 'function') {
      await Promise.resolve(el.webkitRequestFullScreen());
      enteredNative = Boolean(getActiveFullscreenElement());
      if (!enteredNative) {
        await new Promise((r) => setTimeout(r, 50));
        enteredNative = Boolean(getActiveFullscreenElement());
      }
    } else if (typeof el.mozRequestFullScreen === 'function') {
      await Promise.resolve(el.mozRequestFullScreen());
      enteredNative = Boolean(getActiveFullscreenElement()) || true;
    } else if (typeof el.msRequestFullscreen === 'function') {
      await Promise.resolve(el.msRequestFullscreen());
      enteredNative = Boolean(getActiveFullscreenElement()) || true;
    }
  } catch {
    enteredNative = false;
  }

  if (enteredNative) {
    if (options?.lockLandscapeOnMobile) {
      await tryLockLandscapeOnMobile();
    }
    return 'native';
  }

  // iPhone / iOS Safari does not allow fullscreen on wrapper divs;
  // use CSS viewport fullscreen fallback so platform controls remain visible (never webkitEnterFullscreen on <video>).
  if (options?.lockLandscapeOnMobile) {
    await tryLockLandscapeOnMobile();
  }
  return 'css-fallback';
}

export async function exitCrossBrowserFullscreen(
  _videoEl?: HTMLVideoElement | null
): Promise<void> {
  if (typeof document === 'undefined') return;
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitCancelFullScreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };

  try {
    if (doc.fullscreenElement && typeof doc.exitFullscreen === 'function') {
      await doc.exitFullscreen();
    } else if (getActiveFullscreenElement()) {
      if (typeof doc.webkitExitFullscreen === 'function') {
        await Promise.resolve(doc.webkitExitFullscreen());
      } else if (typeof doc.webkitCancelFullScreen === 'function') {
        await Promise.resolve(doc.webkitCancelFullScreen());
      } else if (typeof doc.mozCancelFullScreen === 'function') {
        await Promise.resolve(doc.mozCancelFullScreen());
      } else if (typeof doc.msExitFullscreen === 'function') {
        await Promise.resolve(doc.msExitFullscreen());
      }
    }
  } catch {
    // Ignore
  }

  tryUnlockOrientation();
}
