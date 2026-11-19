import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { useLanguage } from '../lib/translations';

const SPLASH_SHOWN_SESSION_KEY = 'amr_splash_shown';

export function hasSplashShownThisSession(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return sessionStorage.getItem(SPLASH_SHOWN_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const { t } = useLanguage();
  const [visible, setVisible] = useState<boolean>(() => !hasSplashShownThisSession());
  const [fadingIn, setFadingIn] = useState<boolean>(true);
  const [fadingOut, setFadingOut] = useState<boolean>(false);
  const dismissedRef = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    try {
      sessionStorage.setItem(SPLASH_SHOWN_SESSION_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setFadingOut(true);
    window.setTimeout(() => {
      setVisible(false);
      onComplete();
    }, 420);
  }, [onComplete]);

  useEffect(() => {
    if (!visible) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const rafId = window.requestAnimationFrame(() => {
      setFadingIn(false);
    });

    const autoTimer = window.setTimeout(() => {
      dismiss();
    }, 2350);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(autoTimer);
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t.brand.splashAria}
      onClick={dismiss}
      className={`fixed inset-0 z-[10000] w-[100dvw] h-[100dvh] overflow-hidden bg-gradient-to-b from-[#0b1f3a] via-[#194d70] to-[#071926] select-none cursor-pointer transition-opacity duration-500 ease-out flex flex-col items-center justify-center ${
        fadingOut ? 'opacity-0 pointer-events-none' : fadingIn ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Small corner Skip button */}
      <div
        className="absolute top-0 end-0 z-20"
        style={{
          paddingTop: 'max(0.875rem, env(safe-area-inset-top))',
          paddingInlineEnd: 'max(0.875rem, env(safe-area-inset-right))',
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="min-w-[56px] min-h-[44px] px-4 py-2 rounded-xl bg-black/45 hover:bg-black/65 backdrop-blur-md border border-white/25 text-white text-xs sm:text-sm font-bold shadow-lg transition-colors cursor-pointer"
        >
          {t.brand.splashSkip}
        </button>
      </div>

      {/* Centered Circular Brand Logo */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center space-y-6">
        <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full p-1.5 bg-gradient-to-tr from-blue-500 via-violet-500 to-amber-400 shadow-2xl">
          <BrandLogo className="w-full h-full rounded-full" />
        </div>
        <h2
          className="max-w-2xl text-2xl sm:text-3xl md:text-4xl font-black text-white leading-snug tracking-tight"
          style={{ textShadow: '0 4px 20px rgba(0, 0, 0, 0.55)' }}
        >
          {t.brand.splashWelcome}
        </h2>
      </div>
    </div>
  );
};
