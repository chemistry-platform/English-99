/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Trophy,
  Sparkles,
  MapPin,
} from 'lucide-react';
import { HonorStudent } from '../types';
import { getGovernorateDisplayLabel, useLanguage } from '../lib/translations';

interface HonorBoardSectionProps {
  students: HonorStudent[];
}

export const HonorBoardSection: React.FC<HonorBoardSectionProps> = ({ students }) => {
  const { t, lang } = useLanguage();
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-50 via-white to-slate-50 dark:from-slate-900 dark:via-[#16233B] dark:to-slate-900 border border-amber-300 dark:border-amber-500/40 p-8 shadow-2xl text-center">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 shadow-xl">
          <Trophy className="w-8 h-8" />
        </div>

        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
          {t.honor.badgeTitle}
        </span>

        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2">
          {t.honor.mainTitle}
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl mx-auto mt-2 leading-relaxed">
          {t.honor.mainSub}
        </p>

        {/* Benefits Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto mt-6">
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
            <span className="font-bold text-amber-600 dark:text-amber-400 block mb-0.5">{t.honor.card1Title}</span>
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">{t.honor.card1Desc}</span>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
            <span className="font-bold text-blue-600 dark:text-blue-400 block mb-0.5">{t.honor.card2Title}</span>
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">{t.honor.card2Desc}</span>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
            <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-0.5">{t.honor.card3Title}</span>
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">{t.honor.card3Desc}</span>
          </div>
        </div>
      </div>

      {/* Honor Students List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {students.map((st) => {
          const isTop3 = st.rank <= 3;
          return (
            <div
              key={st.id}
              className={`p-6 rounded-3xl border shadow-xl flex items-center justify-between gap-4 transition-all hover:scale-[1.01] ${
                st.rank === 1
                  ? 'bg-gradient-to-r from-amber-50 via-white to-slate-50 dark:from-amber-500/15 dark:via-[#0F172A] dark:to-slate-900 border-amber-400 dark:border-amber-500/50'
                  : st.rank === 2
                  ? 'bg-gradient-to-r from-slate-100 via-white to-slate-50 dark:from-slate-400/10 dark:via-[#0F172A] dark:to-slate-900 border-slate-300 dark:border-slate-500/40'
                  : st.rank === 3
                  ? 'bg-gradient-to-r from-orange-50 via-white to-slate-50 dark:from-amber-700/15 dark:via-[#0F172A] dark:to-slate-900 border-amber-300 dark:border-amber-700/40'
                  : 'bg-white dark:bg-[#0F172A] border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Rank Badge */}
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg shrink-0 ${
                    st.rank === 1
                      ? 'bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 ring-4 ring-amber-500/20'
                      : st.rank === 2
                      ? 'bg-gradient-to-tr from-slate-300 to-slate-100 text-slate-950'
                      : st.rank === 3
                      ? 'bg-gradient-to-tr from-amber-700 to-amber-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {st.rank === 1 ? '🥇' : st.rank === 2 ? '🥈' : st.rank === 3 ? '🥉' : `#${st.rank}`}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{st.studentName}</h3>
                    {isTop3 && <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />}
                  </div>

                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">{st.titleBadge}</p>

                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{getGovernorateDisplayLabel(st.governorate, lang)}</span>
                    </span>
                  </div>

                  {st.notes && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1 italic">
                      "{st.notes}"
                    </p>
                  )}
                </div>
              </div>

              {/* Score pill */}
              <div className="text-center px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shrink-0">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{t.honor.scoreLabel}</span>
                <span className="text-xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
                  {st.score} <span className="text-xs text-slate-500 dark:text-slate-400">/ {st.maxScore}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
