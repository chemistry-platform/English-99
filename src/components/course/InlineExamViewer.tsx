/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Award,
  BookOpen,
  Pause,
  ZoomIn,
  Maximize2,
  Minimize2,
  BarChart3,
  Timer,
  Play,
  Loader2,
  X,
  Eye,
  MessageSquareWarning,
  ArrowLeft,
  Layers,
} from 'lucide-react';
import {
  AssessmentAttempt,
  ExamOrAssignment,
  ExamQuestion,
  ExamSubmission,
  QuestionGrievance,
  UserProfile,
} from '../../types';
import {
  applyAttemptOrderToQuestions,
  encodeSelectedChoiceIds,
  formatDurationArabic,
  formatSecondsClock,
  gradeAttemptQuestions,
  gradeQuestion,
  normalizeQuestionsList,
  resolveSelectedChoiceIds,
} from '../../lib/examGrading';
import {
  assignBalancedFormForStudent,
  fetchGrievancesForAttempt,
  fetchStudentAttempts,
  heartbeatAttempt,
  sendAttemptExitBeacon,
  startOrResumeAttempt,
  submitAssessmentAttempt,
  submitQuestionGrievance,
} from '../../lib/supabaseAssessments';
import {
  getActiveFullscreenElement,
  requestCrossBrowserFullscreen,
  exitCrossBrowserFullscreen,
  tryUnlockOrientation,
} from '../../lib/fullscreen';
import { generateUuid } from '../../lib/supabase';

interface InlineExamViewerProps {
  exam: ExamOrAssignment;
  currentUser: UserProfile | null;
  onSubmitted: (submission: ExamSubmission) => void;
  onExitView?: () => void;
}

type ExamStage = 'loading' | 'overview' | 'active' | 'review';

function formatDateTimeEn(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getEffectiveDeadlineMs(attempt: AssessmentAttempt | null): number | null {
  if (!attempt) return null;
  const tMs = attempt.totalDeadlineAt ? new Date(attempt.totalDeadlineAt).getTime() : Infinity;
  const rMs = attempt.resumeDeadlineAt ? new Date(attempt.resumeDeadlineAt).getTime() : Infinity;
  const minMs = Math.min(tMs, rMs);
  return Number.isFinite(minMs) ? minMs : null;
}

export const InlineExamViewer: React.FC<InlineExamViewerProps> = ({
  exam,
  currentUser,
  onSubmitted,
  onExitView,
}) => {
  const [stage, setStage] = useState<ExamStage>('loading');
  const [assignedForm, setAssignedForm] = useState<{
    formId: string;
    formName: string;
    questions: ExamQuestion[];
    totalPoints: number;
    formsCount: number;
  } | null>(null);
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [activeAttempt, setActiveAttempt] = useState<AssessmentAttempt | null>(null);
  const [reviewedAttempt, setReviewedAttempt] = useState<AssessmentAttempt | null>(null);
  const [grievances, setGrievances] = useState<QuestionGrievance[]>([]);
  const [grievanceDraftOpen, setGrievanceDraftOpen] = useState<Record<string, boolean>>({});
  const [grievanceDraftText, setGrievanceDraftText] = useState<Record<string, string>>({});
  const [grievanceSubmittingId, setGrievanceSubmittingId] = useState<string | null>(null);
  const [grievanceToast, setGrievanceToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [visitedQuestions, setVisitedQuestions] = useState<Set<number>>(new Set([0]));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expiredNotice, setExpiredNotice] = useState(false);
  const [isStartingOrResuming, setIsStartingOrResuming] = useState(false);
  const [isSubmittingNow, setIsSubmittingNow] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isSummaryFullscreen, setIsSummaryFullscreen] = useState(false);
  const [resumeSavedNotice, setResumeSavedNotice] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showQuestionMap, setShowQuestionMap] = useState(true);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const selectedAnswersRef = useRef<Record<string, string>>({});
  const visitedRef = useRef<Set<number>>(new Set([0]));
  const activeAttemptRef = useRef<AssessmentAttempt | null>(null);
  const isSubmittedRef = useRef<boolean>(false);
  const stageRef = useRef<ExamStage>('loading');

  useEffect(() => {
    selectedAnswersRef.current = selectedAnswers;
  }, [selectedAnswers]);

  useEffect(() => {
    visitedRef.current = visitedQuestions;
  }, [visitedQuestions]);

  useEffect(() => {
    activeAttemptRef.current = activeAttempt;
  }, [activeAttempt]);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // Sync cross-browser fullscreen events without resetting any exam state
  useEffect(() => {
    const syncFs = () => {
      const activeEl = getActiveFullscreenElement();
      if (!activeEl && isFullscreen && !isCssFullscreen) {
        setIsFullscreen(false);
        tryUnlockOrientation();
      } else if (activeEl && activeEl === containerRef.current) {
        setIsFullscreen(true);
      }
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, [isFullscreen, isCssFullscreen]);

  useEffect(() => {
    return () => {
      if (getActiveFullscreenElement() === containerRef.current) {
        void exitCrossBrowserFullscreen();
      } else {
        tryUnlockOrientation();
      }
    };
  }, []);

  const handleToggleFullscreen = async () => {
    const activeNow = isFullscreen || isCssFullscreen || Boolean(getActiveFullscreenElement());
    if (activeNow) {
      setIsCssFullscreen(false);
      setIsFullscreen(false);
      await exitCrossBrowserFullscreen();
      return;
    }

    const mode = await requestCrossBrowserFullscreen(containerRef.current, {
      lockLandscapeOnMobile: true,
    });
    if (mode === 'css-fallback') {
      setIsCssFullscreen(true);
      setIsFullscreen(true);
    } else {
      setIsCssFullscreen(false);
      setIsFullscreen(true);
    }
  };

  const activeQuestions = useMemo(() => {
    const base =
      activeAttempt?.questionsSnapshot && activeAttempt.questionsSnapshot.length > 0
        ? activeAttempt.questionsSnapshot
        : assignedForm?.questions || normalizeQuestionsList(exam.questions || []);
    return applyAttemptOrderToQuestions(base, activeAttempt?.questionOrder, activeAttempt?.choiceOrders);
  }, [activeAttempt, assignedForm, exam.questions]);

  const reviewQuestions = useMemo(() => {
    if (!reviewedAttempt) return [];
    const base =
      reviewedAttempt.questionsSnapshot && reviewedAttempt.questionsSnapshot.length > 0
        ? reviewedAttempt.questionsSnapshot
        : assignedForm?.questions || normalizeQuestionsList(exam.questions || []);
    return applyAttemptOrderToQuestions(base, reviewedAttempt.questionOrder, reviewedAttempt.choiceOrders);
  }, [reviewedAttempt, assignedForm, exam.questions]);

  const loadOverviewData = useCallback(async () => {
    setStage('loading');
    setActionError(null);
    const studentId = currentUser?.id || 'guest';
    try {
      const formRes = await assignBalancedFormForStudent(exam, studentId);
      setAssignedForm(formRes);
      if (currentUser && currentUser.role === 'student') {
        const list = await fetchStudentAttempts(currentUser.id, exam.id);
        setAttempts(list);
      } else {
        setAttempts([]);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Unable to load assessment data from Supabase');
    } finally {
      setStage('overview');
    }
  }, [exam, currentUser?.id, currentUser?.role]);

  useEffect(() => {
    isSubmittedRef.current = false;
    setActiveAttempt(null);
    setReviewedAttempt(null);
    setSelectedAnswers({});
    setVisitedQuestions(new Set([0]));
    setCurrentQuestionIndex(0);
    setExpiredNotice(false);
    setShowSubmitConfirm(false);
    setIsSummaryFullscreen(false);
    setResumeSavedNotice(false);
    setGrievances([]);
    void loadOverviewData();
  }, [exam.id, currentUser?.id, loadOverviewData]);

  const submitAnswersSnapshot = useCallback(
    async (
      answersSnapshot: Record<string, string>,
      status: 'submitted' | 'auto_submitted' = 'submitted'
    ) => {
      if (isSubmittedRef.current) return;
      isSubmittedRef.current = true;
      setIsSubmittingNow(true);
      setShowSubmitConfirm(false);
      setIsSummaryFullscreen(false);

      const attempt = activeAttemptRef.current;
      const baseQuestions =
        attempt?.questionsSnapshot && attempt.questionsSnapshot.length > 0
          ? attempt.questionsSnapshot
          : assignedForm?.questions || normalizeQuestionsList(exam.questions || []);

      const graded = gradeAttemptQuestions(baseQuestions, answersSnapshot, attempt?.questionGrades);
      const totalPts = graded.totalPoints || exam.totalPoints || 1;
      const isRealStudentAttempt = Boolean(
        attempt &&
          currentUser &&
          currentUser.role === 'student' &&
          !attempt.id.startsWith('preview-')
      );

      let savedAttempt: AssessmentAttempt = {
        ...(attempt || {
          id: generateUuid(),
          assessmentId: exam.id,
          formId: assignedForm?.formId || generateUuid(),
          formName: assignedForm?.formName || 'Form A',
          studentId: currentUser?.id || 'guest',
          attemptNumber: 1,
          startedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          questionOrder: baseQuestions.map((q) => q.id),
          choiceOrders: {},
          answers: answersSnapshot,
          visitedQuestionIndices: Array.from(visitedRef.current),
          questionsSnapshot: baseQuestions,
          questionGrades: graded.questionGrades,
          autoZeroedQuestions: graded.autoZeroedQuestions,
          score: graded.score,
          totalPoints: totalPts,
          percentage: totalPts > 0 ? Math.round((graded.score / totalPts) * 100) : 0,
          hasEssayQuestions: graded.hasEssayQuestions,
          essayGradingPending: graded.essayGradingPending,
        }),
        status,
        answers: answersSnapshot,
        questionGrades: graded.questionGrades,
        autoZeroedQuestions: graded.autoZeroedQuestions,
        score: graded.score,
        mcqScore: graded.mcqScore,
        mcqTotal: graded.mcqTotal,
        totalPoints: totalPts,
        percentage: totalPts > 0 ? Math.round((graded.score / totalPts) * 100) : 0,
        hasEssayQuestions: graded.hasEssayQuestions,
        essayGradingPending: graded.essayGradingPending,
        submittedAt: new Date().toISOString(),
      };

      if (isRealStudentAttempt && attempt && currentUser) {
        const res = await submitAssessmentAttempt({
          attempt,
          exam,
          status,
          answers: answersSnapshot,
          questionGrades: graded.questionGrades,
          autoZeroedQuestions: graded.autoZeroedQuestions,
          score: graded.score,
          mcqScore: graded.mcqScore,
          mcqTotal: graded.mcqTotal,
          totalPoints: totalPts,
          hasEssayQuestions: graded.hasEssayQuestions,
          essayGradingPending: graded.essayGradingPending,
          studentName: currentUser.fullName,
          studentCode: currentUser.studentCode,
          solvedCount: graded.solvedCount,
          correctCount: graded.correctCount,
        });
        if (res.attempt) savedAttempt = res.attempt;
        const refreshedAttempts = await fetchStudentAttempts(currentUser.id, exam.id);
        setAttempts(refreshedAttempts);
      }

      const submission: ExamSubmission = {
        id: savedAttempt.id,
        examId: exam.id,
        formId: savedAttempt.formId,
        formName: savedAttempt.formName,
        attemptId: savedAttempt.id,
        submissionStatus: status,
        studentId: currentUser?.id || 'guest',
        studentName: currentUser?.fullName || 'Preview',
        studentCode: currentUser?.studentCode || 'PREVIEW',
        score: graded.score,
        totalPoints: totalPts,
        answers: answersSnapshot,
        questionsSnapshot: savedAttempt.questionsSnapshot,
        hasEssayQuestions: graded.hasEssayQuestions,
        mcqScore: graded.mcqScore,
        mcqTotal: graded.mcqTotal,
        essayGradingPending: graded.essayGradingPending,
        questionGrades: graded.questionGrades,
        autoZeroedQuestions: graded.autoZeroedQuestions,
        startedAt: savedAttempt.startedAt,
        attemptNumber: savedAttempt.attemptNumber,
        solvedCount: graded.solvedCount,
        correctCount: graded.correctCount,
        submittedAt: savedAttempt.submittedAt || new Date().toISOString(),
      };

      if (status === 'auto_submitted') setExpiredNotice(true);
      setActiveAttempt(null);
      setReviewedAttempt(savedAttempt);
      setGrievances([]);
      setStage('review');
      setIsSubmittingNow(false);
      onSubmitted(submission);
    },
    [exam, currentUser, assignedForm, onSubmitted]
  );

  const handleStartOrResume = async () => {
    if (!assignedForm || isStartingOrResuming) return;
    setIsStartingOrResuming(true);
    setActionError(null);
    isSubmittedRef.current = false;

    try {
      if (!currentUser || currentUser.role !== 'student') {
        const nowIso = new Date().toISOString();
        setActiveAttempt({
          id: `preview-${generateUuid()}`,
          assessmentId: exam.id,
          formId: assignedForm.formId,
          formName: assignedForm.formName,
          studentId: currentUser?.id || 'guest',
          attemptNumber: 1,
          status: 'in_progress',
          startedAt: nowIso,
          lastSeenAt: nowIso,
          totalDeadlineAt: exam.durationMinutes
            ? new Date(Date.now() + exam.durationMinutes * 60_000).toISOString()
            : null,
          resumeDeadlineAt: null,
          questionOrder: assignedForm.questions.map((q) => q.id),
          choiceOrders: {},
          answers: {},
          visitedQuestionIndices: [0],
          questionsSnapshot: assignedForm.questions,
          questionGrades: {},
          autoZeroedQuestions: [],
          score: 0,
          totalPoints: assignedForm.totalPoints,
          percentage: 0,
          hasEssayQuestions: assignedForm.questions.some((q) => q.type === 'essay'),
          essayGradingPending: false,
        });
        setSelectedAnswers({});
        setVisitedQuestions(new Set([0]));
        setCurrentQuestionIndex(0);
        setNowMs(Date.now());
        setStage('active');
        return;
      }

      const res = await startOrResumeAttempt(exam, currentUser.id, assignedForm);
      if (res.error || !res.attempt) {
        setActionError(res.error || 'Unable to start the attempt right now.');
        return;
      }

      const att = res.attempt;
      setActiveAttempt(att);
      setSelectedAnswers(att.answers || {});
      selectedAnswersRef.current = att.answers || {};
      const vis = new Set(
        Array.isArray(att.visitedQuestionIndices) && att.visitedQuestionIndices.length > 0
          ? att.visitedQuestionIndices
          : [0]
      );
      setVisitedQuestions(vis);
      visitedRef.current = vis;
      setCurrentQuestionIndex(0);
      setNowMs(Date.now());
      setStage('active');

      const effMs = getEffectiveDeadlineMs(att);
      if (effMs !== null && effMs <= Date.now()) {
        await submitAnswersSnapshot(att.answers || {}, 'auto_submitted');
      }
    } finally {
      setIsStartingOrResuming(false);
    }
  };

  useEffect(() => {
    if (stage !== 'active' && stage !== 'overview') return;
    const hasRunningOverviewAttempt =
      stage === 'overview' && attempts.some((a) => a.status === 'in_progress');
    if (stage === 'overview' && !hasRunningOverviewAttempt) return;

    const tick = () => {
      const now = Date.now();
      setNowMs(now);
      if (stageRef.current === 'active' && activeAttemptRef.current && !isSubmittedRef.current) {
        const effMs = getEffectiveDeadlineMs(activeAttemptRef.current);
        if (effMs !== null && effMs <= now) {
          void submitAnswersSnapshot(selectedAnswersRef.current, 'auto_submitted');
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [stage, attempts, submitAnswersSnapshot]);

  // 12s Supabase heartbeat & background exit beacons + unmount exit signal
  useEffect(() => {
    if (
      stage !== 'active' ||
      !activeAttempt ||
      activeAttempt.id.startsWith('preview-')
    ) {
      return;
    }

    const attemptId = activeAttempt.id;
    const runHeartbeat = async () => {
      if (isSubmittedRef.current || stageRef.current !== 'active') return;
      const res = await heartbeatAttempt(
        attemptId,
        selectedAnswersRef.current,
        Array.from(visitedRef.current),
        false
      );
      if (res.expired && !isSubmittedRef.current) {
        await submitAnswersSnapshot(selectedAnswersRef.current, 'auto_submitted');
      } else if (res.attempt) {
        setActiveAttempt((prev) =>
          prev
            ? {
                ...prev,
                lastSeenAt: res.attempt!.lastSeenAt,
                firstExitedAt: res.attempt!.firstExitedAt,
                resumeDeadlineAt: res.attempt!.resumeDeadlineAt,
              }
            : prev
        );
      }
    };

    const intervalId = window.setInterval(() => {
      void runHeartbeat();
    }, 12000);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && !isSubmittedRef.current) {
        sendAttemptExitBeacon(
          attemptId,
          selectedAnswersRef.current,
          Array.from(visitedRef.current),
          false
        );
      }
    };

    const handlePageHide = () => {
      if (!isSubmittedRef.current) {
        sendAttemptExitBeacon(
          attemptId,
          selectedAnswersRef.current,
          Array.from(visitedRef.current),
          false
        );
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      if (!isSubmittedRef.current && stageRef.current === 'active') {
        sendAttemptExitBeacon(
          attemptId,
          selectedAnswersRef.current,
          Array.from(visitedRef.current),
          true
        );
      }
    };
  }, [stage, activeAttempt?.id, submitAnswersSnapshot]);

  const handleResumeLater = async () => {
    if (
      activeAttempt &&
      !activeAttempt.id.startsWith('preview-') &&
      !isSubmittedRef.current
    ) {
      await heartbeatAttempt(
        activeAttempt.id,
        selectedAnswersRef.current,
        Array.from(visitedRef.current),
        true
      );
    }
    setResumeSavedNotice(true);
    window.setTimeout(() => {
      setResumeSavedNotice(false);
    }, 2500);
  };

  const handleOpenAttemptReview = async (att: AssessmentAttempt) => {
    setReviewedAttempt(att);
    setExpiredNotice(att.status === 'auto_submitted');
    setGrievances([]);
    setStage('review');
    if (!att.id.startsWith('preview-')) {
      const list = await fetchGrievancesForAttempt(att.id);
      setGrievances(list);
    }
  };

  const handleSubmitGrievanceForQuestion = async (q: ExamQuestion) => {
    if (!reviewedAttempt || !currentUser || currentUser.role !== 'student') return;
    const msg = (grievanceDraftText[q.id] || '').trim();
    if (!msg) return;
    setGrievanceSubmittingId(q.id);
    setGrievanceToast(null);
    try {
      const rawAns = reviewedAttempt.answers?.[q.id] || '';
      const studentDisplay =
        q.type === 'mcq'
          ? resolveSelectedChoiceIds(q, rawAns)
              .map((id) => q.choices?.find((c) => c.id === id)?.text || id)
              .join(', ') || 'Not answered'
          : rawAns || 'Not answered';

      const correctDisplay =
        q.type === 'mcq'
          ? (q.correctChoiceIds || [])
              .map((id) => q.choices?.find((c) => c.id === id)?.text)
              .filter(Boolean)
              .join(', ') || q.correctAnswer
          : q.explanation || q.correctAnswer;

      const res = await submitQuestionGrievance({
        attemptId: reviewedAttempt.id,
        assessmentId: exam.id,
        formId: reviewedAttempt.formId,
        studentId: currentUser.id,
        questionId: q.id,
        questionText: q.question,
        studentAnswer: studentDisplay,
        correctAnswer: correctDisplay,
        questionPoints: q.points,
        message: msg,
      });

      if (res.success && res.grievance) {
        setGrievances((prev) => [...prev, res.grievance!]);
        setGrievanceDraftOpen((prev) => ({ ...prev, [q.id]: false }));
        setGrievanceDraftText((prev) => ({ ...prev, [q.id]: '' }));
        setGrievanceToast({ type: 'ok', text: 'Your appeal was submitted to the teacher ✓' });
      } else {
        setGrievanceToast({ type: 'err', text: res.error || 'Failed to submit appeal' });
      }
      window.setTimeout(() => setGrievanceToast(null), 4000);
    } finally {
      setGrievanceSubmittingId(null);
    }
  };

  const stats = useMemo(() => {
    let mcqTotalCount = 0;
    let mcqSolvedCount = 0;
    let essayTotalCount = 0;
    let essaySolvedCount = 0;
    const unsolvedIndices: number[] = [];
    const solvedIndices: number[] = [];

    activeQuestions.forEach((q, idx) => {
      const hasAns =
        q.type === 'mcq'
          ? resolveSelectedChoiceIds(q, selectedAnswers[q.id]).length > 0
          : String(selectedAnswers[q.id] || '').trim() !== '';

      if (q.type === 'mcq') {
        mcqTotalCount += 1;
        if (hasAns) mcqSolvedCount += 1;
      } else {
        essayTotalCount += 1;
        if (hasAns) essaySolvedCount += 1;
      }
      if (hasAns) solvedIndices.push(idx + 1);
      else unsolvedIndices.push(idx + 1);
    });

    return {
      total: activeQuestions.length,
      mcqTotalCount,
      mcqSolvedCount,
      essayTotalCount,
      essaySolvedCount,
      solvedCount: solvedIndices.length,
      unsolvedCount: unsolvedIndices.length,
      unsolvedIndices,
      solvedIndices,
    };
  }, [activeQuestions, selectedAnswers]);

  const currentQ = activeQuestions[currentQuestionIndex];
  const totalQuestions = activeQuestions.length;
  const categoryLabel =
    exam.category === 'exam' ? 'Exam' : exam.category === 'assignment' ? 'Assignment' : 'Worksheet';
  const finishButtonText = `Finish ${categoryLabel}`;
  const isExpandedMode = isFullscreen || isCssFullscreen;

  const completedAttempts = attempts.filter(
    (a) => a.status === 'submitted' || a.status === 'auto_submitted'
  );
  const inProgressAttempt = attempts.find((a) => a.status === 'in_progress') || null;
  const maxAttempts = exam.maxAttempts && exam.maxAttempts > 0 ? exam.maxAttempts : null;
  const limitReached = Boolean(
    currentUser?.role === 'student' && maxAttempts !== null && completedAttempts.length >= maxAttempts
  );

  const effectiveDeadlineMs = getEffectiveDeadlineMs(activeAttempt);
  const remainingSecs =
    effectiveDeadlineMs !== null ? Math.max(0, Math.floor((effectiveDeadlineMs - nowMs) / 1000)) : null;

  const inProgressDeadlineMs = getEffectiveDeadlineMs(inProgressAttempt);
  const inProgressRemainingSecs =
    inProgressDeadlineMs !== null
      ? Math.max(0, Math.floor((inProgressDeadlineMs - nowMs) / 1000))
      : null;

  const defaultResumeMins = exam.category === 'assignment' ? 24 * 60 : 5 * 60;
  const displayResumeMinutes =
    exam.resumeWindowMinutes === undefined ? defaultResumeMins : exam.resumeWindowMinutes;

  const handleNavigateToQuestion = (index: number) => {
    setVisitedQuestions((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    setCurrentQuestionIndex(index);
    if (scrollBodyRef.current) {
      scrollBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectChoice = (q: ExamQuestion, choiceId: string) => {
    if (stage !== 'active') return;
    const isMulti = (q.correctChoiceIds?.length || 1) > 1;
    if (!isMulti) {
      setSelectedAnswers((prev) => ({ ...prev, [q.id]: encodeSelectedChoiceIds([choiceId]) }));
      return;
    }
    const existing = resolveSelectedChoiceIds(q, selectedAnswers[q.id]);
    const next = existing.includes(choiceId)
      ? existing.filter((id) => id !== choiceId)
      : [...existing, choiceId];
    setSelectedAnswers((prev) => ({ ...prev, [q.id]: encodeSelectedChoiceIds(next) }));
  };

  return (
    <div
      ref={containerRef}
      className={
        isCssFullscreen
          ? 'fixed inset-0 z-[9999] w-screen h-[100dvh] bg-white dark:bg-[#0F172A] flex flex-col overflow-hidden'
          : isFullscreen
          ? 'w-full h-full bg-white dark:bg-[#0F172A] flex flex-col overflow-hidden'
          : 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm flex flex-col'
      }
    >
      {/* Top Header with Top-Right Fullscreen Button */}
      <div
        className={`px-3 sm:px-5 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0 ${
          isExpandedMode ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : ''
        }`}
      >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => void handleToggleFullscreen()}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {isExpandedMode ? (
                  <>
                    <Minimize2 className="w-4 h-4" />
                    <span>Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4" />
                    <span>Open Fullscreen</span>
                  </>
                )}
              </button>

              <span className="hidden sm:inline-block text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">
                {exam.category === 'exam' ? 'Exam' : exam.category === 'assignment' ? 'Assignment' : 'Worksheet'}
              </span>

              {assignedForm && assignedForm.formsCount > 1 && (
                <span className="hidden md:inline-block text-[11px] font-bold px-2 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shrink-0">
                  {assignedForm.formName}
                </span>
              )}

              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {exam.title}
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                  <span className="font-mono tabular-nums font-bold">
                    {assignedForm ? assignedForm.questions.length : exam.questions.length}
                  </span>{' '}
                  questions ·{' '}
                  <span className="font-mono tabular-nums font-bold">
                    {assignedForm ? assignedForm.totalPoints : exam.totalPoints}
                  </span>{' '}
                  pts
                  {exam.lessonTitle ? ` · ${exam.lessonTitle}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {stage === 'active' && (
                <>
                  {remainingSecs !== null ? (
                    <div
                      className={`min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono tabular-nums text-xs font-bold shadow-inner ${
                        remainingSecs <= 300
                          ? 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-400 animate-pulse'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>{formatSecondsClock(remainingSecs)}</span>
                    </div>
                  ) : (
                    <div className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>Untimed</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleResumeLater()}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-400 border border-slate-300 dark:border-slate-700 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Save Progress</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmittingNow}
                    onClick={() => setShowSubmitConfirm(true)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs shadow transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Finish</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Scrollable Body */}
          <div
            ref={scrollBodyRef}
            className={`p-3 sm:p-5 space-y-4 overflow-y-auto ${
              isExpandedMode ? 'flex-1 min-h-0' : 'max-h-[78dvh]'
            }`}
          >
            {stage === 'loading' && (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-600 dark:text-slate-300">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                <p className="text-xs font-bold">Loading form and attempts from Supabase...</p>
              </div>
            )}

            {stage === 'overview' && (
              <div className="space-y-5 max-w-2xl mx-auto my-2">
                {actionError && (
                  <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/40 text-red-700 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}

                <div className="p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-amber-500/35 text-center space-y-4 shadow-md">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
                    <Timer className="w-6 h-6" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <span className="text-[11px] font-bold px-3 py-1 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        {exam.category === 'exam'
                          ? 'Online Exam'
                          : exam.category === 'assignment'
                          ? 'Homework Assignment'
                          : 'Practice Sheet'}
                      </span>
                      {assignedForm && assignedForm.formsCount > 1 && (
                        <span className="text-[11px] font-bold px-3 py-1 rounded-xl bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          <span>Assigned Form: {assignedForm.formName}</span>
                        </span>
                      )}
                    </div>

                    <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white pt-1">
                      {exam.title}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Questions:{' '}
                      <strong className="font-mono">
                        {assignedForm ? assignedForm.questions.length : exam.questions.length}
                      </strong>{' '}
                      · Total Points:{' '}
                      <strong className="font-mono">
                        {assignedForm ? assignedForm.totalPoints : exam.totalPoints}
                      </strong>{' '}
                      pts
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left text-xs">
                    <div className="p-3 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        {categoryLabel} duration from start:
                      </span>
                      <strong className="font-bold text-blue-700 dark:text-blue-300">
                        {formatDurationArabic(exam.durationMinutes, exam.durationUnit)}
                      </strong>
                    </div>
                    <div className="p-3 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        Resume window after first exit:
                      </span>
                      <strong className="font-bold text-amber-700 dark:text-amber-300">
                        {formatDurationArabic(displayResumeMinutes, exam.resumeWindowUnit)}
                      </strong>
                    </div>
                  </div>

                  {inProgressAttempt ? (
                    <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-500/40 space-y-3">
                      <div className="text-xs font-bold text-blue-800 dark:text-blue-300">
                        Attempt in progress (Attempt #{inProgressAttempt.attemptNumber}) —{' '}
                        <span className="font-mono">
                          {Object.keys(inProgressAttempt.answers || {}).length}
                        </span>{' '}
                        answers saved
                      </div>
                      {inProgressRemainingSecs !== null && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 font-mono text-xs font-bold">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Time remaining: {formatSecondsClock(inProgressRemainingSecs)}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-center gap-2.5">
                        <button
                          type="button"
                          disabled={isStartingOrResuming}
                          onClick={() => void handleStartOrResume()}
                          className="min-h-[44px] px-7 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs sm:text-sm shadow-lg flex items-center gap-2 cursor-pointer"
                        >
                          {isStartingOrResuming ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4 fill-slate-950" />
                          )}
                          <span>Resume {categoryLabel} Now</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 pt-1">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">
                        Attempts:{' '}
                        <span className="text-amber-600 dark:text-amber-400 font-black">
                          {completedAttempts.length}
                        </span>{' '}
                        / <span>{maxAttempts !== null ? maxAttempts : 'Unlimited'}</span>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          disabled={limitReached || isStartingOrResuming}
                          onClick={() => void handleStartOrResume()}
                          className={`min-h-[44px] px-7 py-3 rounded-xl font-black text-sm shadow-lg flex items-center gap-2 transition-all ${
                            limitReached
                              ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/25 cursor-pointer'
                          }`}
                        >
                          {isStartingOrResuming ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4 fill-current" />
                          )}
                          <span>
                            {limitReached
                              ? 'Maximum attempts reached'
                              : completedAttempts.length > 0
                              ? `Retake ${categoryLabel}`
                              : `Start ${categoryLabel} Now`}
                          </span>
                        </button>
                        {onExitView && (
                          <button
                            type="button"
                            onClick={onExitView}
                            className="min-h-[44px] px-5 py-3 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs border border-slate-300 dark:border-slate-700 cursor-pointer"
                          >
                            Back to Lectures List
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {completedAttempts.length > 0 && (
                  <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-bold">
                      <span>Your Previous Attempts ({completedAttempts.length})</span>
                      {assignedForm && assignedForm.formsCount > 1 && (
                        <span className="text-indigo-600 dark:text-indigo-400">
                          {assignedForm.formName}
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/30">
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">Started At</th>
                            <th className="py-2.5 px-3">Finished At</th>
                            <th className="py-2.5 px-3">Score</th>
                            <th className="py-2.5 px-3">Percentage</th>
                            <th className="py-2.5 px-3">Answers</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {completedAttempts.map((att) => (
                            <tr key={att.id}>
                              <td className="py-2.5 px-3 font-mono font-bold">#{att.attemptNumber}</td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {formatDateTimeEn(att.startedAt)}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {formatDateTimeEn(att.submittedAt)}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-black text-amber-600 dark:text-amber-400">
                                {att.score} / {att.totalPoints}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {Math.round(att.percentage)}%
                              </td>
                              <td className="py-2.5 px-3">
                                <button
                                  type="button"
                                  onClick={() => void handleOpenAttemptReview(att)}
                                  className="px-3 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-600 text-blue-700 dark:text-blue-300 hover:text-white border border-blue-500/30 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Answers</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {resumeSavedNotice && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500 text-emerald-700 dark:text-emerald-300 text-center font-bold text-xs">
                ✓ Your answers and progress have been saved to Supabase.
              </div>
            )}

            {stage === 'active' && (
              <>
                {activeAttempt?.resumeDeadlineAt && (
                  <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/35 text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
                    <span>Resume window activated after first exit — expires at:</span>
                    <span className="font-mono" dir="ltr">
                      {formatDateTimeEn(activeAttempt.resumeDeadlineAt)}
                    </span>
                  </div>
                )}

                <div className="bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 space-y-2.5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="flex items-center gap-1 font-bold text-slate-800 dark:text-white">
                        <BarChart3 className="w-3.5 h-3.5 text-amber-500" />
                        <span>Stats &amp; Question Map</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-700 dark:text-slate-300">
                        All: <strong>{stats.total}</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 font-mono text-emerald-700 dark:text-emerald-300">
                        Answered: <strong>{stats.solvedCount}</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/30 font-mono text-red-700 dark:text-red-300">
                        Remaining: <strong>{stats.unsolvedCount}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowQuestionMap((prev) => !prev)}
                      className="min-h-[36px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      <span>{showQuestionMap ? 'Hide Map' : 'Show Map'}</span>
                      {showQuestionMap ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {showQuestionMap && (
                    <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                      {activeQuestions.map((q, idx) => {
                        const isCurrent = idx === currentQuestionIndex;
                        const isAnswered =
                          q.type === 'mcq'
                            ? resolveSelectedChoiceIds(q, selectedAnswers[q.id]).length > 0
                            : String(selectedAnswers[q.id] || '').trim() !== '';
                        const isVisited = visitedQuestions.has(idx);

                        let colorClass =
                          'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100';
                        if (isCurrent) {
                          colorClass = 'bg-red-600 text-white border-red-700 ring-2 ring-red-400/60 font-black';
                        } else if (isAnswered) {
                          colorClass = 'bg-emerald-600 text-white border-emerald-700 font-bold';
                        } else if (isVisited) {
                          colorClass =
                            'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-600/40 font-semibold';
                        }

                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => handleNavigateToQuestion(idx)}
                            className={`min-w-[36px] min-h-[36px] px-2 rounded-lg border text-xs font-mono flex items-center justify-center transition-all cursor-pointer ${colorClass}`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {currentQ && (
                  <div className="space-y-4">
                    <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-slate-50 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">
                            Question ({currentQuestionIndex + 1}) of {totalQuestions}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold border text-[11px] ${
                              currentQ.type === 'mcq'
                                ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
                                : 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30'
                            }`}
                          >
                            {currentQ.type === 'mcq'
                              ? (currentQ.correctChoiceIds?.length || 1) > 1
                                ? 'Multiple Select'
                                : 'Multiple Choice'
                              : 'Essay Question'}
                          </span>
                        </div>
                        <span className="font-semibold text-amber-600 dark:text-amber-400 font-mono">
                          [{currentQ.points} pts] · {currentQ.chapter || 'English'}
                        </span>
                      </div>

                      <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-relaxed">
                        {currentQ.question}
                      </h4>

                      {(currentQ.imageUrls?.length ? currentQ.imageUrls : currentQ.imageUrl ? [currentQ.imageUrl] : []).map(
                        (imgSrc, imgIdx) => (
                          <div
                            key={imgIdx}
                            className="relative group my-2 max-w-md mx-auto rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <img
                              src={imgSrc}
                              alt={`Question illustration ${imgIdx + 1}`}
                              className="w-full max-h-72 object-contain cursor-pointer"
                              onClick={() => setZoomedImage(imgSrc)}
                            />
                            <button
                              type="button"
                              onClick={() => setZoomedImage(imgSrc)}
                              className="absolute bottom-2 right-2 min-h-[36px] px-2.5 py-1 rounded-lg bg-black/75 text-white hover:bg-black text-xs flex items-center gap-1 cursor-pointer"
                            >
                              <ZoomIn className="w-3.5 h-3.5" />
                              <span>Zoom Image</span>
                            </button>
                          </div>
                        )
                      )}
                    </div>

                    {currentQ.type === 'mcq' && currentQ.choices && (
                      <div className="space-y-2.5">
                        {currentQ.choices.map((choice, optIndex) => {
                          const selectedIds = resolveSelectedChoiceIds(currentQ, selectedAnswers[currentQ.id]);
                          const isSelected = selectedIds.includes(choice.id);
                          const isMulti = (currentQ.correctChoiceIds?.length || 1) > 1;
                          const letterPrefix = currentQ.options?.[optIndex]?.split(')')[0] || '';
                          return (
                            <button
                              key={choice.id}
                              type="button"
                              onClick={() => handleSelectChoice(currentQ, choice.id)}
                              className={`w-full min-h-[48px] text-left p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                isSelected
                                  ? 'bg-amber-500/15 border-amber-500 text-slate-900 dark:text-white font-bold shadow-md shadow-amber-500/10'
                                  : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div
                                  className={`w-5 h-5 ${
                                    isMulti ? 'rounded-md' : 'rounded-full'
                                  } border-2 flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'border-amber-500 dark:border-amber-400 bg-amber-500'
                                      : 'border-slate-400 dark:border-slate-600'
                                  }`}
                                >
                                  {isSelected && <span className="w-2 h-2 rounded-full bg-slate-950" />}
                                </div>
                                <span className="text-sm sm:text-base leading-relaxed">
                                  {letterPrefix ? `${letterPrefix}) ` : ''}
                                  {choice.text}
                                </span>
                              </div>
                              {choice.imageUrl && (
                                <img
                                  src={choice.imageUrl}
                                  alt="Option image"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setZoomedImage(choice.imageUrl || null);
                                  }}
                                  className="w-16 h-16 rounded-xl object-contain bg-white border border-slate-200 shrink-0"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {currentQ.type === 'essay' && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                          Write your complete answer with clear explanations and examples:
                        </label>
                        <textarea
                          rows={5}
                          value={selectedAnswers[currentQ.id] || ''}
                          onChange={(e) =>
                            setSelectedAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                          }
                          placeholder="Write your detailed English answer and explanation here..."
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl p-4 text-sm text-slate-900 dark:text-white"
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {stage === 'review' && reviewedAttempt && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setStage('overview')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-amber-500" />
                    <span>Back to Attempts Summary</span>
                  </button>
                </div>

                {expiredNotice && (
                  <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-300 text-xs font-bold text-center">
                    The time limit for this {categoryLabel.toLowerCase()} expired, and your answers were automatically saved and submitted.
                  </div>
                )}

                {grievanceToast && (
                  <div
                    className={`p-3 rounded-2xl text-xs font-bold text-center border ${
                      grievanceToast.type === 'ok'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {grievanceToast.text}
                  </div>
                )}

                <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-amber-50 via-white to-emerald-50 dark:from-slate-900 dark:via-[#1E293B] dark:to-slate-900 border border-amber-500/40 text-center shadow-lg">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-400 shadow-xl mb-3 flex items-center justify-center">
                    <Award className="w-7 h-7 text-slate-950" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">
                    {categoryLabel} Result (Attempt #{reviewedAttempt.attemptNumber})
                  </h3>
                  <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
                    <div className="px-5 py-3 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-slate-500 dark:text-slate-400 block">Score</span>
                      <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
                        {reviewedAttempt.score}{' '}
                        <span className="text-sm font-normal text-slate-500">/ {reviewedAttempt.totalPoints}</span>
                      </span>
                    </div>
                    <div className="px-5 py-3 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-slate-500 dark:text-slate-400 block">Percentage</span>
                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {Math.round(reviewedAttempt.percentage)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-500" />
                    <span>Answer Key &amp; Explanations Review:</span>
                  </h4>

                  {reviewQuestions.map((q, idx) => {
                    const rawAns = reviewedAttempt.answers?.[q.id] || '';
                    const selectedIds = q.type === 'mcq' ? resolveSelectedChoiceIds(q, rawAns) : [];
                    const isBlank = q.type === 'mcq' ? selectedIds.length === 0 : String(rawAns).trim() === '';
                    const gradedInfo = gradeQuestion(q, rawAns);
                    const explicitPts = reviewedAttempt.questionGrades?.[q.id];
                    const earnedPts = explicitPts !== undefined ? Number(explicitPts) : gradedInfo.awardedPoints;
                    const isCorrect = earnedPts >= q.points && q.points > 0;
                    const existingGrievance = grievances.find((g) => g.questionId === q.id);

                    return (
                      <div
                        key={q.id}
                        className={`p-4 rounded-2xl border space-y-3 ${
                          q.type === 'essay' && reviewedAttempt.essayGradingPending && !isBlank
                            ? 'bg-amber-50 dark:bg-amber-950/15 border-amber-500/30'
                            : isCorrect
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/40'
                            : 'bg-red-50 dark:bg-red-950/20 border-red-500/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            Q{idx + 1}: {q.question}
                          </span>
                          <span className="text-xs font-semibold font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                            {earnedPts} / {q.points} pts
                          </span>
                        </div>

                        {q.type === 'mcq' && q.choices && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.choices.map((c, ci) => {
                              const isChosen = selectedIds.includes(c.id);
                              const isTarget = (q.correctChoiceIds || []).includes(c.id);
                              const prefix = q.options?.[ci]?.split(')')[0] || '';
                              return (
                                <div
                                  key={c.id}
                                  className={`p-2.5 rounded-xl text-xs border ${
                                    isTarget
                                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold'
                                      : isChosen
                                      ? 'bg-red-500/15 border-red-500 text-red-700 dark:text-red-300 line-through'
                                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {prefix ? `${prefix}) ` : ''}
                                  {c.text}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {q.type === 'essay' && (
                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                            <span className="text-slate-500 dark:text-slate-400 block mb-1">Your answer:</span>
                            <p className="text-slate-900 dark:text-white whitespace-pre-wrap">
                              {rawAns || '<No answer written>'}
                            </p>
                          </div>
                        )}

                        {q.explanation && (
                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                            <strong className="text-amber-600 dark:text-amber-400 block mb-1">
                              Explanation:
                            </strong>
                            {q.explanation}
                          </div>
                        )}

                        {currentUser?.role === 'student' && !reviewedAttempt.id.startsWith('preview-') && (
                          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800">
                            {existingGrievance ? (
                              <span
                                className={`inline-block px-2.5 py-1 rounded-xl text-xs font-bold border ${
                                  existingGrievance.status === 'approved'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                    : existingGrievance.status === 'rejected'
                                    ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                }`}
                              >
                                {existingGrievance.status === 'approved'
                                  ? '✓ Appeal Approved & Points Awarded'
                                  : existingGrievance.status === 'rejected'
                                  ? 'Appeal Rejected'
                                  : 'Appeal Submitted (Under Review)'}
                              </span>
                            ) : (
                              <div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGrievanceDraftOpen((prev) => ({
                                      ...prev,
                                      [q.id]: !prev[q.id],
                                    }))
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-xs font-bold cursor-pointer"
                                >
                                  <MessageSquareWarning className="w-3.5 h-3.5" />
                                  <span>Appeal</span>
                                </button>

                                {grievanceDraftOpen[q.id] && (
                                  <div className="mt-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/30 space-y-2">
                                    <textarea
                                      rows={2}
                                      value={grievanceDraftText[q.id] || ''}
                                      onChange={(e) =>
                                        setGrievanceDraftText((prev) => ({
                                          ...prev,
                                          [q.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Briefly explain the reason for your appeal to the teacher..."
                                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setGrievanceDraftOpen((prev) => ({ ...prev, [q.id]: false }))
                                        }
                                        className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-bold cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          grievanceSubmittingId === q.id ||
                                          !(grievanceDraftText[q.id] || '').trim()
                                        }
                                        onClick={() => void handleSubmitGrievanceForQuestion(q)}
                                        className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold cursor-pointer"
                                      >
                                        {grievanceSubmittingId === q.id ? 'Submitting...' : 'Submit Appeal'}
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
              </div>
            )}
          </div>

          {/* Footer for Active Question Navigation */}
          {stage === 'active' && (
            <div
              className={`px-3 sm:px-5 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 ${
                isExpandedMode ? 'pb-[max(0.75rem,env(safe-area-inset-bottom))]' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => handleNavigateToQuestion(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
                className="min-h-[44px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                Question <span className="text-red-600 dark:text-red-400 font-mono font-bold">{currentQuestionIndex + 1}</span> of{' '}
                <span className="font-mono">{totalQuestions}</span>
              </div>

              <div className="flex items-center gap-2">
                {currentQuestionIndex < totalQuestions - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleNavigateToQuestion(Math.min(totalQuestions - 1, currentQuestionIndex + 1))
                    }
                    className="min-h-[44px] flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg shadow-blue-600/30 cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSubmittingNow}
                    onClick={() => setShowSubmitConfirm(true)}
                    className="min-h-[44px] flex items-center gap-1.5 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-bold text-white shadow-lg shadow-red-600/30 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{finishButtonText}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Submit Confirm Overlay */}
          {showSubmitConfirm && (
            <div className="fixed inset-0 z-[10005] bg-slate-950/85 dark:bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
              <div
                className={
                  isSummaryFullscreen
                    ? 'w-full h-full bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden text-left'
                    : 'w-full max-w-xl max-h-[calc(100dvh-2rem)] bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-3xl flex flex-col overflow-hidden shadow-2xl text-left'
                }
              >
                <div className="px-4 sm:px-6 py-4 bg-white dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Confirm {categoryLabel} Submission
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSummaryFullscreen((prev) => !prev)}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
                    >
                      {isSummaryFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubmitConfirm(false);
                        setIsSummaryFullscreen(false);
                      }}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span className="text-xs text-slate-500 block">All</span>
                      <strong className="text-xl font-black font-mono">{stats.total}</strong>
                    </div>
                    <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30">
                      <span className="text-xs text-emerald-700 dark:text-emerald-300 block">Answered</span>
                      <strong className="text-xl font-black text-emerald-600 font-mono">{stats.solvedCount}</strong>
                    </div>
                    <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30">
                      <span className="text-xs text-red-700 dark:text-red-300 block">Remaining</span>
                      <strong className="text-xl font-black text-red-600 font-mono">{stats.unsolvedCount}</strong>
                    </div>
                  </div>
                </div>

                <div className="px-4 sm:px-6 py-4 bg-white dark:bg-[#0F172A] border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubmitConfirm(false);
                      setIsSummaryFullscreen(false);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    Back to Questions
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingNow}
                    onClick={() => void submitAnswersSnapshot(selectedAnswersRef.current, 'submitted')}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs cursor-pointer"
                  >
                    {isSubmittingNow ? 'Submitting...' : 'Confirm Final Submission'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {zoomedImage && (
            <div
              onClick={() => setZoomedImage(null)}
              className="fixed inset-0 z-[10010] bg-black/95 backdrop-blur-md flex flex-col p-3 sm:p-6"
            >
              <div className="flex items-center justify-between text-white pb-3 shrink-0">
                <span className="text-sm font-bold">Image Preview</span>
                <button
                  type="button"
                  onClick={() => setZoomedImage(null)}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div onClick={(e) => e.stopPropagation()} className="flex-1 min-h-0 flex items-center justify-center">
                <img src={zoomedImage} alt="Zoomed image" className="max-w-full max-h-full object-contain rounded-xl" />
              </div>
            </div>
          )}
    </div>
  );
};
