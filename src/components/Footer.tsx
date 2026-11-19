/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Phone, MessageCircle, Heart, Sparkles } from 'lucide-react';
import { PlatformSettings } from '../types';
import { BrandLogo } from './BrandLogo';
import { getLocalizedPlatformName, useLanguage } from '../lib/translations';

interface FooterProps {
  settings: PlatformSettings;
  onSelectTab: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ settings, onSelectTab }) => {
  const { t } = useLanguage();
  const displayPlatformName = getLocalizedPlatformName(settings.platformName, t);
  const teacherDisplayName =
    !settings.teacherName || settings.teacherName === 'Miss Asmaa' || settings.teacherName === 'مس أسماء'
      ? t.brand.teacherName
      : settings.teacherName;
  const contactPhone = settings.teacherPhone || settings.supportPhone || '01069780486';

  return (
    <footer className="mt-20 border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#080D1A] text-slate-600 dark:text-slate-400 text-sm transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center border-b border-slate-200 dark:border-slate-800/60 pb-8">
          {/* Start Column: Platform Identity & Dynamic Academic Year */}
          <div className="space-y-3 text-start">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 to-blue-500 shadow-md shrink-0">
                <BrandLogo className="w-full h-full rounded-full" />
              </div>
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-base">{displayPlatformName}</h3>
                <p className="text-xs text-amber-600 dark:text-amber-400">{t.brand.tagline}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-md">
              {t.footer.desc}
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              {t.footer.copyrightPrefix} {settings.academicYear} {displayPlatformName}
            </p>
          </div>

          {/* Middle Column: Quick Shortcuts */}
          <div className="flex flex-wrap justify-center gap-4 text-xs font-medium">
            <button
              onClick={() => onSelectTab('courses')}
              className="text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              {t.footer.lecturesLink}
            </button>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <button
              onClick={() => onSelectTab('documents')}
              className="text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              {t.footer.notesLink}
            </button>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <button
              onClick={() => onSelectTab('exams')}
              className="text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              {t.footer.examsLink}
            </button>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <button
              onClick={() => onSelectTab('rankings')}
              className="text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              {t.footer.rankingsLink}
            </button>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <button
              onClick={() => onSelectTab('support')}
              className="text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              {t.footer.supportLink}
            </button>
          </div>

          {/* End Column: Developer Signature & Teacher Direct Contact */}
          <div className="flex flex-col items-start md:items-end space-y-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-inner w-full md:w-auto">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>
                  {t.footer.designedBy}{' '}
                  <strong className="text-amber-600 dark:text-amber-400">{t.footer.developerName}</strong>
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                {t.footer.contactAndSupport} {teacherDisplayName} (
                <span dir="ltr" className="text-slate-800 dark:text-slate-300 font-mono">
                  {contactPhone}
                </span>
                )
              </p>
            </div>

            <div className="flex items-center gap-3">
              <a
                href={`https://wa.me/2${contactPhone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{t.footer.whatsappTeacher}</span>
              </a>

              <a
                href={`tel:${contactPhone}`}
                dir="ltr"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/30 text-xs font-semibold transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{contactPhone}</span>
              </a>
            </div>
          </div>
        </div>

        {/* Subfooter */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
          <p>{t.footer.subfooterLeft}</p>
          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <span>{t.footer.craftedWith}</span>
            <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
            <span>{t.footer.forStudentsEgypt}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
