/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Search,
  X,
  Phone,
  MapPin,
  GraduationCap,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageCircle,
  Copy,
  Printer,
  Send,
  BookOpen,
  FileSpreadsheet,
  CheckSquare,
  Calendar,
  ShieldAlert,
  Save,
  Eye,
  Download,
  RefreshCw,
  MessageSquareWarning,
  Check,
  XCircle,
  ArrowRightLeft,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import {
  AssessmentAttempt,
  AssessmentFormAssignment,
  ExamOrAssignment,
  ExamQuestion,
  ExamSubmission,
  PlatformSettings,
  QuestionGrievance,
  UserProfile,
} from '../types';
import { platformDB } from '../lib/storage';
import { Modal } from './Modal';
import {
  applyAttemptOrderToQuestions,
  buildTeacherAuditEntries,
  formatSecondsClock,
} from '../lib/examGrading';
import { normalizeGrade } from '../lib/courseHelpers';
import {
  fetchAllAttemptsForAdmin,
  fetchAllGrievancesForAdmin,
  fetchAssessmentFormAssignments,
  markAllGrievancesSeen,
  reassignStudentForm,
  reviewQuestionGrievance,
} from '../lib/supabaseAssessments';

interface StudentsDataSectionProps {
  students: UserProfile[];
  courses: {
    id: string;
    title: string;
    grade: string;
  }[];
  exams: ExamOrAssignment[];
  submissions: ExamSubmission[];
  settings: PlatformSettings;
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
  onDataChanged: () => void;
  forceAuthorized?: boolean;
  onGrievancesSeen?: () => void;
}

export const StudentsDataSection: React.FC<StudentsDataSectionProps> = ({
  students,
  courses,
  exams,
  submissions,
  settings,
  currentUser,
  onOpenAuth,
  onDataChanged,
  forceAuthorized = false,
  onGrievancesSeen,
}) => {
  const [subView, setSubView] = useState<'records' | 'grievances'>('records');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExamFilter, setSelectedExamFilter] = useState<string>('all');
  const [selectedFormFilter, setSelectedFormFilter] = useState<string>('all');
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [reportStatusMsg, setReportStatusMsg] = useState<string | null>(null);
  const [editableParentPhone, setEditableParentPhone] = useState('');
  const [showParentPhoneEditor, setShowParentPhoneEditor] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [visibleStudentsLimit, setVisibleStudentsLimit] = useState(100);

  // Supabase remote states (100% Supabase-backed, zero localStorage)
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [formAssignments, setFormAssignments] = useState<AssessmentFormAssignment[]>([]);
  const [grievances, setGrievances] = useState<QuestionGrievance[]>([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);

  // Inspection & Form Reassignment modals
  const [inspectAttempt, setInspectAttempt] = useState<AssessmentAttempt | null>(null);
  const [reassignDraftByKey, setReassignDraftByKey] = useState<Record<string, string>>({});
  const [pendingOverrideReassign, setPendingOverrideReassign] = useState<{
    student: UserProfile;
    exam: ExamOrAssignment;
    newFormId: string;
    newFormName: string;
    attemptsCount: number;
  } | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Grievances Sub-view state
  const [grievanceStatusFilter, setGrievanceStatusFilter] = useState<'all' | 'new' | 'approved' | 'rejected'>('all');
  const [grievanceSearch, setGrievanceSearch] = useState('');
  const [teacherNoteById, setTeacherNoteById] = useState<Record<string, string>>({});
  const [reviewingGrievanceId, setReviewingGrievanceId] = useState<string | null>(null);

  const isAuthorized = forceAuthorized || currentUser?.role === 'admin' || currentUser?.role === 'secretary';

  const loadRemoteData = useCallback(async () => {
    if (!isAuthorized) return;
    setIsLoadingRemote(true);
    try {
      const [attList, assignList, grvList] = await Promise.all([
        fetchAllAttemptsForAdmin(),
        fetchAssessmentFormAssignments(),
        fetchAllGrievancesForAdmin(),
      ]);
      setAttempts(attList);
      setFormAssignments(assignList);
      setGrievances(grvList);
    } finally {
      setIsLoadingRemote(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    void loadRemoteData();
  }, [loadRemoteData]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setActionToast({ type, text });
    window.setTimeout(() => setActionToast(null), 4500);
  };

  const handleSwitchSubView = (nextView: 'records' | 'grievances') => {
    setSubView(nextView);
    if (nextView === 'grievances') {
      void markAllGrievancesSeen().then(() => {
        setGrievances((prev) => prev.map((g) => ({ ...g, isSeenByAdmin: true })));
        onGrievancesSeen?.();
      });
    }
  };

  const examById = useMemo(() => {
    const map = new Map<string, ExamOrAssignment>();
    exams.forEach((e) => map.set(e.id, e));
    return map;
  }, [exams]);

  const studentById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  // Distinct available form names across assessments, assignments & attempts for filtering
  const availableFormNames = useMemo(() => {
    const names = new Set<string>();
    exams.forEach((ex) => {
      (ex.forms || []).forEach((f) => {
        if (f.name) names.add(f.name.trim());
      });
    });
    attempts.forEach((a) => {
      if (a.formName) names.add(a.formName.trim());
    });
    formAssignments.forEach((fa) => {
      if (fa.formName) names.add(fa.formName.trim());
    });
    if (names.size === 0) names.add('Form A');
    return Array.from(names);
  }, [exams, attempts, formAssignments]);

  // Map student_id + assessment_id -> AssessmentFormAssignment
  const assignmentByStudentExam = useMemo(() => {
    const map = new Map<string, AssessmentFormAssignment>();
    formAssignments.forEach((a) => {
      map.set(`${a.studentId}::${a.assessmentId}`, a);
    });
    return map;
  }, [formAssignments]);

  // Map student_id -> AssessmentAttempt[]
  const attemptsByStudentId = useMemo(() => {
    const map = new Map<string, AssessmentAttempt[]>();
    attempts.forEach((a) => {
      const list = map.get(a.studentId) || [];
      list.push(a);
      map.set(a.studentId, list);
    });
    return map;
  }, [attempts]);

  // Ordered from FIRST registered student (oldest createdAt) to NEWEST registered student
  const orderedStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...students].sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );
    return sorted.filter((s) => {
      if (q) {
        const matchesText =
          s.fullName.toLowerCase().includes(q) ||
          s.studentCode.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          (s.parentPhone || '').includes(q) ||
          s.governorate.toLowerCase().includes(q) ||
          s.grade.toLowerCase().includes(q);
        if (!matchesText) return false;
      }

      if (selectedExamFilter !== 'all' || selectedFormFilter !== 'all') {
        const stAttempts = attemptsByStudentId.get(s.id) || [];
        const hasMatchingAttempt = stAttempts.some((att) => {
          const examOk = selectedExamFilter === 'all' || att.assessmentId === selectedExamFilter;
          const formOk = selectedFormFilter === 'all' || (att.formName || '').trim() === selectedFormFilter;
          return examOk && formOk;
        });

        const hasMatchingAssign = formAssignments.some((fa) => {
          if (fa.studentId !== s.id) return false;
          const examOk = selectedExamFilter === 'all' || fa.assessmentId === selectedExamFilter;
          const formOk = selectedFormFilter === 'all' || (fa.formName || '').trim() === selectedFormFilter;
          return examOk && formOk;
        });

        if (!hasMatchingAttempt && !hasMatchingAssign) return false;
      }

      return true;
    });
  }, [students, searchQuery, selectedExamFilter, selectedFormFilter, attemptsByStudentId, formAssignments]);

  // Helper: calculate attendance % and assessment breakdown for any student purely from Supabase data
  const getStudentAnalytics = useCallback(
    (student: UserProfile) => {
      const gradeCourses = courses.filter(
        (c) =>
          !student.grade ||
          normalizeGrade(student.grade) === 'All' ||
          normalizeGrade(c.grade) === normalizeGrade(student.grade)
      );
      const completedIds = new Set(student.completedLectures || []);
      const attendedCount = gradeCourses.filter((c) => completedIds.has(c.id)).length;
      const totalLectures = gradeCourses.length;
      const attendancePct = totalLectures > 0 ? Math.round((attendedCount / totalLectures) * 100) : 0;

      const studentAttempts = (attemptsByStudentId.get(student.id) || []).slice().sort((a, b) => {
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
      });

      const studentLegacySubs = submissions.filter(
        (s) => s.studentId === student.id || s.studentCode === student.studentCode
      );

      const gradeExams = exams.filter(
        (ex) =>
          !student.grade ||
          normalizeGrade(student.grade) === 'All' ||
          normalizeGrade(ex.grade) === normalizeGrade(student.grade)
      );

      const assessments = gradeExams.map((ex) => {
        const matchingAttempts = studentAttempts
          .filter((a) => a.assessmentId === ex.id)
          .sort((a, b) => b.attemptNumber - a.attemptNumber);

        const completedAttempts = matchingAttempts.filter(
          (a) => a.status === 'submitted' || a.status === 'auto_submitted'
        );
        const latestCompletedAttempt = completedAttempts[0] || null;
        const activeInProgressAttempt =
          matchingAttempts.find((a) => a.status === 'in_progress') || null;

        const matchingLegacySubs = studentLegacySubs
          .filter((s) => s.examId === ex.id)
          .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        const latestSub = matchingLegacySubs[0] || null;

        const assignedForm = assignmentByStudentExam.get(`${student.id}::${ex.id}`) || null;
        const assignedFormName =
          assignedForm?.formName ||
          latestCompletedAttempt?.formName ||
          activeInProgressAttempt?.formName ||
          (ex.forms && ex.forms[0]?.name) ||
          'Form A';

        // Prefer Supabase AssessmentAttempt for score & status; fallback to mirrored ExamSubmission for legacy rows
        const effectiveScore = latestCompletedAttempt
          ? latestCompletedAttempt.score
          : latestSub
          ? latestSub.score
          : null;
        const effectiveTotal = latestCompletedAttempt
          ? latestCompletedAttempt.totalPoints
          : latestSub
          ? latestSub.totalPoints
          : ex.totalPoints;
        const effectiveSubmittedAt = latestCompletedAttempt?.submittedAt || latestSub?.submittedAt || null;
        const effectivePending = latestCompletedAttempt
          ? latestCompletedAttempt.essayGradingPending
          : Boolean(latestSub?.essayGradingPending);

        return {
          exam: ex,
          attempts: matchingAttempts,
          completedAttemptsCount: completedAttempts.length,
          latestAttempt: latestCompletedAttempt,
          activeAttempt: activeInProgressAttempt,
          submission: latestSub,
          assignedForm,
          assignedFormName,
          effectiveScore,
          effectiveTotal,
          effectiveSubmittedAt,
          effectivePending,
        };
      });

      const examAndSheetAssessments = assessments.filter(
        (a) => a.exam.category === 'exam' || a.exam.category === 'sheet'
      );
      const assignmentAssessments = assessments.filter((a) => a.exam.category === 'assignment');

      const enteredExamsCount = examAndSheetAssessments.filter(
        (a) => a.latestAttempt || a.submission
      ).length;
      const enteredAssignmentsCount = assignmentAssessments.filter(
        (a) => a.latestAttempt || a.submission
      ).length;

      return {
        gradeCourses,
        completedIds,
        attendedCount,
        totalLectures,
        attendancePct,
        assessments,
        studentAttempts,
        examAndSheetAssessments,
        assignmentAssessments,
        enteredExamsCount,
        enteredAssignmentsCount,
      };
    },
    [courses, exams, submissions, attemptsByStudentId, assignmentByStudentExam]
  );

  const buildParentReportText = (student: UserProfile): string => {
    const stats = getStudentAnalytics(student);
    const examLines = stats.examAndSheetAssessments
      .map((item) => {
        const typeLabel = item.exam.category === 'sheet' ? 'Sheet' : 'Exam';
        const formTag = (item.exam.forms?.length || 0) > 1 ? ` [${item.assignedFormName}]` : '';
        if (item.effectiveScore !== null) {
          const pct =
            item.effectiveTotal > 0 ? Math.round((item.effectiveScore / item.effectiveTotal) * 100) : 0;
          const pendingText = item.effectivePending ? ' (Essay review pending)' : '';
          return `• [${typeLabel}] ${item.exam.title}${formTag}: ${item.effectiveScore} / ${item.effectiveTotal} (${pct}%)${pendingText}`;
        }
        if (item.activeAttempt) {
          return `• [${typeLabel}] ${item.exam.title}${formTag}: Currently in progress`;
        }
        return `• [${typeLabel}] ${item.exam.title}${formTag}: Not attempted yet`;
      })
      .join('\n');

    const assignLines = stats.assignmentAssessments
      .map((item) => {
        const formTag = (item.exam.forms?.length || 0) > 1 ? ` [${item.assignedFormName}]` : '';
        if (item.effectiveScore !== null) {
          return `• ${item.exam.title}${formTag}: Submitted (${item.effectiveScore} / ${item.effectiveTotal})`;
        }
        if (item.activeAttempt) {
          return `• ${item.exam.title}${formTag}: In progress`;
        }
        return `• ${item.exam.title}${formTag}: Not solved yet`;
      })
      .join('\n');

    return [
      `Comprehensive Parent Progress Report - ${settings.platformName}`,
      `─────────────────────────────`,
      `Student Name: ${student.fullName}`,
      `Student Code: ${student.studentCode}`,
      `Grade Level: ${normalizeGrade(student.grade)}`,
      `Governorate: ${student.governorate}`,
      `Registered Parent Phone: ${student.parentPhone || 'Not registered'}`,
      `─────────────────────────────`,
      `1) Lecture Attendance Rate: ${stats.attendancePct}% (${stats.attendedCount} of ${stats.totalLectures} lectures)`,
      `2) Exam & Sheet Scores (${stats.enteredExamsCount} of ${stats.examAndSheetAssessments.length}):`,
      examLines || '• No exams or sheets recorded for this grade yet',
      `3) Assignment Status (${stats.enteredAssignmentsCount} of ${stats.assignmentAssessments.length}):`,
      assignLines || '• No assignments recorded for this grade yet',
      `─────────────────────────────`,
      `Best regards, ${settings.teacherName} Platform — Support: ${settings.supportPhone}`,
    ].join('\n');
  };

  const formatEgyptWhatsAppNumber = (phone?: string): string => {
    const digits = (phone || '').replace(/[^\d]/g, '');
    if (!digits) return '';
    if (digits.startsWith('20')) return digits;
    if (digits.startsWith('0')) return `2${digits}`;
    return digits;
  };

  const handleOpenStudentModal = (student: UserProfile) => {
    setSelectedStudent(student);
    setEditableParentPhone(student.parentPhone || '');
    setShowParentPhoneEditor(false);
    setShowReportPreview(false);
    setReportStatusMsg(null);
  };

  const handleSaveMissingParentPhone = () => {
    if (!selectedStudent || !editableParentPhone.trim()) return;
    const updated: UserProfile = {
      ...selectedStudent,
      parentPhone: editableParentPhone.trim(),
    };
    platformDB.saveStudent(updated);
    setSelectedStudent(updated);
    setShowParentPhoneEditor(false);
    setReportStatusMsg('Parent phone number saved and student profile updated on the platform & Supabase.');
    onDataChanged();
  };

  const handleCopyParentReport = () => {
    if (!selectedStudent) return;
    const report = buildParentReportText(selectedStudent);
    navigator.clipboard.writeText(report);
    setReportStatusMsg(
      `Comprehensive report for (${selectedStudent.fullName}) copied for parent phone (${selectedStudent.parentPhone || 'Not registered'}) successfully.`
    );
  };

  // CSV Export with Form column + UTF-8 BOM for Excel support
  const handleExportCsv = () => {
    const escapeCsv = (val: unknown): string => {
      const str = String(val ?? '').replace(/\r?\n/g, ' ');
      if (str.includes(',') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Student Name',
      'Student Code',
      'Grade Level',
      'Assessment',
      'Form',
      'Attempt Number',
      'Submission Status',
      'Score',
      'Total Points',
      'Percentage',
      'Started At',
      'Submitted At',
    ];

    const rows: string[][] = [];
    orderedStudents.forEach((st) => {
      const stAttempts = (attemptsByStudentId.get(st.id) || []).filter((att) => {
        const examOk = selectedExamFilter === 'all' || att.assessmentId === selectedExamFilter;
        const formOk = selectedFormFilter === 'all' || (att.formName || '').trim() === selectedFormFilter;
        return examOk && formOk;
      });

      if (stAttempts.length === 0) {
        rows.push([
          st.fullName,
          st.studentCode,
          normalizeGrade(st.grade),
          selectedExamFilter !== 'all' ? examById.get(selectedExamFilter)?.title || '—' : 'No attempts recorded',
          '—',
          '0',
          'Not started yet',
          '0',
          '0',
          '0%',
          '—',
          '—',
        ]);
        return;
      }

      stAttempts.forEach((att) => {
        const exam = examById.get(att.assessmentId);
        const statusEn =
          att.status === 'auto_submitted'
            ? 'Auto Submitted'
            : att.status === 'submitted'
            ? 'Manual Submit'
            : 'In Progress';
        rows.push([
          st.fullName,
          st.studentCode,
          normalizeGrade(st.grade),
          exam?.title || att.assessmentId,
          att.formName || 'Form A',
          String(att.attemptNumber),
          statusEn,
          String(att.score),
          String(att.totalPoints),
          `${att.percentage}%`,
          att.startedAt ? new Date(att.startedAt).toLocaleString('en-US') : '—',
          att.submittedAt ? new Date(att.submittedAt).toLocaleString('en-US') : '—',
        ]);
      });
    });

    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.download = `student-assessments-report-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', 'CSV file exported with scores and forms successfully ✓');
  };

  // Manual Form Reassignment Handler
  const handleTriggerReassignForm = async (
    student: UserProfile,
    exam: ExamOrAssignment,
    newFormId: string
  ) => {
    const forms = exam.forms || [];
    const targetForm = forms.find((f) => f.id === newFormId);
    if (!targetForm) return;

    setIsReassigning(true);
    try {
      const res = await reassignStudentForm(
        exam.id,
        student.id,
        newFormId,
        currentUser?.fullName || 'Administration',
        false
      );

      if (res.blocked) {
        setPendingOverrideReassign({
          student,
          exam,
          newFormId,
          newFormName: targetForm.name,
          attemptsCount: res.attemptsCount || 1,
        });
        return;
      }

      if (!res.success) {
        showToast('error', res.error || 'Could not reassign form for student');
        return;
      }

      showToast('success', `Assigned (${targetForm.name}) to ${student.fullName} successfully ✓`);
      await loadRemoteData();
      onDataChanged();
    } finally {
      setIsReassigning(false);
    }
  };

  const handleConfirmOverrideReassign = async () => {
    if (!pendingOverrideReassign) return;
    setIsReassigning(true);
    try {
      const res = await reassignStudentForm(
        pendingOverrideReassign.exam.id,
        pendingOverrideReassign.student.id,
        pendingOverrideReassign.newFormId,
        currentUser?.fullName || 'Administration',
        true
      );
      if (!res.success) {
        showToast('error', res.error || 'Could not confirm form reassignment');
        return;
      }
      showToast(
        'success',
        `Assigned (${pendingOverrideReassign.newFormName}) for upcoming attempts while preserving prior attempts in archive ✓`
      );
      setPendingOverrideReassign(null);
      await loadRemoteData();
      onDataChanged();
    } finally {
      setIsReassigning(false);
    }
  };

  // Review Grievance Handler
  const handleReviewGrievance = async (
    grievance: QuestionGrievance,
    action: 'approved' | 'rejected'
  ) => {
    setReviewingGrievanceId(grievance.id);
    try {
      const res = await reviewQuestionGrievance({
        grievanceId: grievance.id,
        action,
        teacherNote: teacherNoteById[grievance.id] || '',
        reviewedBy: currentUser?.fullName || 'Miss Asmaa',
      });
      if (!res.success) {
        showToast('error', res.error || 'Error while processing grievance');
        return;
      }
      showToast(
        'success',
        action === 'approved'
          ? 'Grievance approved and full points awarded for this question on this attempt only ✓'
          : 'Grievance rejection recorded with note ✓'
      );
      await loadRemoteData();
      onDataChanged();
    } finally {
      setReviewingGrievanceId(null);
    }
  };

  const newGrievancesCount = useMemo(
    () => grievances.filter((g) => g.status === 'new').length,
    [grievances]
  );

  const filteredGrievances = useMemo(() => {
    const q = grievanceSearch.trim().toLowerCase();
    return grievances.filter((g) => {
      if (grievanceStatusFilter !== 'all' && g.status !== grievanceStatusFilter) return false;
      if (!q) return true;
      const st = studentById.get(g.studentId);
      const ex = examById.get(g.assessmentId);
      return (
        (g.studentName || st?.fullName || '').toLowerCase().includes(q) ||
        (g.studentCode || st?.studentCode || '').toLowerCase().includes(q) ||
        (ex?.title || '').toLowerCase().includes(q) ||
        (g.questionText || '').toLowerCase().includes(q) ||
        (g.message || '').toLowerCase().includes(q)
      );
    });
  }, [grievances, grievanceStatusFilter, grievanceSearch, studentById, examById]);

  if (!isAuthorized) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">
          Student Records & Comprehensive Reports
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          This section is restricted to the platform supervisor (Miss Asmaa) and secretaries to view all student records, attendance rates, detailed scores, grievances, and send parent reports.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer"
        >
          Sign in with Admin or Secretary Account
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {actionToast && (
        <div
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[85] px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold shadow-2xl border flex items-center gap-2 ${
            actionToast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-400/50'
              : 'bg-rose-600 text-white border-rose-400/50'
          }`}
        >
          {actionToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{actionToast.text}</span>
        </div>
      )}

      {/* Header & Two Sub-View Toggle */}
      <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-5 sm:p-7 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Users className="w-5 h-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Student Data, Scores & Grievances
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Track all students, their attempts and assigned forms in every assessment, grading audit logs, and review question grievances directly from Supabase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadRemoteData()}
              disabled={isLoadingRemote}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRemote ? 'animate-spin' : ''}`} />
              <span>Refresh Data</span>
            </button>

            <div className="text-xs font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800">
              Students: {students.length.toLocaleString('en-US')} · Attempts: {attempts.length.toLocaleString('en-US')}
            </div>
          </div>
        </div>

        {/* Sub-view Switcher inside Student Data */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => handleSwitchSubView('records')}
            className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subView === 'records'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span>Student Records & Scores</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchSubView('grievances')}
            className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer relative ${
              subView === 'grievances'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquareWarning className="w-4 h-4 shrink-0" />
            <span>Grievances Inbox</span>
            {newGrievancesCount > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                  subView === 'grievances'
                    ? 'bg-white text-rose-600'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {newGrievancesCount}
              </span>
            )}
          </button>
        </div>

        {subView === 'records' && (
          <div className="space-y-3">
            {/* Fast Search Bar */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Quick search: enter student name, code (AMR-101), student phone, parent phone, governorate or grade..."
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl px-4 py-3 pl-11 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Assessment Filter + Form Filter + CSV Export */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Filter by Assessment
                </label>
                <select
                  value={selectedExamFilter}
                  onChange={(e) => setSelectedExamFilter(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="all">All Exams, Assignments & Sheets</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.category === 'assignment' ? 'Assignment' : ex.category === 'sheet' ? 'Sheet' : 'Exam'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Filter by Form
                </label>
                <select
                  value={selectedFormFilter}
                  onChange={(e) => setSelectedFormFilter(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="all">All Forms</option>
                  {availableFormNames.map((fn) => (
                    <option key={fn} value={fn}>
                      {fn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="w-full min-h-[38px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Export CSV (Includes Form Column)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SUB-VIEW 1: STUDENT RECORDS */}
      {subView === 'records' && (
        <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Complete Student Directory (sorted ascending from oldest to newest registration)
            </span>
            <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Showing: {orderedStudents.length.toLocaleString('en-US')}
            </span>
          </div>

          {orderedStudents.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">
              No students match your current search or filter criteria.
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {orderedStudents.slice(0, visibleStudentsLimit).map((st, idx) => {
                  const stats = getStudentAnalytics(st);
                  const activeAttCount = stats.studentAttempts.filter((a) => a.status === 'in_progress').length;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleOpenStudentModal(st)}
                      className="w-full px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-mono tabular-nums font-black text-xs text-slate-700 dark:text-slate-300 shrink-0">
                          #{idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {st.fullName}
                            </span>
                            <span className="text-xs font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                              {st.studentCode}
                            </span>
                            {activeAttCount > 0 && (
                              <span className="px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                                In Progress ({activeAttCount})
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            <span>{normalizeGrade(st.grade)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{st.governorate}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums" dir="ltr">
                              {st.phone}
                            </span>
                            {st.parentPhone && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  Parent: <span dir="ltr">{st.parentPhone}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs shrink-0 self-end sm:self-center">
                        <div className="text-right sm:text-center">
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">Attendance</span>
                          <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                            {stats.attendancePct}%
                          </span>
                        </div>

                        <div className="text-right sm:text-center">
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">Assessments</span>
                          <span className="font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
                            {stats.enteredExamsCount}/{stats.examAndSheetAssessments.length}
                          </span>
                        </div>

                        <span className="px-3 py-1.5 rounded-xl bg-blue-600/10 group-hover:bg-blue-600 text-blue-700 dark:text-blue-300 group-hover:text-white border border-blue-500/25 font-bold text-xs transition-colors">
                          View Profile & Report
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {orderedStudents.length > visibleStudentsLimit && (
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Showing {Math.min(visibleStudentsLimit, orderedStudents.length).toLocaleString('en-US')} of{' '}
                    {orderedStudents.length.toLocaleString('en-US')} students
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleStudentsLimit((prev) => prev + 200)}
                      className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold"
                    >
                      Show 200 More Students
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleStudentsLimit(orderedStudents.length)}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold"
                    >
                      Show All Students ({orderedStudents.length.toLocaleString('en-US')})
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* SUB-VIEW 2: GRIEVANCES INBOX */}
      {subView === 'grievances' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'new', 'approved', 'rejected'] as const).map((statusKey) => {
                  const label =
                    statusKey === 'all'
                      ? `All (${grievances.length})`
                      : statusKey === 'new'
                      ? `New (${grievances.filter((g) => g.status === 'new').length})`
                      : statusKey === 'approved'
                      ? `Approved (${grievances.filter((g) => g.status === 'approved').length})`
                      : `Rejected (${grievances.filter((g) => g.status === 'rejected').length})`;
                  return (
                    <button
                      key={statusKey}
                      type="button"
                      onClick={() => setGrievanceStatusFilter(statusKey)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        grievanceStatusFilter === statusKey
                          ? 'bg-rose-600 text-white border-rose-500 shadow'
                          : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  value={grievanceSearch}
                  onChange={(e) => setGrievanceSearch(e.target.value)}
                  placeholder="Search grievances by student or question..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 pl-9 text-xs text-slate-900 dark:text-white"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          {filteredGrievances.length === 0 ? (
            <div className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-12 text-center space-y-2 shadow-xl">
              <MessageSquareWarning className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                No matching grievances right now
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                When a student submits an appeal on a question after viewing their score, it will appear here with full details.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGrievances.map((g) => {
                const st = studentById.get(g.studentId);
                const ex = examById.get(g.assessmentId);
                const statusBadge =
                  g.status === 'approved'
                    ? { text: 'Approved (Points Awarded)', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' }
                    : g.status === 'rejected'
                    ? { text: 'Rejected', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30' }
                    : { text: 'New — Pending Review', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' };

                return (
                  <div
                    key={g.id}
                    className="rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                            {g.studentName || st?.fullName || 'Student'}
                          </span>
                          {(g.studentCode || st?.studentCode) && (
                            <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                              ({g.studentCode || st?.studentCode})
                            </span>
                          )}
                          <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${statusBadge.cls}`}>
                            {statusBadge.text}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {ex?.title || 'Assessment'}
                          </span>
                          {g.formName && (
                            <>
                              <span>·</span>
                              <span className="font-bold text-blue-600 dark:text-blue-400">{g.formName}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="font-mono">Attempt #{g.attemptNumber || 1}</span>
                          <span>·</span>
                          <span className="font-mono">
                            {new Date(g.createdAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                        Question Points: {g.questionPoints}
                      </div>
                    </div>

                    {/* Question & Stored Answers Audit */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                      <p className="font-bold text-slate-900 dark:text-white leading-relaxed">
                        Question: {g.questionText}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                            Recorded Student Answer:
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {g.studentAnswer || '— No answer —'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50">
                          <span className="block text-[11px] text-emerald-700 dark:text-emerald-400 mb-0.5">
                            Stored Correct Answer:
                          </span>
                          <span className="font-bold text-emerald-800 dark:text-emerald-300">
                            {g.correctAnswer || '— Not specified —'}
                          </span>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 text-slate-800 dark:text-slate-200">
                        <span className="block text-[11px] font-bold text-rose-600 dark:text-rose-400 mb-1">
                          Student Appeal Message:
                        </span>
                        <p className="leading-relaxed">{g.message}</p>
                      </div>
                    </div>

                    {/* Teacher Review Controls */}
                    {g.status === 'new' ? (
                      <div className="space-y-3 pt-1">
                        <textarea
                          rows={2}
                          value={teacherNoteById[g.id] ?? g.teacherNote ?? ''}
                          onChange={(e) =>
                            setTeacherNoteById((prev) => ({ ...prev, [g.id]: e.target.value }))
                          }
                          placeholder="Optional note for the student when approving or rejecting..."
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                        />
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            disabled={reviewingGrievanceId === g.id}
                            onClick={() => void handleReviewGrievance(g, 'approved')}
                            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-lg flex items-center gap-1.5 cursor-pointer"
                          >
                            {reviewingGrievanceId === g.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                            <span>Approve Appeal (Award {g.questionPoints} pts for this attempt only)</span>
                          </button>

                          <button
                            type="button"
                            disabled={reviewingGrievanceId === g.id}
                            onClick={() => void handleReviewGrievance(g, 'rejected')}
                            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-lg flex items-center gap-1.5 cursor-pointer"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Reject Appeal</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                        <div>
                          <span className="font-bold">Reviewed by: {g.reviewedBy || 'Administration'}</span>
                          {g.teacherNote && <span className="block mt-0.5">Note: {g.teacherNote}</span>}
                        </div>
                        {g.reviewedAt && (
                          <span className="font-mono text-[11px] text-slate-500">
                            {new Date(g.reviewedAt).toLocaleString('en-US')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Detailed Student Profile, Attempts, Form Assignment & Parent Report Modal */}
      {selectedStudent &&
        (() => {
          const stats = getStudentAnalytics(selectedStudent);
          const parentWaPhone = formatEgyptWhatsAppNumber(selectedStudent.parentPhone);
          const reportText = buildParentReportText(selectedStudent);
          const waHref = parentWaPhone
            ? `https://wa.me/${parentWaPhone}?text=${encodeURIComponent(reportText)}`
            : '#';

          return (
            <Modal
              isOpen={Boolean(selectedStudent)}
              onClose={() => setSelectedStudent(null)}
              maxWidthClass="max-w-5xl"
              overlayClassName="z-[70] bg-slate-950/75 dark:bg-black/85 backdrop-blur-md"
              panelClassName="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800"
              headerClassName="px-4 sm:px-6 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
              bodyClassName="p-5 sm:p-6 space-y-6"
              headerContent={
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                      {selectedStudent.fullName}
                    </h3>
                    <span className="text-xs font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                      ({selectedStudent.studentCode})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
                      <span>{normalizeGrade(selectedStudent.grade)}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-500" />
                      <span>{selectedStudent.governorate}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        Joined:{' '}
                        {new Date(selectedStudent.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </span>
                  </div>
                </div>
              }
            >
              {/* Contact & Registration Info + Direct Parent Report Action Bar */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Student Phone</span>
                    <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white text-sm" dir="ltr">
                      {selectedStudent.phone}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block mb-0.5">
                      Parent Phone (Registered at Sign-Up)
                    </span>
                    {selectedStudent.parentPhone ? (
                      <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 text-sm" dir="ltr">
                        {selectedStudent.parentPhone}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowParentPhoneEditor(true)}
                        className="text-xs font-bold text-rose-600 dark:text-rose-400 underline"
                      >
                        Not registered — click to add parent phone
                      </button>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Wallet Balance</span>
                    <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400 text-sm">
                      {selectedStudent.balance} EGP
                    </span>
                  </div>
                </div>

                {showParentPhoneEditor && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <input
                      type="tel"
                      value={editableParentPhone}
                      onChange={(e) => setEditableParentPhone(e.target.value)}
                      placeholder="Enter parent phone number (01XXXXXXXXX)"
                      className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSaveMissingParentPhone}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Number</span>
                    </button>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Parent report automatically pulls the registered parent phone ({selectedStudent.parentPhone || 'Not registered'}) and all scores and attendance.
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {parentWaPhone ? (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          setShowReportPreview(true);
                          setReportStatusMsg(
                            `Comprehensive report prepared for parent phone (${selectedStudent.parentPhone}) — opening WhatsApp.`
                          );
                        }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all"
                      >
                        <Send className="w-4 h-4" />
                        <span>Send Report to Parent</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowParentPhoneEditor(true);
                          setShowReportPreview(true);
                          setReportStatusMsg('No parent phone is registered for this student — add the number above then send the report.');
                        }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all"
                      >
                        <Send className="w-4 h-4" />
                        <span>Send Report to Parent</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowReportPreview((prev) => !prev)}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{showReportPreview ? 'Hide Report Preview' : 'Preview Report'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyParentReport}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Report</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                  </div>
                </div>

                {showReportPreview && (
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <span>Preview of Comprehensive Parent Report ({selectedStudent.parentPhone || 'Not registered'})</span>
                      {selectedStudent.parentPhone && (
                        <span className="inline-flex items-center gap-1 font-mono" dir="ltr">
                          <Phone className="w-3 h-3" />
                          {selectedStudent.parentPhone}
                        </span>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      {reportText}
                    </pre>
                  </div>
                )}

                {reportStatusMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                    {reportStatusMsg}
                  </div>
                )}
              </div>

              {/* KPI Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Lecture Attendance Rate</span>
                    <BookOpen className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                    {stats.attendancePct}%
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${stats.attendancePct}%` }} />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Attended {stats.attendedCount} of {stats.totalLectures} lectures
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Exams & Sheets</span>
                    <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                    {stats.enteredExamsCount}{' '}
                    <span className="text-sm font-normal text-slate-500">/ {stats.examAndSheetAssessments.length}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Total exams and sheets entered and solved
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Homework Assignments</span>
                    <CheckSquare className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                    {stats.enteredAssignmentsCount}{' '}
                    <span className="text-sm font-normal text-slate-500">/ {stats.assignmentAssessments.length}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Total assignments submitted on the platform</p>
                </div>
              </div>

              {/* Assessments & Manual Form Reassignment Table */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Assessments, Assigned Forms & Attempt Counts
                </h4>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Assessment Name</th>
                        <th className="py-3 px-4">Assigned Form & Switch</th>
                        <th className="py-3 px-4">Attempts</th>
                        <th className="py-3 px-4">Latest Score</th>
                        <th className="py-3 px-4">Submitted At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#0F172A]">
                      {stats.assessments.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No exams or assignments are recorded for this grade yet.
                          </td>
                        </tr>
                      ) : (
                        stats.assessments.map((row) => {
                          const { exam, assignedFormName, completedAttemptsCount, activeAttempt } = row;
                          const typeLabel =
                            exam.category === 'exam' ? 'Exam' : exam.category === 'sheet' ? 'Sheet' : 'Assignment';
                          const pct =
                            row.effectiveScore !== null && row.effectiveTotal > 0
                              ? Math.round((row.effectiveScore / row.effectiveTotal) * 100)
                              : null;
                          const formsList = exam.forms || [];
                          const draftKey = `${selectedStudent.id}::${exam.id}`;
                          const currentFormId =
                            row.assignedForm?.formId || formsList.find((f) => f.name === assignedFormName)?.id || formsList[0]?.id || '';
                          const selectedReassignId = reassignDraftByKey[draftKey] ?? currentFormId;

                          return (
                            <tr key={exam.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                              <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300">{typeLabel}</td>
                              <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{exam.title}</td>
                              <td className="py-3 px-4">
                                {formsList.length > 1 ? (
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={selectedReassignId}
                                      onChange={(e) =>
                                        setReassignDraftByKey((prev) => ({
                                          ...prev,
                                          [draftKey]: e.target.value,
                                        }))
                                      }
                                      className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-900 dark:text-white"
                                    >
                                      {formsList.map((f) => (
                                        <option key={f.id} value={f.id}>
                                          {f.name}
                                        </option>
                                      ))}
                                    </select>
                                    {selectedReassignId && selectedReassignId !== currentFormId && (
                                      <button
                                        type="button"
                                        disabled={isReassigning}
                                        onClick={() => void handleTriggerReassignForm(selectedStudent, exam, selectedReassignId)}
                                        className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                      >
                                        <ArrowRightLeft className="w-3 h-3" />
                                        <span>Switch</span>
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="font-bold text-slate-600 dark:text-slate-300">{assignedFormName}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums font-bold">
                                <span className="text-slate-900 dark:text-white">
                                  {completedAttemptsCount} / {exam.maxAttempts && exam.maxAttempts > 0 ? exam.maxAttempts : 'Unlimited'}
                                </span>
                                {activeAttempt && (
                                  <span className="block text-[10px] font-sans text-blue-600 dark:text-blue-400">
                                    Attempt #{activeAttempt.attemptNumber} in progress
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums font-bold">
                                {row.effectiveScore !== null ? (
                                  <div>
                                    <span className="text-slate-900 dark:text-white">
                                      {row.effectiveScore} / {row.effectiveTotal}
                                    </span>
                                    {pct !== null && (
                                      <span
                                        className={`ml-1.5 ${
                                          pct >= 85
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : pct >= 60
                                            ? 'text-amber-600 dark:text-amber-400'
                                            : 'text-rose-600 dark:text-rose-400'
                                        }`}
                                      >
                                        ({pct}%)
                                      </span>
                                    )}
                                    {row.effectivePending && (
                                      <span className="block text-[10px] font-sans text-amber-600 dark:text-amber-400">
                                        Essay grading pending
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">— / {exam.totalPoints}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                                {row.effectiveSubmittedAt
                                  ? new Date(row.effectiveSubmittedAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* All Attempts Log for Selected Student (with "View Answers" per attempt) */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Detailed Student Attempts Log ({stats.studentAttempts.length})
                </h4>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                        <th className="py-3 px-4">Assessment</th>
                        <th className="py-3 px-4">Form</th>
                        <th className="py-3 px-4">Attempt</th>
                        <th className="py-3 px-4">Started At</th>
                        <th className="py-3 px-4">Submitted At</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Score</th>
                        <th className="py-3 px-4">Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#0F172A]">
                      {stats.studentAttempts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-slate-500">
                            This student has not started any attempts on the system yet.
                          </td>
                        </tr>
                      ) : (
                        stats.studentAttempts.map((att) => {
                          const ex = examById.get(att.assessmentId);
                          const statusLabel =
                            att.status === 'auto_submitted'
                              ? 'Auto Submitted'
                              : att.status === 'submitted'
                              ? 'Manual Submit'
                              : 'In Progress';
                          return (
                            <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                              <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                                {ex?.title || att.assessmentId}
                              </td>
                              <td className="py-3 px-4 font-bold text-blue-600 dark:text-blue-400">
                                {att.formName || 'Form A'}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold">#{att.attemptNumber}</td>
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                                {new Date(att.startedAt).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                                {att.submittedAt
                                  ? new Date(att.submittedAt).toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                    att.status === 'in_progress'
                                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                      : att.status === 'auto_submitted'
                                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  }`}
                                >
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                {att.status === 'in_progress'
                                  ? '—'
                                  : `${att.score} / ${att.totalPoints} (${att.percentage}%)`}
                              </td>
                              <td className="py-3 px-4">
                                <button
                                  type="button"
                                  onClick={() => setInspectAttempt(att)}
                                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-800 dark:text-slate-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Answers</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Lecture Attendance Detail */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Lecture Attendance Log ({stats.attendedCount} of {stats.totalLectures})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {stats.gradeCourses.map((lec) => {
                    const attended = stats.completedIds.has(lec.id);
                    return (
                      <div
                        key={lec.id}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                          attended
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50 text-slate-900 dark:text-white'
                            : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <span className="line-clamp-1 font-semibold">{lec.title}</span>
                        {attended ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">Attended ✓</span>
                        ) : (
                          <span className="text-slate-400 shrink-0">Not Attended</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Modal>
          );
        })()}

      {/* Attempt Answers & Teacher-Only Grading Audit Log Modal (NO regrade button) */}
      {inspectAttempt &&
        (() => {
          const exam = examById.get(inspectAttempt.assessmentId);
          const sourceQuestions: ExamQuestion[] =
            inspectAttempt.questionsSnapshot && inspectAttempt.questionsSnapshot.length > 0
              ? inspectAttempt.questionsSnapshot
              : exam?.forms?.find((f) => f.id === inspectAttempt.formId)?.questions || exam?.questions || [];
          const orderedQuestions = applyAttemptOrderToQuestions(
            sourceQuestions,
            inspectAttempt.questionOrder,
            inspectAttempt.choiceOrders
          );
          const auditRows = buildTeacherAuditEntries(
            orderedQuestions,
            inspectAttempt.answers || {},
            inspectAttempt.questionGrades,
            inspectAttempt.autoZeroedQuestions
          );

          const remainingSec = inspectAttempt.totalDeadlineAt
            ? Math.max(0, Math.floor((new Date(inspectAttempt.totalDeadlineAt).getTime() - Date.now()) / 1000))
            : null;

          return (
            <Modal
              isOpen={Boolean(inspectAttempt)}
              onClose={() => setInspectAttempt(null)}
              maxWidthClass="max-w-4xl"
              overlayClassName="z-[80] bg-slate-950/80 backdrop-blur-md"
              panelClassName="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800"
              headerClassName="px-5 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
              bodyClassName="p-5 space-y-5"
              headerContent={
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    Answer Review & Grading Audit Log (Teacher Only)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {exam?.title || 'Assessment'} · {inspectAttempt.formName || 'Form A'} · Attempt #{inspectAttempt.attemptNumber} ·
                    Score: {inspectAttempt.score} / {inspectAttempt.totalPoints} ({inspectAttempt.percentage}%)
                    {inspectAttempt.status === 'in_progress' && remainingSec !== null
                      ? ` · Remaining: ${formatSecondsClock(remainingSec)}`
                      : ''}
                  </p>
                </div>
              }
            >
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Question</th>
                      <th className="py-3 px-4">Student Answer</th>
                      <th className="py-3 px-4">Stored Correct Answer</th>
                      <th className="py-3 px-4">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#0F172A]">
                    {auditRows.map((entry, idx) => (
                      <tr key={entry.questionId} className="align-top hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <td className="py-3 px-4 font-mono font-bold text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white min-w-[200px]">
                          {entry.questionText}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                          {entry.studentAnswerDisplay}
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-700 dark:text-emerald-400">
                          {entry.storedCorrectDisplay}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {entry.isPendingEssay ? (
                            <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-[11px]">
                              Essay Pending Review ({entry.awardedPoints}/{entry.maxPoints})
                            </span>
                          ) : entry.isCorrect ? (
                            <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                              Correct ({entry.awardedPoints}/{entry.maxPoints})
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold text-[11px]">
                              Incorrect ({entry.awardedPoints}/{entry.maxPoints})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Modal>
          );
        })()}

      {/* Confirmation Modal for Reassigning Form When Attempts Already Exist */}
      <Modal
        isOpen={Boolean(pendingOverrideReassign)}
        onClose={() => !isReassigning && setPendingOverrideReassign(null)}
        closeDisabled={isReassigning}
        maxWidthClass="max-w-md"
        overlayClassName="z-[85] bg-slate-950/80 backdrop-blur-md"
        headerContent={
          <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-5 h-5" />
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              Confirm Student Form Reassignment
            </h3>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isReassigning}
              onClick={() => setPendingOverrideReassign(null)}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isReassigning}
              onClick={() => void handleConfirmOverrideReassign()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              {isReassigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm Form Switch</span>
            </button>
          </div>
        }
      >
        {pendingOverrideReassign && (
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            Student <strong>{pendingOverrideReassign.student.fullName}</strong> already has{' '}
            <strong>{pendingOverrideReassign.attemptsCount}</strong> recorded attempt(s) in{' '}
            <strong>{pendingOverrideReassign.exam.title}</strong>.
            <br />
            <br />
            <strong>{pendingOverrideReassign.newFormName}</strong> will be assigned for upcoming attempts only while preserving all prior attempts unchanged in the archive. Do you want to continue?
          </p>
        )}
      </Modal>
    </div>
  );
};
