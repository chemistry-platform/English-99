/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  GraduationCap,
  Clock,
  Award,
  CheckCircle2,
  Play,
  Timer,
  Layers,
} from 'lucide-react';
import {
  AssessmentAttempt,
  AssessmentFormAssignment,
  ExamOrAssignment,
  ExamSubmission,
  UserProfile,
} from '../types';
import {
  fetchAssessmentFormAssignments,
  fetchStudentAttempts,
} from '../lib/supabaseAssessments';
import { formatDurationArabic, formatSecondsClock } from '../lib/examGrading';
import { normalizeGrade } from '../lib/courseHelpers';
import { toValidUuid } from '../lib/supabase';
import { formatTemplate, getGradeDisplayLabel, useLanguage } from '../lib/translations';

interface ExamsSectionProps {
  exams: ExamOrAssignment[];
  currentUser: UserProfile | null;
  selectedGrade: string;
  onStartExam: (exam: ExamOrAssignment) => void;
  submissions: ExamSubmission[];
}

function getEffectiveDeadlineMs(att?: AssessmentAttempt | null): number | null {
  if (!att) return null;
  const t = att.totalDeadlineAt ? new Date(att.totalDeadlineAt).getTime() : Infinity;
  const r = att.resumeDeadlineAt ? new Date(att.resumeDeadlineAt).getTime() : Infinity;
  const m = Math.min(t, r);
  return Number.isFinite(m) ? m : null;
}

export const ExamsSection: React.FC<ExamsSectionProps> = ({
  exams,
  currentUser,
  selectedGrade,
  onStartExam,
  submissions,
}) => {
  const { t } = useLanguage();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [formAssignments, setFormAssignments] = useState<AssessmentFormAssignment[]>([]);

  const normalizedSelectedGrade = normalizeGrade(selectedGrade);

  const filteredExams = exams.filter(
    (e) =>
      e.category === 'exam' &&
      !e.isCustomForStudentId &&
      (normalizedSelectedGrade === 'All' || normalizeGrade(e.grade) === normalizedSelectedGrade)
  );

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') {
      setAttempts([]);
      setFormAssignments([]);
      return;
    }
    let mounted = true;
    Promise.all([
      fetchStudentAttempts(currentUser.id),
      fetchAssessmentFormAssignments(),
    ]).then(([attList, assignList]) => {
      if (!mounted) return;
      setAttempts(attList);
      const stuUuid = toValidUuid(currentUser.id);
      setFormAssignments(
        assignList.filter((a) => a.studentId === stuUuid || a.studentId === currentUser.id)
      );
    });
    return () => {
      mounted = false;
    };
  }, [currentUser?.id, currentUser?.role, exams.length, submissions.length]);

  const hasAnyActiveTimer = attempts.some(
    (a) => a.status === 'in_progress' && getEffectiveDeadlineMs(a) !== null
  );

  useEffect(() => {
    if (!hasAnyActiveTimer) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasAnyActiveTimer]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#0F172A] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            <h2 className="text-[20px] sm:text-xl font-bold text-slate-900 dark:text-white">
              {t.exams.examsMainTitle}
            </h2>
          </div>
          <p className="text-[14px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            {t.exams.examsMainSub}
          </p>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-400">
          <Award className="w-4 h-4" />
          <span>{t.exams.leaderboardHint}</span>
        </div>
      </div>

      {filteredExams.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-slate-800/80 p-8 shadow-sm">
          <GraduationCap className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <h4 className="text-slate-900 dark:text-white font-bold text-base">
            {t.exams.emptyGradeExamsTitle}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t.exams.emptyGradeExamsSub}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExams.map((exam) => {
            const examUuid = toValidUuid(exam.id);
            const examAttempts = attempts.filter(
              (a) => a.assessmentId === examUuid || a.assessmentId === exam.id
            );
            const inProgress = examAttempts.find((a) => a.status === 'in_progress') || null;
            const completedAttempts = examAttempts.filter(
              (a) => a.status === 'submitted' || a.status === 'auto_submitted'
            );
            const legacySubs = submissions.filter(
              (s) =>
                (s.examId === exam.id || toValidUuid(s.examId) === examUuid) &&
                s.studentId === currentUser?.id
            );
            const completedCount =
              completedAttempts.length > 0 ? completedAttempts.length : legacySubs.length;
            const latestScore =
              completedAttempts.length > 0
                ? completedAttempts[completedAttempts.length - 1]
                : legacySubs[0] || null;

            const formsCount = exam.forms?.length || 1;
            const assigned = formAssignments.find(
              (fa) => fa.assessmentId === examUuid || fa.assessmentId === exam.id
            );
            const assignedFormName = assigned?.formName;

            const effMs = getEffectiveDeadlineMs(inProgress);
            const remainingSecs =
              effMs !== null ? Math.max(0, Math.floor((effMs - nowMs) / 1000)) : null;

            const defaultResumeMins = 5 * 60;
            const resumeMins =
              exam.resumeWindowMinutes === undefined ? defaultResumeMins : exam.resumeWindowMinutes;

            return (
              <div
                key={exam.id}
                className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 hover:border-amber-500/60 shadow-xl transition-all flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold px-3 py-1 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        {getGradeDisplayLabel(exam.grade, t)}
                      </span>
                      {formsCount > 1 && assignedFormName && (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          <span>{assignedFormName}</span>
                        </span>
                      )}
                    </div>

                    {inProgress ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold font-mono tabular-nums px-2.5 py-1 rounded-xl border text-blue-700 dark:text-blue-300 bg-blue-500/10 border-blue-500/30">
                        <Timer className="w-3.5 h-3.5" />
                        <span>
                          {remainingSecs !== null
                            ? remainingSecs > 0
                              ? formatTemplate(t.exams.remainingClock, { clock: formatSecondsClock(remainingSecs) })
                              : t.exams.timeExpired
                            : t.exams.openSession}
                        </span>
                      </span>
                    ) : latestScore ? (
                      <span className="flex items-center gap-1 text-xs font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {t.exams.yourScorePrefix} {latestScore.score} / {latestScore.totalPoints || exam.totalPoints}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                        <span>{formatDurationArabic(exam.durationMinutes, exam.durationUnit)}</span>
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                      {exam.title}
                    </h3>
                    {exam.lessonTitle && (
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
                        {exam.lessonTitle}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono tabular-nums">
                      <span>{formatTemplate(t.exams.questionsCountLabel, { count: exam.questions.length })}</span>
                      <span>·</span>
                      <span>{t.exams.pointsLabel} {exam.totalPoints}</span>
                      <span>·</span>
                      <span className="font-sans">
                        {t.exams.resumeWindowLabel} {formatDurationArabic(resumeMins, exam.resumeWindowUnit)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                  {currentUser?.role === 'student' && (
                    <div className="text-[11px] font-bold text-center text-slate-600 dark:text-slate-400 font-mono">
                      {t.exams.attemptsPrefix} {completedCount} /{' '}
                      {exam.maxAttempts && exam.maxAttempts > 0 ? exam.maxAttempts : t.exams.unlimitedAttempts}
                    </div>
                  )}

                  <button
                    onClick={() => onStartExam(exam)}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-slate-950 font-bold text-[15px] sm:text-xs shadow-xl shadow-amber-500/20 transition-all transform hover:scale-[1.02] cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>
                      {inProgress
                        ? t.exams.continueExamBtn
                        : formsCount > 1 && assignedFormName
                        ? `${t.exams.openFormPrefix} ${assignedFormName}`
                        : completedCount > 0
                        ? t.exams.viewAttemptsRetry
                        : t.exams.openExamBtn}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
