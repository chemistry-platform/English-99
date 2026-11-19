/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  User,
  ClipboardCheck,
  Sparkles,
  Database,
  Wallet,
  CreditCard,
  Eye,
  Play,
  CheckCircle2,
  XCircle,
  BookOpen,
  Clock,
  Copy,
  Check,
  Upload,
  Zap,
  AlertCircle,
  Loader2,
  RotateCcw,
  Target,
  Search,
  Award,
  SlidersHorizontal,
  Smartphone,
  Building,
  MessageSquareWarning,
} from 'lucide-react';
import {
  AssessmentAttempt,
  ExamOrAssignment,
  ExamQuestion,
  ExamSubmission,
  PaymentMethodItem,
  PaymentRequest,
  PlatformSettings,
  QuestionBankAttemptEntry,
  QuestionGrievance,
  UserProfile,
} from '../types';
import { platformDB } from '../lib/storage';
import { generateUuid, toValidUuid } from '../lib/supabase';
import {
  applyAttemptOrderToQuestions,
  getCorrectAnswerDisplay,
  getStudentAnswerDisplay,
  gradeQuestion,
  normalizeQuestionsList,
  resolveSelectedChoiceIds,
} from '../lib/examGrading';
import {
  fetchGrievancesForAttempt,
  fetchStudentAttempts,
  submitQuestionGrievance,
} from '../lib/supabaseAssessments';
import { buildUnifiedQuestionBank } from '../lib/questionBankData';
import { normalizeGrade } from '../lib/courseHelpers';
import {
  formatTemplate,
  getGradeDisplayLabel,
  getPaymentMethodFallbackLabel,
  useLanguage,
} from '../lib/translations';
import { Modal } from './Modal';

export type MyAccountTopTab =
  | 'results'
  | 'custom-exam'
  | 'question-bank'
  | 'wallet-recharge'
  | 'card-recharge';

type ResultsSubTab = 'assignment' | 'exam' | 'sheet';

interface MyAccountSectionProps {
  currentUser: UserProfile;
  settings: PlatformSettings;
  exams: ExamOrAssignment[];
  submissions: ExamSubmission[];
  initialTopTab?: MyAccountTopTab;
  onStartExam: (exam: ExamOrAssignment) => void;
  onOpenProfile: () => void;
  onBalanceUpdated: () => void;
  onDataChanged: () => void;
}

interface EnrichedSubmissionRow {
  serial: number;
  submission: ExamSubmission;
  exam?: ExamOrAssignment;
  title: string;
  attemptNumber: number;
  totalQuestions: number;
  percentage: number;
  scoreFormatted: string;
  totalPointsFormatted: string;
  solvedCount: number;
  correctCount: number;
  startedAtFormatted: string;
  submittedAtFormatted: string;
}

function formatScoreNumber(val: number): string {
  const num = Number(val) || 0;
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(1).replace(/\.0$/, '');
}

function formatDateTimeLocalized(iso: string | undefined, locale: string, notRecordedLabel: string): string {
  if (!iso) return notRecordedLabel;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return notRecordedLabel;
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const MyAccountSection: React.FC<MyAccountSectionProps> = ({
  currentUser,
  exams,
  submissions,
  initialTopTab = 'results',
  onStartExam,
  onOpenProfile,
  onBalanceUpdated,
  onDataChanged,
}) => {
  const { t, lang, locale } = useLanguage();
  const activeTopTab: MyAccountTopTab = initialTopTab;
  const [resultsSubTab, setResultsSubTab] = useState<ResultsSubTab>('assignment');
  const [reviewRow, setReviewRow] = useState<EnrichedSubmissionRow | null>(null);
  const [remoteAttempts, setRemoteAttempts] = useState<AssessmentAttempt[]>([]);
  const [reviewGrievances, setReviewGrievances] = useState<QuestionGrievance[]>([]);
  const [grievanceDraftOpen, setGrievanceDraftOpen] = useState<Record<string, boolean>>({});
  const [grievanceDraftText, setGrievanceDraftText] = useState<Record<string, string>>({});
  const [grievanceSubmittingId, setGrievanceSubmittingId] = useState<string | null>(null);
  const [grievanceBanner, setGrievanceBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Custom Exam Generator State
  const [customChapter, setCustomChapter] = useState<string>('weakest');
  const [customCount, setCustomCount] = useState<number>(8);
  const [customDuration, setCustomDuration] = useState<number>(30);
  const [isCreatingCustomExam, setIsCreatingCustomExam] = useState(false);

  // Question Bank Interactive State
  const [qbChapterFilter, setQbChapterFilter] = useState<string>('All');
  const [qbLessonFilter, setQbLessonFilter] = useState<string>('All');
  const [qbTypeFilter, setQbTypeFilter] = useState<'all' | 'mcq' | 'essay'>('all');
  const [qbSearch, setQbSearch] = useState<string>('');
  const [qbAttempts, setQbAttempts] = useState<Record<string, QuestionBankAttemptEntry>>(() =>
    platformDB.getQuestionBankProgress(currentUser.id)
  );
  const [qbEssayDrafts, setQbEssayDrafts] = useState<Record<string, string>>({});
  const [qbShownModelAnswers, setQbShownModelAnswers] = useState<Record<string, boolean>>({});

  // Wallet Recharge State
  const activePaymentMethods = platformDB.getActivePaymentMethods();
  const [payMethod, setPayMethod] = useState<string>(
    () => platformDB.getActivePaymentMethods()[0]?.id || ''
  );
  const [payAmount, setPayAmount] = useState<string>('100');
  const [refNumber, setRefNumber] = useState<string>('');
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Card Recharge State
  const [cardCodeInput, setCardCodeInput] = useState<string>('');
  const [isRedeemingCard, setIsRedeemingCard] = useState<boolean>(false);
  const [cardFeedback, setCardFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  useEffect(() => {
    if (activePaymentMethods.length > 0 && !activePaymentMethods.some((m) => m.id === payMethod)) {
      setPayMethod(activePaymentMethods[0].id);
    } else if (activePaymentMethods.length === 0 && payMethod) {
      setPayMethod('');
    }
  }, [activePaymentMethods.length, payMethod]);

  // Load remote Question Bank progress & Supabase completed attempts for current student
  useEffect(() => {
    let mounted = true;
    platformDB.fetchQuestionBankProgressRemote(currentUser.id).then((loaded) => {
      if (mounted && loaded) {
        setQbAttempts(loaded);
      }
    });
    fetchStudentAttempts(currentUser.id).then((atts) => {
      if (mounted) {
        setRemoteAttempts(atts.filter((a) => a.status === 'submitted' || a.status === 'auto_submitted'));
      }
    });
    return () => {
      mounted = false;
    };
  }, [currentUser.id, submissions.length]);

  useEffect(() => {
    if (!reviewRow) {
      setReviewGrievances([]);
      setGrievanceDraftOpen({});
      setGrievanceDraftText({});
      setGrievanceBanner(null);
      return;
    }
    const targetAttemptId = reviewRow.submission.attemptId || reviewRow.submission.id;
    if (!targetAttemptId) return;
    let mounted = true;
    fetchGrievancesForAttempt(targetAttemptId).then((list) => {
      if (mounted) setReviewGrievances(list);
    });
    return () => {
      mounted = false;
    };
  }, [reviewRow]);

  // Match student submissions across ID / UUID / StudentCode + merge Supabase assessment_attempts
  const studentSubmissions = useMemo(() => {
    const userUuid = toValidUuid(currentUser.id);
    const localFiltered = submissions.filter((s) => {
      if (!s) return false;
      if (s.studentId === currentUser.id || toValidUuid(s.studentId) === userUuid) return true;
      if (currentUser.studentCode && s.studentCode === currentUser.studentCode) return true;
      return false;
    });

    const byKey = new Map<string, ExamSubmission>();
    localFiltered.forEach((s) => {
      byKey.set(s.attemptId || s.id, s);
    });

    remoteAttempts.forEach((att) => {
      const existing = byKey.get(att.id);
      byKey.set(att.id, {
        ...(existing || {}),
        id: att.id,
        attemptId: att.id,
        examId: att.assessmentId,
        formId: att.formId,
        formName: att.formName,
        submissionStatus: att.status,
        studentId: att.studentId,
        studentName: currentUser.fullName,
        studentCode: currentUser.studentCode,
        score: att.score,
        mcqScore: att.mcqScore,
        mcqTotal: att.mcqTotal,
        totalPoints: att.totalPoints,
        answers: att.answers,
        questionsSnapshot: att.questionsSnapshot,
        questionOrder: att.questionOrder,
        choiceOrders: att.choiceOrders,
        hasEssayQuestions: att.hasEssayQuestions,
        essayGradingPending: att.essayGradingPending,
        questionGrades: att.questionGrades,
        autoZeroedQuestions: att.autoZeroedQuestions,
        teacherFeedback: att.teacherFeedback,
        gradedAt: att.gradedAt,
        gradedBy: att.gradedBy,
        startedAt: att.startedAt,
        attemptNumber: att.attemptNumber,
        submittedAt: att.submittedAt || att.lastSeenAt,
      });
    });

    return Array.from(byKey.values());
  }, [submissions, remoteAttempts, currentUser.id, currentUser.fullName, currentUser.studentCode]);

  // Lookup exams by exact ID or UUID
  const examLookup = useMemo(() => {
    const map = new Map<string, ExamOrAssignment>();
    exams.forEach((ex) => {
      map.set(ex.id, ex);
      map.set(toValidUuid(ex.id), ex);
    });
    return map;
  }, [exams]);

  // Enrich submissions with chronological attempt numbers and accurate solved/correct counts
  const enrichedSubmissions = useMemo<EnrichedSubmissionRow[]>(() => {
    // Group chronologically (oldest first) per canonical examId to assign attemptNumber accurately
    const groupedByExam = new Map<string, ExamSubmission[]>();
    studentSubmissions.forEach((sub) => {
      const canonicalExamId = toValidUuid(sub.examId || 'unknown');
      const list = groupedByExam.get(canonicalExamId) || [];
      list.push(sub);
      groupedByExam.set(canonicalExamId, list);
    });

    const computedAttemptMap = new Map<string, number>();
    groupedByExam.forEach((list) => {
      const chronological = [...list].sort(
        (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
      );
      chronological.forEach((item, index) => {
        computedAttemptMap.set(item.id, item.attemptNumber || index + 1);
      });
    });

    const sortedNewestFirst = [...studentSubmissions].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );

    return sortedNewestFirst.map((sub, idx) => {
      const exam = examLookup.get(sub.examId) || examLookup.get(toValidUuid(sub.examId));
      const questions = normalizeQuestionsList(
        sub.questionsSnapshot && sub.questionsSnapshot.length > 0
          ? sub.questionsSnapshot
          : exam?.questions || []
      );
      const answersObj = sub.answers || {};
      const totalQuestions =
        questions.length > 0 ? questions.length : Math.max(Object.keys(answersObj).length, 1);

      const solvedCount =
        sub.solvedCount !== undefined
          ? sub.solvedCount
          : questions.length > 0
          ? questions.filter((q) => (answersObj[q.id] || '').trim() !== '').length
          : Object.values(answersObj).filter((v) => String(v || '').trim() !== '').length;

      let correctCount = 0;
      if (sub.correctCount !== undefined) {
        correctCount = sub.correctCount;
      } else if (questions.length > 0) {
        questions.forEach((q) => {
          const ans = (answersObj[q.id] || '').trim();
          if (sub.questionGrades && sub.questionGrades[q.id] !== undefined) {
            if (Number(sub.questionGrades[q.id]) >= q.points && q.points > 0) {
              correctCount += 1;
            }
          } else if (q.type === 'mcq' && gradeQuestion(q, ans).isCorrect) {
            correctCount += 1;
          }
        });
      }

      const maxPts = Math.max(1, Number(sub.totalPoints || exam?.totalPoints || 1));
      const pct = Math.min(100, Math.max(0, Math.round(((Number(sub.score) || 0) / maxPts) * 100)));

      return {
        serial: idx + 1,
        submission: sub,
        exam,
        title: exam?.title || t.myAccount.onlineAssessmentFallback,
        attemptNumber: computedAttemptMap.get(sub.id) || 1,
        totalQuestions,
        percentage: pct,
        scoreFormatted: formatScoreNumber(sub.score),
        totalPointsFormatted: formatScoreNumber(sub.totalPoints || exam?.totalPoints || 0),
        solvedCount,
        correctCount,
        startedAtFormatted: sub.startedAt
          ? formatDateTimeLocalized(sub.startedAt, locale, t.myAccount.notRecorded)
          : formatDateTimeLocalized(sub.submittedAt, locale, t.myAccount.notRecorded),
        submittedAtFormatted: formatDateTimeLocalized(sub.submittedAt, locale, t.myAccount.notRecorded),
      };
    });
  }, [studentSubmissions, examLookup, locale, t]);

  // Split enriched rows into the 3 results sub-tabs and re-number serial per sub-tab
  const subTabRows = useMemo(() => {
    const filtered = enrichedSubmissions.filter((row) => {
      const cat: ResultsSubTab = row.exam?.category || 'exam';
      return cat === resultsSubTab;
    });
    return filtered.map((row, idx) => ({ ...row, serial: idx + 1 }));
  }, [enrichedSubmissions, resultsSubTab]);

  const countsByCategory = useMemo(() => {
    let assignment = 0;
    let exam = 0;
    let sheet = 0;
    enrichedSubmissions.forEach((r) => {
      const cat = r.exam?.category || 'exam';
      if (cat === 'assignment') assignment += 1;
      else if (cat === 'sheet') sheet += 1;
      else exam += 1;
    });
    return { assignment, exam, sheet };
  }, [enrichedSubmissions]);

  // Question Bank unified items for student's grade
  const allGradeQuestions = useMemo(
    () => buildUnifiedQuestionBank(exams, currentUser.grade),
    [exams, currentUser.grade]
  );

  const qbChapters = useMemo(() => {
    const set = new Set<string>();
    allGradeQuestions.forEach((q) => {
      if (q.chapter) set.add(q.chapter);
    });
    return Array.from(set);
  }, [allGradeQuestions]);

  const qbLessons = useMemo(() => {
    const set = new Set<string>();
    allGradeQuestions.forEach((q) => {
      if (qbChapterFilter === 'All' || q.chapter === qbChapterFilter) {
        if (q.lesson) set.add(q.lesson);
      }
    });
    return Array.from(set);
  }, [allGradeQuestions, qbChapterFilter]);

  const filteredQbQuestions = useMemo(() => {
    const query = qbSearch.trim().toLowerCase();
    return allGradeQuestions.filter((q) => {
      if (qbChapterFilter !== 'All' && q.chapter !== qbChapterFilter) return false;
      if (qbLessonFilter !== 'All' && q.lesson !== qbLessonFilter) return false;
      if (qbTypeFilter !== 'all' && q.type !== qbTypeFilter) return false;
      if (
        query &&
        !q.question.toLowerCase().includes(query) &&
        !q.chapter.toLowerCase().includes(query) &&
        !q.lesson.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [allGradeQuestions, qbChapterFilter, qbLessonFilter, qbTypeFilter, qbSearch]);

  const qbStats = useMemo(() => {
    const total = allGradeQuestions.length;
    let solved = 0;
    let correct = 0;
    allGradeQuestions.forEach((q) => {
      const entry = qbAttempts[q.id];
      if (entry) {
        solved += 1;
        if (entry.isCorrect) correct += 1;
      }
    });
    const accuracy = solved > 0 ? Math.round((correct / solved) * 100) : 0;
    return { total, solved, correct, accuracy };
  }, [allGradeQuestions, qbAttempts]);

  // Student's level & weak chapter diagnostics for "امتحان خاص بيك"
  const studentDiagnostics = useMemo(() => {
    const chapterPerformance = new Map<string, { earned: number; possible: number; attempts: number }>();

    enrichedSubmissions.forEach((row) => {
      const questions = row.exam?.questions || [];
      if (questions.length > 0) {
        questions.forEach((q) => {
          const ch = q.chapter || row.exam?.chapter || t.myAccount.generalEnglishFallback;
          const curr = chapterPerformance.get(ch) || { earned: 0, possible: 0, attempts: 0 };
          curr.possible += Number(q.points) || 1;
          const ans = (row.submission.answers?.[q.id] || '').trim();
          const pts =
            row.submission.questionGrades?.[q.id] !== undefined
              ? Number(row.submission.questionGrades[q.id]) || 0
              : q.type === 'mcq'
              ? gradeQuestion(q, ans).awardedPoints
              : 0;
          curr.earned += pts;
          curr.attempts += 1;
          chapterPerformance.set(ch, curr);
        });
      }
    });

    const chapterStats = Array.from(chapterPerformance.entries()).map(([chapter, data]) => ({
      chapter,
      percent: data.possible > 0 ? Math.round((data.earned / data.possible) * 100) : 0,
      attempts: data.attempts,
    }));

    chapterStats.sort((a, b) => a.percent - b.percent);

    const avgPct =
      enrichedSubmissions.length > 0
        ? Math.round(
            enrichedSubmissions.reduce((acc, r) => acc + r.percentage, 0) / enrichedSubmissions.length
          )
        : 0;

    const weakestChapter = chapterStats[0]?.chapter || qbChapters[0] || t.myAccount.unit1Fallback;
    const levelLabel =
      enrichedSubmissions.length === 0
        ? t.myAccount.levelFoundation
        : avgPct >= 85
        ? t.myAccount.levelAdvanced
        : avgPct >= 65
        ? t.myAccount.levelVeryGood
        : t.myAccount.levelNeedsPractice;

    return {
      avgPct,
      weakestChapter,
      levelLabel,
      chapterStats,
    };
  }, [enrichedSubmissions, qbChapters, t]);

  // Custom exams already generated for this student
  const studentCustomExams = useMemo(
    () =>
      exams.filter(
        (ex) =>
          ex.isCustomForStudentId === currentUser.id ||
          ex.isCustomForStudentId === toValidUuid(currentUser.id)
      ),
    [exams, currentUser.id]
  );

  // Recommended grade-matched platform exams
  const gradeRecommendedExams = useMemo(
    () =>
      exams.filter(
        (ex) => !ex.isCustomForStudentId && normalizeGrade(ex.grade) === normalizeGrade(currentUser.grade)
      ),
    [exams, currentUser.grade]
  );

  // Handlers
  const handleSelectQbMcq = (question: ExamQuestion, option: string) => {
    const isCorrect = gradeQuestion(question, option).isCorrect;
    const updated: Record<string, QuestionBankAttemptEntry> = {
      ...qbAttempts,
      [question.id]: {
        questionId: question.id,
        selectedAnswer: option,
        isCorrect,
        answeredAt: new Date().toISOString(),
      },
    };
    setQbAttempts(updated);
    platformDB.saveQuestionBankProgress(currentUser.id, updated);
  };

  const handleMarkQbEssaySelfCheck = (questionId: string, isCorrect: boolean) => {
    const draft = (qbEssayDrafts[questionId] || '').trim() || t.myAccount.selfAssessedDraft;
    const updated: Record<string, QuestionBankAttemptEntry> = {
      ...qbAttempts,
      [questionId]: {
        questionId,
        selectedAnswer: draft,
        isCorrect,
        answeredAt: new Date().toISOString(),
      },
    };
    setQbAttempts(updated);
    platformDB.saveQuestionBankProgress(currentUser.id, updated);
  };

  const handleResetQuestionBank = () => {
    const next = { ...qbAttempts };
    filteredQbQuestions.forEach((q) => {
      delete next[q.id];
    });
    setQbAttempts(next);
    platformDB.saveQuestionBankProgress(currentUser.id, next);
  };

  const handleCreateAndStartCustomExam = async () => {
    setIsCreatingCustomExam(true);
    try {
      const targetChapterName =
        customChapter === 'weakest' ? studentDiagnostics.weakestChapter : customChapter;

      let candidateQuestions = allGradeQuestions.filter((q) => {
        if (customChapter === 'all') return true;
        return (
          q.chapter === targetChapterName ||
          q.chapter.includes(targetChapterName) ||
          targetChapterName.includes(q.chapter)
        );
      });

      if (candidateQuestions.length < 3) {
        candidateQuestions = allGradeQuestions;
      }

      // Shuffle and pick up to requested count
      const shuffled = [...candidateQuestions].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(customCount, shuffled.length));

      const examQuestions: ExamQuestion[] = selected.map((q, idx) => ({
        id: `${q.id}-c${idx + 1}`,
        type: q.type,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        points: q.points || 2,
        imageUrl: q.imageUrl,
        chapter: q.chapter,
        lesson: q.lesson,
      }));

      const totalPts = examQuestions.reduce((acc, q) => acc + (Number(q.points) || 2), 0);
      const titleScope =
        customChapter === 'all'
          ? t.myAccount.fullCurriculumScope
          : customChapter === 'weakest'
          ? formatTemplate(t.myAccount.focusedPracticeScope, { chapter: targetChapterName })
          : targetChapterName;

      const customExam: ExamOrAssignment = {
        id: generateUuid(),
        title: formatTemplate(t.myAccount.customExamTitleTemplate, { scope: titleScope }),
        category: 'exam',
        grade: normalizeGrade(currentUser.grade),
        durationMinutes: customDuration,
        maxCompletionHours: Math.max(1, Math.ceil(customDuration / 60)),
        totalPoints: totalPts,
        deadline: t.myAccount.customExamDeadline,
        lessonTitle: formatTemplate(t.myAccount.customExamCustomizedFor, { name: currentUser.fullName }),
        chapter: titleScope,
        isCustomForStudentId: currentUser.id,
        questions: examQuestions,
        createdAt: new Date().toISOString(),
      };

      await platformDB.saveExamAsync(customExam);
      onDataChanged();
      onStartExam(customExam);
    } finally {
      setIsCreatingCustomExam(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPaymentMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 960;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            setReceiptImage(canvas.toDataURL('image/jpeg', 0.72));
            return;
          }
        } catch {
          // fallback
        }
        setReceiptImage(rawDataUrl);
      };
      img.onerror = () => setReceiptImage(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitWalletRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activePaymentMethods.length === 0) {
      setPaymentMessage({
        type: 'error',
        text: t.myAccount.noMethodsErr,
      });
      return;
    }
    const numericAmount = parseFloat(payAmount);
    if (!numericAmount || numericAmount <= 0) {
      setPaymentMessage({ type: 'error', text: t.myAccount.validAmountErr });
      return;
    }
    const chosenMethod =
      activePaymentMethods.find((m) => m.id === payMethod) || activePaymentMethods[0];
    setIsSubmittingPayment(true);
    setPaymentMessage(null);
    try {
      const newReq: PaymentRequest = {
        id: generateUuid(),
        studentId: currentUser.id,
        studentName: currentUser.fullName,
        studentPhone: currentUser.phone,
        studentCode: currentUser.studentCode,
        method: chosenMethod.id,
        methodLabel: chosenMethod.name,
        amount: numericAmount,
        receiptImage: receiptImage || undefined,
        referenceNumber: refNumber.trim() || `REF-${Date.now().toString().slice(-6)}`,
        status: 'pending',
        notes: t.myAccount.pendingAdminNote,
        createdAt: new Date().toISOString(),
      };
      const { supabaseResult } = await platformDB.addPaymentRequestAsync(newReq);
      if (!supabaseResult.success) {
        setPaymentMessage({
          type: 'error',
          text: supabaseResult.error || t.myAccount.submitPaymentDbErr,
        });
        return;
      }
      setPaymentMessage({
        type: 'success',
        text: t.myAccount.submitPaymentSuccess,
      });
      setReceiptImage('');
      setRefNumber('');
      onBalanceUpdated();
    } catch (err: any) {
      setPaymentMessage({ type: 'error', text: err?.message || t.myAccount.submitPaymentErr });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleRedeemCardCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardCodeInput.trim() || isRedeemingCard) return;
    setIsRedeemingCard(true);
    setCardFeedback(null);
    try {
      const res = await platformDB.redeemCodeForUserAsync(cardCodeInput.trim(), currentUser.id);
      setCardFeedback(res);
      if (res.success) {
        setCardCodeInput('');
        onBalanceUpdated();
        onDataChanged();
      }
    } finally {
      setIsRedeemingCard(false);
    }
  };

  const studentPayments = useMemo(
    () =>
      platformDB
        .getPayments()
        .filter(
          (p) =>
            p.studentId === currentUser.id ||
            toValidUuid(p.studentId) === toValidUuid(currentUser.id) ||
            (currentUser.phone && p.studentPhone === currentUser.phone) ||
            (currentUser.studentCode && p.studentCode === currentUser.studentCode)
        ),
    [currentUser.id, currentUser.phone, currentUser.studentCode, paymentMessage]
  );

  const activeSectionLabel =
    activeTopTab === 'results'
      ? t.myAccount.sectionLabelResults
      : activeTopTab === 'custom-exam'
      ? t.myAccount.sectionLabelCustomExam
      : activeTopTab === 'question-bank'
      ? t.myAccount.sectionLabelQuestionBank
      : activeTopTab === 'wallet-recharge'
      ? t.myAccount.sectionLabelWalletRecharge
      : t.myAccount.sectionLabelCardRecharge;

  const subTabs: { id: ResultsSubTab; label: string; count: number }[] = [
    { id: 'assignment', label: t.myAccount.subTabAssignments, count: countsByCategory.assignment },
    { id: 'exam', label: t.myAccount.subTabExams, count: countsByCategory.exam },
    { id: 'sheet', label: t.myAccount.subTabSheets, count: countsByCategory.sheet },
  ];

  const activeCategoryName =
    resultsSubTab === 'assignment'
      ? t.myAccount.catAssignmentWord
      : resultsSubTab === 'sheet'
      ? t.myAccount.catSheetWord
      : t.myAccount.catExamWord;

  const gradeDisplayLabel = getGradeDisplayLabel(normalizeGrade(currentUser.grade), t);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Account Summary Header */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <User className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate">
                {formatTemplate(t.myAccount.headerTitlePrefix, { name: currentUser.fullName })}
              </h2>
              <span
                dir="ltr"
                className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-bold font-mono tabular-nums"
              >
                {currentUser.studentCode}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              {activeSectionLabel} · {gradeDisplayLabel} · {t.myAccount.walletBalanceInline}{' '}
              <strong className="text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                {currentUser.balance || 0} {t.common.currency}
              </strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenProfile}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/15 text-slate-800 dark:text-slate-100 hover:text-amber-700 dark:hover:text-amber-300 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors shrink-0 cursor-pointer"
        >
          <SlidersHorizontal className="w-4 h-4 text-amber-500" />
          <span>{t.myAccount.editPersonalProfileBtn}</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: Assignments & Exams Results                                    */}
      {/* ===================================================================== */}
      {activeTopTab === 'results' && (
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-6">
          {/* Header & Subtitle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-amber-500" />
                <span>{t.myAccount.resultsHeading}</span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                {t.myAccount.resultsDesc}
              </p>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-400 font-mono tabular-nums self-start sm:self-center">
              {formatTemplate(t.myAccount.totalSubmissionsLabel, { count: enrichedSubmissions.length })}
            </div>
          </div>

          {/* 3 Sub-tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {subTabs.map((sub) => {
              const isSelected = resultsSubTab === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setResultsSubTab(sub.id)}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap shrink-0 border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-amber-500/50'
                  }`}
                >
                  <span>{sub.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-mono tabular-nums ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {sub.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Empty State or Data Table + Mobile Cards */}
          {subTabRows.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
              <ClipboardCheck className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {formatTemplate(t.myAccount.noAttemptsInSubTab, {
                  tab: subTabs.find((s) => s.id === resultsSubTab)?.label || '',
                })}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatTemplate(t.myAccount.noAttemptsSubHint, { category: activeCategoryName })}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop & Tablet Responsive Table (>= md) */}
              <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse">
                    <thead>
                      <tr className="bg-amber-500 text-slate-950 text-xs font-extrabold whitespace-nowrap">
                        <th className="py-3.5 px-3">#</th>
                        <th className="py-3.5 px-3">{t.myAccount.colAttemptNum}</th>
                        <th className="py-3.5 px-3">
                          {resultsSubTab === 'assignment'
                            ? t.myAccount.colAssignName
                            : resultsSubTab === 'sheet'
                            ? t.myAccount.colSheetName
                            : t.myAccount.colExamName}
                        </th>
                        <th className="py-3.5 px-3">{t.myAccount.colQuestions}</th>
                        <th className="py-3.5 px-3">{t.myAccount.colScorePct}</th>
                        <th className="py-3.5 px-3">{t.myAccount.colMarks}</th>
                        <th className="py-3.5 px-3">{t.myAccount.colAnswered}</th>
                        <th className="py-3.5 px-3">{t.myAccount.colCorrect}</th>
                        <th className="py-3.5 px-3">{t.myAccount.colStartedAt}</th>
                        <th className="py-3.5 px-3">{t.myAccount.colFinishedAt}</th>
                        <th className="py-3.5 px-3 text-center">{t.myAccount.colViewAnswers}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {subTabRows.map((row) => (
                        <tr
                          key={row.submission.id}
                          className="odd:bg-white even:bg-slate-50/90 dark:odd:bg-[#0F172A] dark:even:bg-slate-900/70 hover:bg-amber-50/60 dark:hover:bg-slate-800/70 transition-colors"
                        >
                          <td className="py-3.5 px-3 font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
                            {row.serial}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
                            #{row.attemptNumber}
                          </td>
                          <td className="py-3.5 px-3 font-bold text-slate-900 dark:text-white min-w-[200px]">
                            {row.title}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {row.totalQuestions}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg font-extrabold ${
                                row.percentage >= 75
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : row.percentage >= 50
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                  : 'bg-red-500/15 text-red-700 dark:text-red-400'
                              }`}
                            >
                              {row.percentage}%
                            </span>
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {row.scoreFormatted} / {row.totalPointsFormatted}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {row.solvedCount}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                            {row.correctCount}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {row.startedAtFormatted}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {row.submittedAtFormatted}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setReviewRow(row)}
                              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{t.myAccount.viewAnswersBtn}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards View (< md) */}
              <div className="md:hidden space-y-3">
                {subTabRows.map((row) => (
                  <div
                    key={row.submission.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span>{formatTemplate(t.myAccount.serialLabel, { serial: row.serial })}</span>
                          <span>·</span>
                          <span className="text-blue-600 dark:text-blue-400 font-bold">
                            {formatTemplate(t.myAccount.attemptNumLabel, { num: row.attemptNumber })}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                          {row.title}
                        </h4>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-xl text-xs font-black font-mono tabular-nums shrink-0 ${
                          row.percentage >= 75
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : row.percentage >= 50
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            : 'bg-red-500/15 text-red-700 dark:text-red-400'
                        }`}
                      >
                        {row.percentage}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">{t.myAccount.marksLabel}</span>
                        <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                          {row.scoreFormatted} / {row.totalPointsFormatted}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          {t.myAccount.questionsAnsweredCorrectLabel}
                        </span>
                        <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                          {formatTemplate(t.myAccount.answeredTotalCorrectFmt, {
                            solved: row.solvedCount,
                            total: row.totalQuestions,
                            correct: row.correctCount,
                          })}
                        </strong>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums space-y-1">
                      <div>{t.myAccount.startedPrefix} {row.startedAtFormatted}</div>
                      <div>{t.myAccount.finishedPrefix} {row.submittedAtFormatted}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setReviewRow(row)}
                      className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{t.myAccount.viewAnswersExplanationsBtn}</span>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: Custom Exam for You                                            */}
      {/* ===================================================================== */}
      {activeTopTab === 'custom-exam' && (
        <section className="space-y-6">
          {/* Performance Diagnostics + Personalized Builder */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    {t.myAccount.customTailoredTitle}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {formatTemplate(t.myAccount.customTailoredDesc, { grade: gradeDisplayLabel })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.myAccount.questionScopeLabel}
                  </label>
                  <select
                    value={customChapter}
                    onChange={(e) => setCustomChapter(e.target.value)}
                    className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="weakest">
                      {formatTemplate(t.myAccount.recommendedScopeOpt, { chapter: studentDiagnostics.weakestChapter })}
                    </option>
                    <option value="all">{t.myAccount.fullCurriculumAllUnits}</option>
                    {qbChapters.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.myAccount.numberOfQuestionsLabel}
                  </label>
                  <select
                    value={customCount}
                    onChange={(e) => setCustomCount(Number(e.target.value))}
                    className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold font-mono text-slate-900 dark:text-white"
                  >
                    <option value={5}>{t.myAccount.qCount5}</option>
                    <option value={8}>{t.myAccount.qCount8}</option>
                    <option value={12}>{t.myAccount.qCount12}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t.myAccount.examDurationLabel}
                  </label>
                  <select
                    value={customDuration}
                    onChange={(e) => setCustomDuration(Number(e.target.value))}
                    className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold font-mono text-slate-900 dark:text-white"
                  >
                    <option value={15}>{t.myAccount.mins15}</option>
                    <option value={30}>{t.myAccount.mins30}</option>
                    <option value={45}>{t.myAccount.mins45}</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={isCreatingCustomExam || allGradeQuestions.length === 0}
                  onClick={handleCreateAndStartCustomExam}
                  className="min-h-[46px] px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {isCreatingCustomExam ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-slate-950" />
                  )}
                  <span>{t.myAccount.generateStartBtn}</span>
                </button>
              </div>
            </div>

            {/* Level Diagnostics Card */}
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
                <Target className="w-5 h-5" />
                <span>{t.myAccount.academicLevelAnalysis}</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">{t.myAccount.currentAvgScore}</span>
                <div className="text-3xl font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                  {studentDiagnostics.avgPct}%
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {studentDiagnostics.levelLabel}
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  {t.myAccount.recommendedFocusUnit}
                </span>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-800 dark:text-amber-300">
                  {studentDiagnostics.weakestChapter}
                </div>
              </div>
            </div>
          </div>

          {/* Student's Previously Generated Custom Exams & Recommended Grade Exams */}
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
            <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <span>{formatTemplate(t.myAccount.previousAndRecommendedTitle, { grade: gradeDisplayLabel })}</span>
            </h4>

            {studentCustomExams.length === 0 && gradeRecommendedExams.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                {t.myAccount.emptyCustomExamsPrompt}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...studentCustomExams, ...gradeRecommendedExams].map((ex) => {
                  const isCustom = Boolean(ex.isCustomForStudentId);
                  const latestSub = enrichedSubmissions.find(
                    (r) => r.submission.examId === ex.id || toValidUuid(r.submission.examId) === toValidUuid(ex.id)
                  );
                  return (
                    <div
                      key={ex.id}
                      className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4 hover:border-amber-500/50 transition-colors"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${
                              isCustom
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                                : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {isCustom
                              ? t.myAccount.badgeCustomExam
                              : ex.category === 'assignment'
                              ? t.myAccount.badgeAssignment
                              : ex.category === 'sheet'
                              ? t.myAccount.badgeSheet
                              : t.myAccount.badgeOfficialExam}
                          </span>
                          {latestSub && (
                            <span className="text-[11px] font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                              {formatTemplate(t.myAccount.lastScorePrefix, { pct: latestSub.percentage })}
                            </span>
                          )}
                        </div>
                        <h5 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2">
                          {ex.title}
                        </h5>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {formatTemplate(t.myAccount.examMetaSummary, {
                            qs: ex.questions.length,
                            pts: ex.totalPoints,
                            mins: ex.durationMinutes,
                          })}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onStartExam(ex)}
                        className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-slate-950" />
                        <span>{latestSub ? t.myAccount.retakePracticeBtn : t.myAccount.startExamNowBtn}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: Question Bank                                                  */}
      {/* ===================================================================== */}
      {activeTopTab === 'question-bank' && (
        <section className="space-y-6">
          {/* Header & Practice Progress Stats */}
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-amber-500" />
                  <span>{formatTemplate(t.myAccount.qbInteractiveHeading, { grade: gradeDisplayLabel })}</span>
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {t.myAccount.qbInteractiveDesc}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold">
                  {formatTemplate(t.myAccount.qbAvailableStat, { count: qbStats.total })}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 font-bold">
                  {formatTemplate(t.myAccount.qbSolvedStat, { count: qbStats.solved })}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold">
                  {formatTemplate(t.myAccount.qbAccuracyStat, { pct: qbStats.accuracy })}
                </span>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {t.myAccount.qbFilterUnit}
                </label>
                <select
                  value={qbChapterFilter}
                  onChange={(e) => {
                    setQbChapterFilter(e.target.value);
                    setQbLessonFilter('All');
                  }}
                  className="w-full min-h-[42px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="All">{formatTemplate(t.myAccount.qbAllUnitsOpt, { count: qbChapters.length })}</option>
                  {qbChapters.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {t.myAccount.qbFilterLesson}
                </label>
                <select
                  value={qbLessonFilter}
                  onChange={(e) => setQbLessonFilter(e.target.value)}
                  className="w-full min-h-[42px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="All">{formatTemplate(t.myAccount.qbAllLessonsOpt, { count: qbLessons.length })}</option>
                  {qbLessons.map((ls) => (
                    <option key={ls} value={ls}>
                      {ls}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {t.myAccount.qbQuestionTypeLabel}
                </label>
                <select
                  value={qbTypeFilter}
                  onChange={(e: any) => setQbTypeFilter(e.target.value)}
                  className="w-full min-h-[42px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="all">{t.myAccount.qbTypeAll}</option>
                  <option value="mcq">{t.myAccount.qbTypeMcq}</option>
                  <option value="essay">{t.myAccount.qbTypeEssay}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {t.myAccount.qbSearchLabel}
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={qbSearch}
                    onChange={(e) => setQbSearch(e.target.value)}
                    placeholder={t.myAccount.qbSearchDetailedPlaceholder}
                    className="w-full min-h-[42px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl ps-9 pe-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {filteredQbQuestions.length > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">
                  {t.myAccount.qbShowingPrefix} <strong className="font-mono">{filteredQbQuestions.length}</strong> {t.myAccount.qbShowingSuffix}
                </span>
                <button
                  type="button"
                  onClick={handleResetQuestionBank}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-500/10 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 text-xs font-bold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t.myAccount.qbResetPracticeBtn}</span>
                </button>
              </div>
            )}
          </div>

          {/* Interactive Practice Cards */}
          {filteredQbQuestions.length === 0 ? (
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-2">
              <Database className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {t.myAccount.qbNoMatch}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredQbQuestions.map((q, idx) => {
                const attempt = qbAttempts[q.id];
                const isSolved = Boolean(attempt);
                const showModel = Boolean(qbShownModelAnswers[q.id] || isSolved);

                return (
                  <div
                    key={q.id}
                    className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-md space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black font-mono tabular-nums">
                          {formatTemplate(t.myAccount.qbQuestionNum, { num: idx + 1 })}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                          {q.chapter}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          {q.lesson}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${
                          q.type === 'mcq'
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30'
                            : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30'
                        }`}
                      >
                        {q.type === 'mcq' ? t.myAccount.qbBadgeMcq : t.myAccount.qbBadgeEssay}
                      </span>
                    </div>

                    <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-relaxed">
                      {q.question}
                    </h4>

                    {q.imageUrl && (
                      <div className="max-w-sm rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                        <img src={q.imageUrl} alt={t.myAccount.qbQuestionImgAlt} className="w-full object-contain" />
                      </div>
                    )}

                    {q.type === 'mcq' && q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.options.map((opt) => {
                          const isChosen = attempt?.selectedAnswer === opt;
                          const isTarget = opt.trim() === (q.correctAnswer || '').trim();

                          let optionClass =
                            'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-amber-500/60';
                          if (isSolved) {
                            if (isTarget) {
                              optionClass =
                                'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold';
                            } else if (isChosen && !isTarget) {
                              optionClass =
                                'bg-red-500/15 border-red-500 text-red-700 dark:text-red-300 font-bold';
                            } else {
                              optionClass =
                                'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400';
                            }
                          }

                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleSelectQbMcq(q, opt)}
                              className={`min-h-[44px] p-3.5 rounded-2xl border text-start text-xs sm:text-sm flex items-center justify-between gap-2 transition-all cursor-pointer ${optionClass}`}
                            >
                              <span>{opt}</span>
                              {isSolved && isTarget && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              )}
                              {isSolved && isChosen && !isTarget && (
                                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.type === 'essay' && (
                      <div className="space-y-3">
                        <textarea
                          rows={3}
                          value={qbEssayDrafts[q.id] || ''}
                          onChange={(e) =>
                            setQbEssayDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          placeholder={t.myAccount.qbEssayPlaceholder}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl p-3 text-xs sm:text-sm text-slate-900 dark:text-white"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setQbShownModelAnswers((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                            }
                            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                          >
                            {showModel ? t.myAccount.qbHideModel : t.myAccount.qbShowModel}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMarkQbEssaySelfCheck(q.id, true)}
                            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                              attempt?.isCorrect
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {t.myAccount.qbAnsweredCorrectly}
                          </button>
                        </div>
                      </div>
                    )}

                    {(isSolved || showModel) && (
                      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-500/30 space-y-1.5 text-xs">
                        {q.type === 'essay' && (
                          <p className="text-slate-900 dark:text-white font-bold">
                            {t.myAccount.qbModelAnswerPrefix} {q.correctAnswer}
                          </p>
                        )}
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                          <strong className="text-amber-700 dark:text-amber-400">{t.myAccount.qbExplanationPrefix} </strong>
                          {q.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: Wallet Top-Up                                                  */}
      {/* ===================================================================== */}
      {activeTopTab === 'wallet-recharge' && (
        <section className="space-y-6">
          {/* Balance Card + Official Channels */}
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-amber-500" />
                  <span>{t.myAccount.walletTopUpHeading}</span>
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {t.myAccount.walletTopUpDesc}
                </p>
              </div>
              <div className="px-5 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-center shrink-0">
                <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 block">
                  {t.myAccount.availableBalanceLabel}
                </span>
                <span className="text-2xl font-black text-amber-700 dark:text-amber-400 font-mono tabular-nums">
                  {currentUser.balance || 0} {t.common.currency}
                </span>
              </div>
            </div>

            {/* Official Methods */}
            {activePaymentMethods.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 text-center">
                {t.myAccount.noChannelsEnabled}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activePaymentMethods.map((method: PaymentMethodItem) => {
                  const accent =
                    method.accentColor === 'red'
                      ? { badge: 'text-red-600 dark:text-red-400 bg-red-500/10', icon: 'text-red-500' }
                      : method.accentColor === 'purple'
                      ? { badge: 'text-purple-600 dark:text-purple-400 bg-purple-500/10', icon: 'text-purple-500' }
                      : method.accentColor === 'blue'
                      ? { badge: 'text-blue-600 dark:text-blue-400 bg-blue-500/10', icon: 'text-blue-500' }
                      : method.accentColor === 'emerald'
                      ? { badge: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', icon: 'text-emerald-500' }
                      : { badge: 'text-amber-600 dark:text-amber-400 bg-amber-500/10', icon: 'text-amber-500' };

                  const MethodIcon =
                    method.iconType === 'phone'
                      ? Smartphone
                      : method.iconType === 'zap'
                      ? Zap
                      : method.iconType === 'building'
                      ? Building
                      : method.iconType === 'wallet'
                      ? Wallet
                      : CreditCard;

                  return (
                    <div
                      key={method.id}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${accent.badge}`}>
                          {method.name}
                        </span>
                        <MethodIcon className={`w-4 h-4 shrink-0 ${accent.icon}`} />
                      </div>
                      <div className="flex items-center justify-between bg-white dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono font-black text-xs sm:text-sm">
                        <span dir="ltr" className="truncate">
                          {method.accountValue}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(method.accountValue, method.id)}
                          className="text-slate-500 hover:text-amber-500 shrink-0 ms-1 cursor-pointer"
                          title={t.myAccount.copyTransferTitle}
                        >
                          {copiedKey === method.id ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {method.instructions && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {method.instructions}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Inline Payment Request Form */}
            <form
              onSubmit={handleSubmitWalletRecharge}
              className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-500" />
                <span>{t.myAccount.submitReceiptHeading}</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t.myAccount.payMethodLabel}
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    disabled={activePaymentMethods.length === 0}
                    className="w-full min-h-[42px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    {activePaymentMethods.length === 0 ? (
                      <option value="">{t.myAccount.noMethodsEnabledOpt}</option>
                    ) : (
                      activePaymentMethods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.accountValue})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t.myAccount.topUpAmountLabel}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    dir="ltr"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full min-h-[42px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t.myAccount.senderRefLabel}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={refNumber}
                    onChange={(e) => setRefNumber(e.target.value)}
                    placeholder={t.myAccount.senderRefPlaceholder}
                    className="w-full min-h-[42px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t.myAccount.receiptOptLabel}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full text-xs text-slate-500 dark:text-slate-400 file:me-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 cursor-pointer"
                />
                {receiptImage && (
                  <div className="mt-2 w-24 h-24 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700">
                    <img src={receiptImage} alt={t.myAccount.receiptPreviewAlt} className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {paymentMessage && (
                <div
                  className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                    paymentMessage.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                  }`}
                >
                  {paymentMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{paymentMessage.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingPayment}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-xs sm:text-sm shadow-lg flex items-center gap-2 cursor-pointer"
              >
                {isSubmittingPayment && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{isSubmittingPayment ? t.myAccount.submittingRequestBtn : t.myAccount.confirmSubmitTopUpBtn}</span>
              </button>
            </form>
          </div>

          {/* Student Payment History */}
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>{t.myAccount.txHistoryHeading}</span>
            </h4>
            {studentPayments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
                {t.myAccount.noTxHistory}
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {studentPayments.map((p) => (
                  <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-black text-slate-900 dark:text-white font-mono tabular-nums">
                        {p.amount} {t.common.currency}
                      </span>{' '}
                      <span dir="ltr" className="text-slate-500 dark:text-slate-400 font-mono">
                        ({p.referenceNumber})
                      </span>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {p.methodLabel || getPaymentMethodFallbackLabel(p.method, undefined, t, lang)} ·{' '}
                        {new Date(p.createdAt).toLocaleDateString(locale)}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg font-bold border ${
                        p.status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                          : p.status === 'rejected'
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {p.status === 'approved'
                        ? t.myAccount.statusCredited
                        : p.status === 'rejected'
                        ? t.myAccount.statusRejected
                        : t.myAccount.statusPending}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: Card Top-Up                                                    */}
      {/* ===================================================================== */}
      {activeTopTab === 'card-recharge' && (
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-8 shadow-xl space-y-5 max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                {t.myAccount.cardTopUpHeading}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {t.myAccount.cardTopUpDesc}
              </p>
            </div>
          </div>

          <form onSubmit={handleRedeemCardCode} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.myAccount.cardCodeLabel}
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={cardCodeInput}
                  onChange={(e) => setCardCodeInput(e.target.value)}
                  placeholder={t.myAccount.cardCodePlaceholder}
                  className="flex-1 min-h-[46px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <button
                  type="submit"
                  disabled={isRedeemingCard}
                  className="min-h-[46px] px-7 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white font-black text-sm shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                >
                  {isRedeemingCard ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 fill-white" />
                  )}
                  <span>{isRedeemingCard ? t.myAccount.redeemingCardBtn : t.myAccount.redeemCardBtn}</span>
                </button>
              </div>
            </div>

            {cardFeedback && (
              <div
                className={`p-4 rounded-2xl border text-xs sm:text-sm font-bold flex items-center gap-2 ${
                  cardFeedback.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                }`}
              >
                {cardFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{cardFeedback.message}</span>
              </div>
            )}
          </form>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5 leading-relaxed">
            <strong className="text-slate-900 dark:text-white block">{t.myAccount.cardInstructionsTitle}</strong>
            <p>{t.myAccount.cardInstruction1}</p>
            <p>{t.myAccount.cardInstruction2}</p>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* SHARED MODAL: View Answers & Explanations                             */}
      {/* ===================================================================== */}
      <Modal
        isOpen={Boolean(reviewRow)}
        onClose={() => setReviewRow(null)}
        maxWidthClass="max-w-3xl"
        title={reviewRow ? formatTemplate(t.myAccount.reviewTitleTemplate, { title: reviewRow.title }) : t.myAccount.reviewTitleDefault}
        subtitle={
          reviewRow
            ? formatTemplate(t.myAccount.reviewSubtitleTemplate, {
                attempt: reviewRow.attemptNumber,
                score: reviewRow.scoreFormatted,
                total: reviewRow.totalPointsFormatted,
                pct: reviewRow.percentage,
              })
            : undefined
        }
        bodyClassName="p-4 sm:p-6 space-y-4"
        footer={
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setReviewRow(null)}
              className="min-h-[42px] px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm cursor-pointer"
            >
              {t.myAccount.closeReviewBtn}
            </button>
          </div>
        }
      >
        {reviewRow && (() => {
          const snapshotQs =
            reviewRow.submission.questionsSnapshot && reviewRow.submission.questionsSnapshot.length > 0
              ? reviewRow.submission.questionsSnapshot
              : reviewRow.exam?.questions || [];
          const orderedReviewQuestions = applyAttemptOrderToQuestions(
            snapshotQs,
            reviewRow.submission.questionOrder,
            reviewRow.submission.choiceOrders
          );
          const matchingAttempt = remoteAttempts.find(
            (a) => a.id === (reviewRow.submission.attemptId || reviewRow.submission.id)
          );

          const handleSubmitReviewGrievance = async (q: ExamQuestion) => {
            if (!matchingAttempt) return;
            const msg = (grievanceDraftText[q.id] || '').trim();
            if (!msg) return;
            setGrievanceSubmittingId(q.id);
            setGrievanceBanner(null);
            try {
              const rawAns = reviewRow.submission.answers?.[q.id] || '';
              const res = await submitQuestionGrievance({
                attemptId: matchingAttempt.id,
                assessmentId: matchingAttempt.assessmentId,
                formId: matchingAttempt.formId,
                studentId: currentUser.id,
                questionId: q.id,
                questionText: q.question,
                studentAnswer: getStudentAnswerDisplay(q, rawAns) || t.myAccount.notAnsweredLabel,
                correctAnswer: getCorrectAnswerDisplay(q),
                questionPoints: q.points,
                message: msg,
              });
              if (res.success && res.grievance) {
                setReviewGrievances((prev) => [...prev, res.grievance!]);
                setGrievanceDraftOpen((prev) => ({ ...prev, [q.id]: false }));
                setGrievanceDraftText((prev) => ({ ...prev, [q.id]: '' }));
                setGrievanceBanner({ type: 'ok', text: t.myAccount.appealSentOk });
              } else {
                setGrievanceBanner({ type: 'err', text: res.error || t.myAccount.appealSentErr });
              }
            } finally {
              setGrievanceSubmittingId(null);
            }
          };

          return (
            <div className="space-y-4">
              {/* Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 block">{t.common.percentage}</span>
                  <strong className="text-base font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                    {reviewRow.percentage}%
                  </strong>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 block">{t.myAccount.marksLabel}</span>
                  <strong className="text-base font-black text-slate-900 dark:text-white font-mono tabular-nums">
                    {reviewRow.scoreFormatted} / {reviewRow.totalPointsFormatted}
                  </strong>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 block">{t.myAccount.answeredCorrectHeader}</span>
                  <strong className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                    {reviewRow.solvedCount} / {reviewRow.correctCount}
                  </strong>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 block">{t.myAccount.colAttemptNum}</span>
                  <strong className="text-base font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                    #{reviewRow.attemptNumber}
                  </strong>
                </div>
              </div>

              {grievanceBanner && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold text-center border ${
                    grievanceBanner.type === 'ok'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-300'
                  }`}
                >
                  {grievanceBanner.text}
                </div>
              )}

              {orderedReviewQuestions.length > 0 ? (
                <div className="space-y-3">
                  {orderedReviewQuestions.map((q, idx) => {
                    const rawAns = reviewRow.submission.answers?.[q.id] || '';
                    const studentDisplay = getStudentAnswerDisplay(q, rawAns);
                    const correctDisplay = getCorrectAnswerDisplay(q);
                    const selectedIds = q.type === 'mcq' ? resolveSelectedChoiceIds(q, rawAns) : [];
                    const isBlank = q.type === 'mcq' ? selectedIds.length === 0 : String(rawAns).trim() === '';
                    const graded = gradeQuestion(q, rawAns);
                    const explicitPts = reviewRow.submission.questionGrades?.[q.id];
                    const earnedPts = explicitPts !== undefined ? Number(explicitPts) : graded.awardedPoints;
                    const isCorrect = earnedPts >= q.points && q.points > 0;
                    const existingGrievance = reviewGrievances.find((g) => g.questionId === q.id);

                    return (
                      <div
                        key={q.id}
                        className={`p-4 rounded-2xl border space-y-2.5 ${
                          q.type === 'essay' && reviewRow.submission.essayGradingPending && !isBlank
                            ? 'bg-amber-50/70 dark:bg-amber-950/15 border-amber-300 dark:border-amber-500/30'
                            : isCorrect
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/15 border-emerald-300 dark:border-emerald-500/40'
                            : 'bg-red-50/70 dark:bg-red-950/15 border-red-300 dark:border-red-500/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h5 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-relaxed">
                            {formatTemplate(t.myAccount.questionPtsBadge, { num: idx + 1 })} {q.question}
                          </h5>
                          <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono tabular-nums font-bold shrink-0">
                            {formatScoreNumber(earnedPts)} / {q.points} {t.myAccount.ptsShort}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                              {t.myAccount.yourRecordedAnswer}
                            </span>
                            <span
                              className={`font-bold ${
                                isBlank
                                  ? 'text-red-600 dark:text-red-400'
                                  : isCorrect
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : q.type === 'mcq'
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {studentDisplay || t.myAccount.notAnsweredLabel}
                            </span>
                          </div>

                          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-500/30">
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block mb-0.5">
                              {t.myAccount.correctModelAnswer}
                            </span>
                            <span className="font-bold text-emerald-700 dark:text-emerald-300">
                              {correctDisplay}
                            </span>
                          </div>
                        </div>

                        {q.explanation && (
                          <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong className="text-amber-700 dark:text-amber-400">
                              <BookOpen className="w-3.5 h-3.5 inline me-1" />
                              {t.myAccount.qbExplanationPrefix}
                            </strong>{' '}
                            {q.explanation}
                          </div>
                        )}

                        {matchingAttempt && (
                          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800">
                            {existingGrievance ? (
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span
                                  className={`px-2.5 py-1 rounded-xl font-bold border ${
                                    existingGrievance.status === 'approved'
                                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                      : existingGrievance.status === 'rejected'
                                      ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
                                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                  }`}
                                >
                                  {existingGrievance.status === 'approved'
                                    ? t.myAccount.appealApprovedAwarded
                                    : existingGrievance.status === 'rejected'
                                    ? t.myAccount.appealRejectedBadge
                                    : t.myAccount.appealSubmittedPending}
                                </span>
                                {existingGrievance.teacherNote && (
                                  <span className="text-slate-600 dark:text-slate-300">
                                    {formatTemplate(t.myAccount.teacherNotePrefix, { note: existingGrievance.teacherNote })}
                                  </span>
                                )}
                              </div>
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
                                  <span>{t.myAccount.submitAppealBtn}</span>
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
                                      placeholder={t.myAccount.appealInputPlaceholder}
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
                                        {t.common.cancel}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          grievanceSubmittingId === q.id ||
                                          !(grievanceDraftText[q.id] || '').trim()
                                        }
                                        onClick={() => void handleSubmitReviewGrievance(q)}
                                        className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold cursor-pointer"
                                      >
                                        {grievanceSubmittingId === q.id ? t.myAccount.sendingAppealBtn : t.myAccount.sendAppealBtn}
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
              ) : (
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white">
                    {t.myAccount.summarySavedTitle}
                  </p>
                  {Object.entries(reviewRow.submission.answers || {}).length === 0 ? (
                    <p>{t.myAccount.summaryOnlyScore}</p>
                  ) : (
                    <ul className="space-y-1.5 font-mono">
                      {Object.entries(reviewRow.submission.answers || {}).map(([qid, ans], i) => (
                        <li key={qid} className="p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          {formatTemplate(t.myAccount.qbQuestionNum, { num: i + 1 })}: <strong>{ans || t.myAccount.noAnswerDash}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};
