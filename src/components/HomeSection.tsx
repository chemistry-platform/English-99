/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  GraduationCap,
  CheckSquare,
  Wallet,
  Play,
  ArrowRight,
  TrendingUp,
  Sliders,
  Clock,
  Flame,
  Users,
  Eye,
  Lock,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { UserProfile, CourseLecture, PlatformSettings, ExamSubmission } from '../types';
import { getCourseCover, getCourseLessons } from '../lib/courseHelpers';
import { formatCourseDurationHHMMSS } from '../lib/formatDuration';
import { BrandLogo } from './BrandLogo';
import { formatTemplate, getGradeDisplayLabel, useLanguage } from '../lib/translations';

interface HomeSectionProps {
  currentUser: UserProfile | null;
  settings: PlatformSettings;
  courses: CourseLecture[];
  totalExams: number;
  totalAssignments: number;
  submissions?: ExamSubmission[];
  onSelectTab: (tab: string) => void;
  onOpenLecture: (lecture: CourseLecture) => void;
  onOpenAdmin: () => void;
  isDarkTheme?: boolean;
}

export const HomeSection: React.FC<HomeSectionProps> = ({
  currentUser,
  settings,
  courses,
  totalExams,
  totalAssignments,
  submissions = [],
  onSelectTab,
  onOpenLecture,
  onOpenAdmin,
  isDarkTheme = true,
}) => {
  const { t } = useLanguage();
  const [chartView, setChartView] = useState<'scores' | 'attendance' | 'distribution'>('scores');

  // Real-time Supabase-synced progress computation for signed-in student
  const completedLecturesCount = currentUser
    ? new Set(currentUser.completedLectures || []).size
    : 0;
  const completedAssessmentsCount = currentUser
    ? new Set(
        submissions
          .filter((s) => s.studentId === currentUser.id)
          .map((s) => s.examId)
      ).size
    : 0;
  const totalTrackableSteps = Math.max(1, courses.length + totalExams + totalAssignments);
  const completedStepsCount = Math.min(
    totalTrackableSteps,
    completedLecturesCount + completedAssessmentsCount
  );
  const progressPercent = Math.min(
    100,
    Math.round((completedStepsCount / totalTrackableSteps) * 100)
  );
  const ringRadius = 40;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (progressPercent / 100) * ringCircumference;

  const gridStroke = isDarkTheme ? '#1E293B' : '#E2E8F0';
  const axisStroke = isDarkTheme ? '#64748B' : '#475569';
  const tooltipStyle = {
    backgroundColor: isDarkTheme ? '#0F172A' : '#FFFFFF',
    borderColor: isDarkTheme ? '#334155' : '#CBD5E1',
    borderRadius: '12px',
    color: isDarkTheme ? '#FFFFFF' : '#0F172A',
    direction: 'ltr' as const,
  };

  // Realistic English analytics data for Recharts
  const scoresData = [
    { name: t.home.exam1Label, average: 78, top: 100, student: currentUser ? 88 : 80 },
    { name: t.home.exam2Label, average: 82, top: 100, student: currentUser ? 92 : 85 },
    { name: t.home.exam3Label, average: 75, top: 98, student: currentUser ? 85 : 79 },
    { name: t.home.exam4Label, average: 85, top: 100, student: currentUser ? 95 : 88 },
    { name: t.home.exam5Label, average: 79, top: 100, student: currentUser ? 90 : 82 },
    { name: t.home.exam6Label, average: 83, top: 100, student: currentUser ? 94 : 86 },
  ];

  const attendanceData = [
    { name: formatTemplate(t.home.weekLabel, { n: 1 }), attendance: 96, homeworks: 92 },
    { name: formatTemplate(t.home.weekLabel, { n: 2 }), attendance: 94, homeworks: 90 },
    { name: formatTemplate(t.home.weekLabel, { n: 3 }), attendance: 97, homeworks: 95 },
    { name: formatTemplate(t.home.weekLabel, { n: 4 }), attendance: 92, homeworks: 88 },
    { name: formatTemplate(t.home.weekLabel, { n: 5 }), attendance: 98, homeworks: 96 },
  ];

  const distributionData = [
    { name: t.home.distExcellent, count: 48, fill: '#10B981' },
    { name: t.home.distVeryGood, count: 32, fill: '#3B82F6' },
    { name: t.home.distGood, count: 14, fill: '#F59E0B' },
    { name: t.home.distNeedsWork, count: 6, fill: '#EF4444' },
  ];

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* 0. Student Live Progress Tracking Widget (Linked live to Supabase profiles + exam_results) */}
      {currentUser?.role === 'student' && (
        <section
          aria-label={t.home.progressTrackerAria}
          className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-5"
        >
          <div className="flex-1 text-start space-y-2 w-full">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {t.home.liveProgressBadge}
            </span>
            <h2 className="text-[20px] sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-snug">
              {formatTemplate(t.home.welcomeBackStudent, { name: currentUser.fullName })}
            </h2>
            <p className="text-[14px] sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.home.milestonesSummaryBefore}{' '}
              <strong className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {completedStepsCount}
              </strong>{' '}
              {t.home.milestonesSummaryMiddle}{' '}
              <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                {totalTrackableSteps}
              </strong>{' '}
              {formatTemplate(t.home.milestonesSummaryAfter, {
                lectures: completedLecturesCount,
                assessments: completedAssessmentsCount,
              })}
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => onSelectTab('courses')}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[14px] sm:text-xs transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>{t.home.continueLessons}</span>
              </button>
            </div>
          </div>

          {/* Circular Progress Bar */}
          <div className="shrink-0 flex items-center gap-4 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 w-full sm:w-auto justify-center">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                <circle
                  cx="50"
                  cy="50"
                  r={ringRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="9"
                  className="text-slate-200 dark:text-slate-800"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={ringRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  className="text-amber-500 transition-[stroke-dashoffset] duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[20px] font-black font-mono tabular-nums text-slate-900 dark:text-white leading-none">
                  {progressPercent}%
                </span>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
                  {t.home.completedPercentLabel}
                </span>
              </div>
            </div>

            <div className="sm:hidden text-start space-y-1">
              <p className="text-[14px] font-bold text-slate-900 dark:text-white">{t.home.stepCounter}</p>
              <p className="text-[15px] font-mono font-black tabular-nums text-amber-600 dark:text-amber-400">
                {completedStepsCount} / {totalTrackableSteps}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 1. Hero Banner with Brand Logo & English Visuals */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-white via-amber-50/50 to-blue-50/60 dark:from-slate-900 dark:via-[#111C35] dark:to-[#0A1020] border border-slate-200 dark:border-slate-800 shadow-xl dark:shadow-2xl p-5 sm:p-10">
        {/* Glow ambient effects */}
        <div className="absolute top-0 start-1/4 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 end-10 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col-reverse lg:flex-row items-center justify-between gap-6 sm:gap-8">
          {/* Text and Actions */}
          <div className="flex-1 text-start space-y-4 w-full">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-bold shadow-inner">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.home.heroBadge}</span>
            </div>

            <h2 className="text-[22px] sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              {t.home.heroTitleBefore}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 dark:from-amber-400 dark:via-amber-300 dark:to-amber-500">
                {t.home.heroTitleHighlight}
              </span>
            </h2>

            <p className="text-slate-600 dark:text-slate-300 text-[15px] sm:text-base leading-relaxed max-w-2xl">
              {formatTemplate(t.home.heroDesc, { year: settings.academicYear })}
            </p>

            {/* Quick Action Buttons */}
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 pt-2">
              <button
                onClick={() => onSelectTab('courses')}
                className="flex items-center justify-center gap-2 min-h-[46px] px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold text-[15px] sm:text-sm shadow-xl shadow-blue-600/30 transition-all transform hover:scale-[1.02] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{t.home.browseCoursesBtn}</span>
              </button>

              <button
                onClick={() => onSelectTab('exams')}
                className="flex items-center justify-center gap-2 min-h-[46px] px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-[15px] sm:text-sm shadow-xl shadow-amber-500/25 transition-all transform hover:scale-[1.02] cursor-pointer"
              >
                <GraduationCap className="w-4 h-4" />
                <span>{t.home.examsAndQbBtn}</span>
              </button>

              {(currentUser?.role === 'admin' || currentUser?.role === 'secretary') && (
                <button
                  onClick={onOpenAdmin}
                  className="flex items-center justify-center gap-2 min-h-[46px] px-5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-bold text-[15px] sm:text-sm transition-all cursor-pointer"
                >
                  <Sliders className="w-4 h-4" />
                  <span>{t.home.teacherPanelBtn}</span>
                </button>
              )}
            </div>
          </div>

          {/* Circular Brand Logo Frame */}
          <div className="relative shrink-0 select-none">
            <div className="w-44 h-44 sm:w-60 sm:h-60 rounded-full p-1.5 bg-gradient-to-tr from-amber-500 via-blue-500 to-amber-300 shadow-2xl shadow-blue-600/30 relative">
              <BrandLogo className="w-full h-full rounded-full" />

              {/* Floating badges around the logo */}
              <div className="absolute -bottom-2 start-2 px-3 py-1 rounded-xl bg-white/95 dark:bg-slate-950/90 backdrop-blur-md border border-amber-500/40 text-[11px] font-bold text-amber-600 dark:text-amber-400 shadow-xl flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>{t.brand.teacherName}</span>
              </div>

              <div className="absolute -top-1 end-2 px-2.5 py-0.5 rounded-lg bg-blue-600/90 text-white text-[10px] font-bold shadow-md">
                {t.brand.badgeYearPrefix} {settings.academicYear}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Courses Showcase Immediately Below Hero */}
      <section aria-label={t.home.availableCoursesAria} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-xl font-black text-slate-900 dark:text-white">
                {t.home.availableCoursesTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.home.availableCoursesDesc}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab('courses')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5 font-bold transition-colors cursor-pointer"
          >
            <span>{formatTemplate(t.home.viewAllCoursesCount, { count: courses.length })}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.slice(0, 6).map((lecture, idx) => {
            const lessons = getCourseLessons(lecture);
            const coverSrc = getCourseCover(lecture, idx);
            const isEnrolled = Boolean(
              currentUser &&
                (currentUser.role === 'admin' ||
                  currentUser.role === 'secretary' ||
                  (currentUser.enrolledCourses || []).includes(lecture.id))
            );

            return (
              <div
                key={lecture.id}
                onClick={() => onOpenLecture(lecture)}
                className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden hover:border-amber-500/60 shadow-sm hover:shadow-xl cursor-pointer group flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="relative aspect-video bg-slate-900 overflow-hidden">
                    <img
                      src={coverSrc}
                      alt={lecture.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                    <div className="absolute top-3 start-3">
                      {lecture.isFree ? (
                        <span className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold shadow">
                          {t.common.free}
                        </span>
                      ) : isEnrolled ? (
                        <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow">
                          {t.courses.enrolledBadge}
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold shadow tabular-nums">
                          {lecture.price} {t.common.currency}
                        </span>
                      )}
                    </div>
                    <div className="absolute bottom-3 start-3 end-3 flex items-center justify-between text-[11px] text-slate-200">
                      <span className="truncate font-semibold">{lecture.chapter}</span>
                      <span className="font-mono tabular-nums shrink-0 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-lg" dir="ltr">
                        <Clock className="w-3 h-3 text-amber-400" />
                        {formatCourseDurationHHMMSS(lecture)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{getGradeDisplayLabel(lecture.grade, t)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Layers className="w-3.5 h-3.5 text-blue-500" />
                        {lessons.length} {t.home.lessonsCapital}
                      </span>
                    </div>
                    <h4 className="text-base font-extrabold text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      {lecture.title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {lecture.description}
                    </p>
                  </div>
                </div>

                <div className="px-4 sm:px-5 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                    {isEnrolled ? (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{t.courses.enterCourse}</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t.home.previewContents}</span>
                      </>
                    )}
                  </span>
                  {!isEnrolled && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      <Lock className="w-3 h-3" />
                      <span>{t.home.subRequired}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Interactive Quick Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Lectures Card */}
        <div
          onClick={() => onSelectTab('courses')}
          className="p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 shadow-lg cursor-pointer group transition-all"
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">{t.home.lecturesStatLabel}</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{courses.length}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t.home.lecturesStatDesc}</p>
        </div>

        {/* Exams Card */}
        <div
          onClick={() => onSelectTab('exams')}
          className="p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-lg cursor-pointer group transition-all"
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">{t.home.statExams}</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{totalExams}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t.home.examsStatDesc}</p>
        </div>

        {/* Assignments Card */}
        <div
          onClick={() => onSelectTab('assignments')}
          className="p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 shadow-lg cursor-pointer group transition-all"
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">{t.home.statAssignments}</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{totalAssignments}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t.home.assignStatDesc}</p>
        </div>

        {/* Wallet Card for student, or Control Panel Card for admin */}
        {currentUser?.role === 'admin' ? (
          <div
            onClick={onOpenAdmin}
            className="p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-lg cursor-pointer group transition-all"
          >
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 mb-2">
              <span className="text-xs font-semibold">{t.home.adminPanelTitle}</span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {t.nav.superAdmin}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t.home.adminStatDesc}</p>
          </div>
        ) : (
          <div
            onClick={() => onSelectTab('wallet')}
            className="p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-lg cursor-pointer group transition-all"
          >
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 mb-2">
              <span className="text-xs font-semibold">{t.home.walletStatTitle}</span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {currentUser?.balance || 0}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{t.common.currency}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t.home.walletStatDesc}</p>
          </div>
        )}
      </div>

      {/* 3. Recharts Advanced Performance Analytics Section */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {t.home.analyticsMainTitle}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t.home.analyticsMainSub}
            </p>
          </div>

          {/* Chart View Tabs */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setChartView('scores')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartView === 'scores' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.home.tabScoreCurve}
            </button>
            <button
              onClick={() => setChartView('attendance')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartView === 'attendance' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.home.tabAttendanceHw}
            </button>
            <button
              onClick={() => setChartView('distribution')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartView === 'distribution' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.home.tabCohortLevels}
            </button>
          </div>
        </div>

        {/* Recharts Component */}
        <div className="h-72 w-full pt-2">
          {chartView === 'scores' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={scoresData}>
                <defs>
                  <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorTop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" stroke={axisStroke} fontSize={11} />
                <YAxis stroke={axisStroke} fontSize={11} domain={[50, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="average"
                  name={t.home.cohortAvgSeries}
                  stroke="#3B82F6"
                  fillOpacity={1}
                  fill="url(#colorAvg)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="student"
                  name={t.home.yourOrTopSeries}
                  stroke="#F59E0B"
                  fillOpacity={1}
                  fill="url(#colorTop)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {chartView === 'attendance' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" stroke={axisStroke} fontSize={11} />
                <YAxis stroke={axisStroke} fontSize={11} domain={[70, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="attendance" name={t.home.attendanceSeries} fill="#3B82F6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="homeworks" name={t.home.homeworkSeries} fill="#10B981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartView === 'distribution' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis type="number" stroke={axisStroke} fontSize={11} />
                <YAxis dataKey="name" type="category" stroke={axisStroke} fontSize={11} width={140} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name={t.home.studentsSeries} fill="#F59E0B" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
