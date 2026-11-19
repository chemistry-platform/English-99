import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useLanguage } from '../lib/translations';

const IOSInstallGuideModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 p-5 sm:p-6 shadow-2xl space-y-4 text-start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/icons/icon-192.png"
              alt={t.brand.platformName}
              className="w-11 h-11 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {t.pwa.iosTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.pwa.iosSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
            aria-label={t.common.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          <li className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
            <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">
              1
            </span>
            <div className="flex-1">
              <span>{t.pwa.iosStep1Prefix}</span>
              <strong className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <span>{t.pwa.iosStep1Highlight}</span>
                <Share className="w-4 h-4 inline" />
              </strong>
              <span>{t.pwa.iosStep1Suffix}</span>
            </div>
          </li>
          <li className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
            <span className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center shrink-0">
              2
            </span>
            <div className="flex-1">
              <span>{t.pwa.iosStep2Prefix}</span>
              <strong className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <span>{t.pwa.iosStep2Highlight}</span>
                <PlusSquare className="w-4 h-4 inline" />
              </strong>
              <span>{t.pwa.iosStep2Suffix}</span>
            </div>
          </li>
          <li className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
            <span className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0">
              3
            </span>
            <div className="flex-1">
              <span>{t.pwa.iosStep3Prefix}</span>
              <strong className="text-emerald-600 dark:text-emerald-400">{t.pwa.iosStep3Highlight}</strong>
              <span>{t.pwa.iosStep3Suffix}</span>
            </div>
          </li>
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[46px] rounded-2xl bg-[#194d70] hover:bg-[#1e5c86] text-white font-bold text-sm shadow-lg transition-colors cursor-pointer"
        >
          {t.pwa.gotIt}
        </button>
      </div>
    </div>
  );
};

export const PWAInstallNavButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { t } = useLanguage();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || (!isInstallable && !isIOS)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            void install();
          } else {
            setShowIOSGuide(true);
          }
        }}
        className="inline-flex items-center gap-1.5 min-h-[36px] md:h-9 px-3 rounded-xl bg-[#194d70] hover:bg-[#1f5e89] text-white border border-sky-400/35 text-xs font-bold shadow-md transition-colors whitespace-nowrap cursor-pointer"
        title={t.pwa.installTitle}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">{t.pwa.installApp}</span>
        <span className="sm:hidden">{t.pwa.installShort}</span>
      </button>

      <IOSInstallGuideModal isOpen={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    </>
  );
};

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isBannerDismissed, install, dismissBanner } =
    usePWAInstall();
  const { t } = useLanguage();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || isBannerDismissed || (!isInstallable && !isIOS)) {
    return (
      <IOSInstallGuideModal isOpen={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    );
  }

  return (
    <>
      <div
        role="region"
        aria-label={t.pwa.installApp}
        className="fixed bottom-4 start-4 end-4 sm:end-auto sm:start-5 sm:w-[400px] z-[90] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="rounded-2xl bg-[#0F172A]/95 dark:bg-[#0F172A]/95 text-white border border-sky-400/35 shadow-2xl backdrop-blur-md p-3.5 flex items-center gap-3">
          <img
            src="/icons/icon-192.png"
            alt={t.brand.platformName}
            className="w-12 h-12 rounded-xl object-cover border border-white/15 shrink-0"
          />

          <div className="flex-1 min-w-0 text-start">
            <h4 className="text-xs sm:text-sm font-black text-white truncate">
              {t.pwa.installPlatformApp}
            </h4>
            <p className="text-[11px] text-slate-300 leading-snug line-clamp-2 mt-0.5">
              {isIOS ? t.pwa.bannerIosDesc : t.pwa.bannerDefaultDesc}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isInstallable) {
                  void install();
                } else {
                  setShowIOSGuide(true);
                }
              }}
              className="min-h-[44px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {isInstallable ? (
                <Download className="w-4 h-4 shrink-0" />
              ) : (
                <Smartphone className="w-4 h-4 shrink-0" />
              )}
              <span>{t.pwa.installApp}</span>
            </button>

            <button
              type="button"
              onClick={dismissBanner}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              aria-label={t.pwa.closeBannerAria}
              title={t.common.close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <IOSInstallGuideModal isOpen={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    </>
  );
};
