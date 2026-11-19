/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Play,
  CheckCircle,
  Search,
  Lock,
  Clock,
  BookOpen,
  Sparkles,
  Zap,
  Wallet,
  CreditCard,
  AlertCircle,
  Check,
  Calendar,
  Layers,
  ArrowRight,
  Eye,
} from 'lucide-react';
import { CourseLecture, UserProfile } from '../types';
import { platformDB } from '../lib/storage';
import { getCourseCover, getCourseLessons, normalizeGrade } from '../lib/courseHelpers';
import { formatCourseDurationHHMMSS } from '../lib/formatDuration';
import { Modal } from './Modal';
import { formatTemplate, getGradeDisplayLabel, useLanguage } from '../lib/translations';

interface CoursesSectionProps {
  courses: CourseLecture[];
  currentUser: UserProfile | null;
  selectedGrade: string;
  viewMode?: 'all' | 'my-courses';
  onChangeViewMode?: (mode: 'all' | 'my-courses') => void;
  onEnterCourse: (lecture: CourseLecture) => void;
  onOpenAuth: () => void;
  completedLectures: string[];
  onDataChanged?: () => void;
  onOpenWallet?: () => void;
}

export const CoursesSection: React.FC<CoursesSectionProps> = ({
  courses,
  currentUser,
  selectedGrade,
  viewMode = 'all',
  onChangeViewMode,
  onEnterCourse,
  onOpenAuth,
  completedLectures,
  onDataChanged,
  onOpenWallet,
}) => {
  const { t } = useLanguage();
  const [filterType, setFilterType] = useState<'all' | 'my-courses' | 'free' | 'paid'>(
    viewMode === 'my-courses' ? 'my-courses' : 'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [brokenCoverIds, setBrokenCoverIds] = useState<Record<string, boolean>>({});

  // Course Unlock / Enroll Modal state
  const [selectedCourseToUnlock, setSelectedCourseToUnlock] = useState<CourseLecture | null>(null);
  const [cardPinInput, setCardPinInput] = useState('');
  const [unlockMessage, setUnlockMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmittingEnroll, setIsSubmittingEnroll] = useState(false);

  useEffect(() => {
    setFilterType(viewMode === 'my-courses' ? 'my-courses' : 'all');
  }, [viewMode]);

  const checkIsEnrolled = (lecture: CourseLecture) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'secretary') return true;
    const enrolled = currentUser.enrolledCourses || [];
    return enrolled.includes(lecture.id);
  };

  const normalizedSelectedGrade = normalizeGrade(selectedGrade);

  const filtered = courses.filter((c) => {
    if (
      normalizedSelectedGrade !== 'All' &&
      normalizeGrade(c.grade) !== normalizedSelectedGrade
    ) {
      return false;
    }
    if (filterType === 'my-courses' && !checkIsEnrolled(c)) return false;
    if (filterType === 'free' && !c.isFree) return false;
    if (filterType === 'paid' && c.isFree) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        c.chapter.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCardAction = (lecture: CourseLecture) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (checkIsEnrolled(lecture)) {
      onEnterCourse(lecture);
    } else {
      setSelectedCourseToUnlock(lecture);
      setUnlockMessage(null);
      setCardPinInput('');
    }
  };

  const handleReadContentsOnly = (lecture: CourseLecture) => {
    onEnterCourse(lecture);
  };

  const handleEnrollWithBalance = async () => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (!selectedCourseToUnlock) return;

    setIsSubmittingEnroll(true);
    setUnlockMessage(null);
    try {
      const res = await platformDB.enrollUserInCourseAsync(
        selectedCourseToUnlock.id,
        currentUser.id
      );

      if (res.success) {
        setUnlockMessage({ type: 'success', text: res.message });
        onDataChanged?.();
        setTimeout(() => {
          const lec = selectedCourseToUnlock;
          setSelectedCourseToUnlock(null);
          onEnterCourse(lec);
        }, 900);
      } else {
        setUnlockMessage({ type: 'error', text: res.message });
      }
    } finally {
      setIsSubmittingEnroll(false);
    }
  };

  const handleRedeemCodeForCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (!cardPinInput.trim() || !selectedCourseToUnlock) return;

    setIsSubmittingEnroll(true);
    setUnlockMessage(null);
    try {
      const res = await platformDB.redeemCodeForUserAsync(cardPinInput.trim(), currentUser.id);

      if (res.success) {
        let finalMessage = res.message;
        const updatedUser = platformDB.getCurrentUser();
        const enrolled = updatedUser?.enrolledCourses || [];
        if (!enrolled.includes(selectedCourseToUnlock.id)) {
          if (updatedUser && (updatedUser.balance || 0) >= selectedCourseToUnlock.price) {
            const enrollRes = await platformDB.enrollUserInCourseAsync(
              selectedCourseToUnlock.id,
              currentUser.id
            );
            if (enrollRes.success) {
              finalMessage = enrollRes.message;
            }
          }
        }

        setUnlockMessage({ type: 'success', text: finalMessage });
        onDataChanged?.();
        setTimeout(() => {
          const lec = selectedCourseToUnlock;
          setSelectedCourseToUnlock(null);
          onEnterCourse(lec);
        }, 900);
      } else {
        setUnlockMessage({ type: 'error', text: res.message });
      }
    } finally {
      setIsSubmittingEnroll(false);
    }
  };

  const selectFilter = (next: 'all' | 'my-courses' | 'free' | 'paid') => {
    setFilterType(next);
    if (next === 'my-courses') {
      onChangeViewMode?.('my-courses');
    } else if (next === 'all') {
      onChangeViewMode?.('all');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            <h2 className="text-[20px] sm:text-2xl font-bold text-slate-900 dark:text-white">
              {filterType === 'my-courses' ? t.courses.pageTitleMyEnrolled : t.courses.pageTitleCatalog}
            </h2>
          </div>
          <p className="text-[14px] sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {t.courses.pageSubtitleCatalog}
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-[13px] sm:text-xs font-semibold overflow-x-auto max-w-full shrink-0 no-scrollbar">
          <button
            type="button"
            onClick={() => selectFilter('all')}
            className={`min-h-[44px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.courses.tabAll}
          </button>
          {currentUser && (
            <button
              type="button"
              onClick={() => selectFilter('my-courses')}
              className={`min-h-[44px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'my-courses'
                  ? 'bg-emerald-600 text-white font-bold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.courses.tabMine}
            </button>
          )}
          <button
            type="button"
            onClick={() => selectFilter('free')}
            className={`min-h-[44px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
              filterType === 'free'
                ? 'bg-emerald-600 text-white font-bold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            {t.courses.filterFree}
          </button>
          <button
            type="button"
            onClick={() => selectFilter('paid')}
            className={`min-h-[44px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
              filterType === 'paid'
                ? 'bg-blue-600 text-white font-bold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.courses.filterPaid}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.courses.searchDetailedPlaceholder}
          className="w-full bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3.5 ps-11 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
        <Search className="w-5 h-5 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
      </div>

      {/* Courses Responsive Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
          <BookOpen className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <h4 className="text-slate-900 dark:text-white font-bold text-base">{t.courses.emptyTitle}</h4>
          <p className="text-[14px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t.courses.emptyDescFilter}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {filtered.map((lecture, idx) => {
            const isCompleted = completedLectures.includes(lecture.id);
            const isEnrolled = checkIsEnrolled(lecture);
            const lessons = getCourseLessons(lecture);
            const coverSrc = getCourseCover(lecture, idx);
            const isBroken = Boolean(brokenCoverIds[lecture.id]);

            return (
              <div
                key={lecture.id}
                onClick={() => handleCardAction(lecture)}
                className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden hover:border-amber-500/60 shadow-sm hover:shadow-xl cursor-pointer group flex flex-col transition-all duration-200"
              >
                {/* Course Cover Image */}
                <div className="relative aspect-video bg-slate-900 overflow-hidden">
                  {!isBroken ? (
                    <img
                      src={coverSrc}
                      alt={lecture.title}
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenCoverIds((prev) => ({ ...prev, [lecture.id]: true }))}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-4 text-center">
                      <BookOpen className="w-10 h-10 text-amber-400 mb-2" />
                      <span className="text-xs font-bold text-white line-clamp-2">{lecture.title}</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                  {/* Price / Subscription Badge */}
                  <div className="absolute top-3 start-3 flex items-center gap-2">
                    {lecture.isFree ? (
                      <span className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold shadow">
                        {t.courses.freeCourseBadge}
                      </span>
                    ) : isEnrolled ? (
                      <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>{t.courses.enrolledShort}</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold shadow tabular-nums">
                        {lecture.price} {t.common.currency}
                      </span>
                    )}
                  </div>

                  {isCompleted && (
                    <div className="absolute top-3 end-3 px-2.5 py-1 rounded-xl bg-blue-600/90 text-white text-[11px] font-bold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{t.courses.completedBadge}</span>
                    </div>
                  )}

                  {/* Bottom Cover Metadata */}
                  <div className="absolute bottom-3 start-3 end-3 flex items-center justify-between text-[11px] text-slate-200">
                    <span className="truncate font-medium">{lecture.chapter}</span>
                    <span className="font-mono tabular-nums shrink-0 flex items-center gap-1" dir="ltr">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      {formatCourseDurationHHMMSS(lecture)}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{getGradeDisplayLabel(lecture.grade, t)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Layers className="w-3.5 h-3.5 text-blue-500" />
                        {lessons.length} {t.courses.lessonsCapital}
                      </span>
                    </div>

                    <h3 className="text-[20px] sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
                      {lecture.title}
                    </h3>

                    <p className="text-[14px] sm:text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {lecture.description}
                    </p>

                    <div className="pt-1 flex items-center gap-1.5 text-[12px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="truncate">{lecture.scheduleText || t.courses.scheduleDefault}</span>
                    </div>
                  </div>

                  {/* Primary Action Buttons */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    {isEnrolled ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCardAction(lecture);
                        }}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[15px] sm:text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>{t.courses.enterCourse}</span>
                        <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardAction(lecture);
                          }}
                          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[14px] sm:text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Lock className="w-4 h-4" />
                          <span>
                            {lecture.isFree
                              ? t.courses.enrollFreeToEnter
                              : formatTemplate(t.courses.enterPaidCourseLabel, { price: lecture.price })}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReadContentsOnly(lecture);
                          }}
                          className="w-full min-h-[40px] py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-500" />
                          <span>{t.courses.previewSyllabusBtn}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* COURSE ENROLLMENT / UNLOCK MODAL */}
      <Modal
        isOpen={Boolean(selectedCourseToUnlock)}
        onClose={() => setSelectedCourseToUnlock(null)}
        maxWidthClass="max-w-lg"
        overlayClassName="z-50 bg-black/75 dark:bg-black/85 backdrop-blur-md"
        panelClassName="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700"
        headerClassName="px-4 sm:px-5 py-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-[#1E293B] border-b border-slate-200 dark:border-slate-800"
        bodyClassName="p-5 sm:p-6 space-y-5"
        headerContent={
          selectedCourseToUnlock ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block truncate">
                  {selectedCourseToUnlock.chapter}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {selectedCourseToUnlock.title}
                </h3>
              </div>
            </div>
          ) : null
        }
      >
        {selectedCourseToUnlock && (
          <>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Wallet className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">{t.app.currentWalletBalance}</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                    {currentUser?.balance || 0} {t.common.currency}
                  </span>
                </div>
              </div>

              <div className="text-end">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">{t.courses.subscriptionPriceLabel}</span>
                <span className="text-base font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                  {selectedCourseToUnlock.price} {t.common.currency}
                </span>
              </div>
            </div>

            {unlockMessage && (
              <div
                className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
                  unlockMessage.type === 'success'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                    : 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/40'
                }`}
              >
                {unlockMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                )}
                <span>{unlockMessage.text}</span>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <span>
                  {selectedCourseToUnlock.isFree
                    ? t.app.instantFreeTitle
                    : t.app.instantWalletTitle}
                </span>
              </h4>

              <button
                type="button"
                onClick={() => void handleEnrollWithBalance()}
                disabled={isSubmittingEnroll}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-slate-950" />
                <span>
                  {selectedCourseToUnlock.isFree
                    ? t.courses.confirmFreeEnterBtn
                    : formatTemplate(t.courses.confirmPaidDeductBtn, { price: selectedCourseToUnlock.price })}
                </span>
              </button>

              {!selectedCourseToUnlock.isFree &&
                (currentUser?.balance || 0) < selectedCourseToUnlock.price &&
                onOpenWallet && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCourseToUnlock(null);
                      onOpenWallet();
                    }}
                    className="w-full text-[11px] text-amber-600 dark:text-amber-400 hover:underline text-center font-semibold pt-1 cursor-pointer"
                  >
                    {t.app.insufficientBalanceLink}
                  </button>
                )}
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              <span className="flex-shrink mx-4 text-xs font-bold text-slate-500">{t.common.or}</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{t.courses.option2ScratchCard}</span>
              </h4>

              <form onSubmit={handleRedeemCodeForCourse} className="flex gap-2">
                <input
                  type="text"
                  dir="ltr"
                  required
                  value={cardPinInput}
                  onChange={(e) => setCardPinInput(e.target.value.toUpperCase())}
                  placeholder={t.app.redeemPlaceholder}
                  className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isSubmittingEnroll || !cardPinInput.trim()}
                  className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  {t.app.redeemBtn}
                </button>
              </form>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};
