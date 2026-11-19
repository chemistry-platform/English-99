/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Trophy,
  ChevronDown,
  FileSpreadsheet,
  GraduationCap,
  Search,
  Users,
  Clock,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { ExamOrAssignment, ExamSubmission, UserProfile } from '../types';
import { normalizeGrade } from '../lib/courseHelpers';
import { formatTemplate, getGovernorateDisplayLabel, getGradeDisplayLabel, useLanguage } from '../lib/translations';

interface TopRankingsSectionProps {
  exams: ExamOrAssignment[];
  submissions: ExamSubmission[];
  students: UserProfile[];
  selectedGrade: string;
  currentUser: UserProfile | null;
}

const INITIAL_VISIBLE_CHUNK = 100;

export const TopRankingsSection: React.FC<TopRankingsSectionProps> = ({
  exams,
  submissions,
  students,
  selectedGrade,
  currentUser,
}) => {
  const { t, lang } = useLanguage();
  const numberLocale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const [activeCategory, setActiveCategory] = useState<'sheet' | 'exam'>('sheet');
  const [openItemIds, setOpenItemIds] = useState<Record<string, boolean>>({});
  const [itemSearchMap, setItemSearchMap] = useState<Record<string, string>>({});
  const [visibleLimitMap, setVisibleLimitMap] = useState<Record<string, number>>({});

  const normalizedSelectedGrade = normalizeGrade(selectedGrade);

  // Strictly Sheets & Exams only (no assignments)
  const items = useMemo(() => {
    return exams.filter(
      (item) =>
        item.category === activeCategory &&
        (normalizedSelectedGrade === 'All' || normalizeGrade(item.grade) === normalizedSelectedGrade)
    );
  }, [exams, activeCategory, normalizedSelectedGrade]);

  const studentLookup = useMemo(() => {
    const map = new Map<string, UserProfile>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  // Precompute ranked submissions per exam/sheet ID (from Rank #1 to last, zero max limit)
  const rankedByExamId = useMemo(() => {
    const map = new Map<string, ExamSubmission[]>();
    exams.forEach((ex) => {
      if (ex.category === 'assignment') return;
      const list = submissions.filter((s) => s.examId === ex.id);

      // Keep best submission per student (highest score, earliest tie-breaker)
      const bestByStudent = new Map<string, ExamSubmission>();
      list.forEach((sub) => {
        const key = sub.studentId !== 'guest' ? sub.studentId : `${sub.studentCode}-${sub.studentName}`;
        const existing = bestByStudent.get(key);
        if (
          !existing ||
          sub.score > existing.score ||
          (sub.score === existing.score &&
            new Date(sub.submittedAt).getTime() < new Date(existing.submittedAt).getTime())
        ) {
          bestByStudent.set(key, sub);
        }
      });

      const sorted = Array.from(bestByStudent.values()).sort((a, b) => {
        const pctA = a.totalPoints > 0 ? a.score / a.totalPoints : 0;
        const pctB = b.totalPoints > 0 ? b.score / b.totalPoints : 0;
        if (pctB !== pctA) return pctB - pctA;
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      });

      map.set(ex.id, sorted);
    });
    return map;
  }, [exams, submissions]);

  const toggleItem = (id: string) => {
    setOpenItemIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const sheetsCount = useMemo(
    () =>
      exams.filter(
        (e) =>
          e.category === 'sheet' &&
          (normalizedSelectedGrade === 'All' || normalizeGrade(e.grade) === normalizedSelectedGrade)
      ).length,
    [exams, normalizedSelectedGrade]
  );

  const examsCount = useMemo(
    () =>
      exams.filter(
        (e) =>
          e.category === 'exam' &&
          (normalizedSelectedGrade === 'All' || normalizeGrade(e.grade) === normalizedSelectedGrade)
      ).length,
    [exams, normalizedSelectedGrade]
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Trophy className="w-5 h-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {t.rankings.mainTitle}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {t.rankings.mainSub}
            </p>
          </div>

          {/* Segmented Tabs: Sheets vs Exams */}
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveCategory('sheet')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                activeCategory === 'sheet'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{formatTemplate(t.rankings.tabTopSheets, { count: sheetsCount.toLocaleString(numberLocale) })}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveCategory('exam')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                activeCategory === 'exam'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>{formatTemplate(t.rankings.tabTopExams, { count: examsCount.toLocaleString(numberLocale) })}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Accordion List of Sheets or Exams */}
      {items.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
          {activeCategory === 'sheet' ? (
            <FileSpreadsheet className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          ) : (
            <GraduationCap className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          )}
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {activeCategory === 'sheet' ? t.rankings.emptySheetsTitle : t.rankings.emptyExamsTitle}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t.rankings.emptyCategorySub}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, idx) => {
            const isOpen = !!openItemIds[item.id];
            const rankedStudents = rankedByExamId.get(item.id) || [];
            const searchQuery = (itemSearchMap[item.id] || '').trim().toLowerCase();

            const filteredRanked = searchQuery
              ? rankedStudents
                  .map((sub, rIdx) => ({ sub, rank: rIdx + 1 }))
                  .filter(
                    ({ sub, rank }) =>
                      sub.studentName.toLowerCase().includes(searchQuery) ||
                      sub.studentCode.toLowerCase().includes(searchQuery) ||
                      String(rank) === searchQuery
                  )
              : rankedStudents.map((sub, rIdx) => ({ sub, rank: rIdx + 1 }));

            const currentLimit = visibleLimitMap[item.id] || INITIAL_VISIBLE_CHUNK;
            const visibleRows = filteredRanked.slice(0, currentLimit);
            const hasMore = filteredRanked.length > visibleRows.length;

            return (
              <div
                key={item.id}
                className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden transition-all"
              >
                {/* Item Header Row */}
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  aria-expanded={isOpen}
                  className="w-full px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-4 text-start hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-mono font-black text-sm shrink-0 ${
                        activeCategory === 'sheet'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {item.lessonNumber ? `#${item.lessonNumber}` : `#${idx + 1}`}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {item.lessonTitle && (
                          <>
                            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>{item.lessonTitle}</span>
                            </span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span>{getGradeDisplayLabel(item.grade, t)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{t.rankings.scoreCol}: {item.totalPoints.toLocaleString(numberLocale)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                          <Users className="w-3.5 h-3.5 text-amber-500" />
                          <span>{rankedStudents.length.toLocaleString(numberLocale)} {t.common.studentsWord}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* V-Shaped Chevron Toggle Arrow */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="hidden sm:inline text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {isOpen ? t.rankings.hideList : t.rankings.viewTopRankings}
                    </span>
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                        isOpen
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ChevronDown
                        className={`w-5 h-5 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>
                </button>

                {/* Collapsible Full Ranking Dropdown */}
                {isOpen && (
                  <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 sm:p-6 space-y-4">
                    {/* Search & Total Counter */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <div className="relative flex-1 max-w-md">
                        <input
                          type="text"
                          value={itemSearchMap[item.id] || ''}
                          onChange={(e) =>
                            setItemSearchMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder={t.rankings.searchDetailedPlaceholder}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 ps-9 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                        />
                        <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold font-mono tabular-nums">
                        {t.rankings.totalParticipants}: <strong className="text-slate-900 dark:text-white">{rankedStudents.length.toLocaleString(numberLocale)}</strong>
                        {searchQuery && ` (${t.rankings.resultsWord}: ${filteredRanked.length.toLocaleString(numberLocale)})`}
                      </div>
                    </div>

                    {filteredRanked.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800">
                        {rankedStudents.length === 0
                          ? t.rankings.noSubmissionsYet
                          : t.rankings.noMatchingResults}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
                          <table className="w-full text-start text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400">
                                <th className="py-3 px-4 font-bold">{t.rankings.rankCol}</th>
                                <th className="py-3 px-4 font-bold">{t.rankings.studentCol}</th>
                                <th className="py-3 px-4 font-bold">{t.rankings.codeCol}</th>
                                <th className="py-3 px-4 font-bold">{t.rankings.scoreCol}</th>
                                <th className="py-3 px-4 font-bold">{t.rankings.percentCol}</th>
                                <th className="py-3 px-4 font-bold">{t.rankings.gradingStatusCol}</th>
                                <th className="py-3 px-4 font-bold">{t.rankings.submittedAtCol}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {visibleRows.map(({ sub, rank }) => {
                                const pct =
                                  sub.totalPoints > 0
                                    ? Math.round((sub.score / sub.totalPoints) * 100)
                                    : 0;
                                const isCurrentUserRow =
                                  currentUser &&
                                  (currentUser.id === sub.studentId ||
                                    currentUser.studentCode === sub.studentCode);
                                const linkedStudent = studentLookup.get(sub.studentId);

                                return (
                                  <tr
                                    key={sub.id}
                                    className={`transition-colors ${
                                      isCurrentUserRow
                                        ? 'bg-amber-50/80 dark:bg-amber-500/10'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                                    }`}
                                  >
                                    <td className="py-3 px-4 font-mono tabular-nums font-black">
                                      <span
                                        className={`inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-lg text-xs ${
                                          rank === 1
                                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                                            : rank === 2
                                            ? 'bg-slate-300 dark:bg-slate-600 text-slate-950 dark:text-white'
                                            : rank === 3
                                            ? 'bg-amber-700 text-white'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                        }`}
                                      >
                                        #{rank}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4">
                                      <div className="font-bold text-slate-900 dark:text-white">
                                        {sub.studentName}
                                        {isCurrentUserRow && (
                                          <span className="ms-2 text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                            ({t.rankings.youBadge})
                                          </span>
                                        )}
                                      </div>
                                      {linkedStudent?.governorate && (
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                          {getGovernorateDisplayLabel(linkedStudent.governorate, lang)}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400" dir="ltr">
                                      {sub.studentCode}
                                    </td>
                                    <td className="py-3 px-4 font-mono tabular-nums font-black text-slate-900 dark:text-white">
                                      {sub.score} <span className="text-slate-400 font-normal">/ {sub.totalPoints}</span>
                                    </td>
                                    <td className="py-3 px-4 font-mono tabular-nums font-bold">
                                      <span
                                        className={
                                          pct >= 85
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : pct >= 60
                                            ? 'text-amber-600 dark:text-amber-400'
                                            : 'text-red-600 dark:text-red-400'
                                        }
                                      >
                                        {pct}%
                                      </span>
                                    </td>
                                    <td className="py-3 px-4">
                                      {sub.essayGradingPending ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                          <Clock className="w-3.5 h-3.5" />
                                          <span>{t.rankings.pendingEssay}</span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          <span>{t.rankings.fullyGraded}</span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                      {new Date(sub.submittedAt).toLocaleDateString(numberLocale, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Progressive Load Controls (Zero max cap - supports unlimited thousands of students) */}
                        {hasMore && (
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              {formatTemplate(t.rankings.showingOfStudents, {
                                shown: visibleRows.length.toLocaleString(numberLocale),
                                total: filteredRanked.length.toLocaleString(numberLocale),
                              })}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setVisibleLimitMap((prev) => ({
                                    ...prev,
                                    [item.id]: currentLimit + 200,
                                  }))
                                }
                                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors"
                              >
                                {t.rankings.show200More}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setVisibleLimitMap((prev) => ({
                                    ...prev,
                                    [item.id]: filteredRanked.length,
                                  }))
                                }
                                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
                              >
                                {formatTemplate(t.rankings.showFullList, {
                                  total: filteredRanked.length.toLocaleString(numberLocale),
                                })}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
