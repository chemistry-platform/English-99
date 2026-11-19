/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AssessmentAttempt,
  AssessmentForm,
  AssessmentFormAssignment,
  ExamOrAssignment,
  ExamQuestion,
  GrievanceStatus,
  QuestionGrievance,
} from '../types';
import {
  buildAttemptShuffleOrders,
  normalizeQuestion,
  normalizeQuestionsList,
} from './examGrading';
import {
  getSupabaseClient,
  getSupabaseCredentials,
  toValidUuid,
  syncSubmissionToSupabase,
} from './supabase';
import {
  compressImageFile,
  copyFilesBucketObject,
  deleteFilesBucketPaths,
  extractFilesBucketPath,
  uploadFileWithRealProgress,
} from './uploadManager';
import { getTranslations } from './translations';

function isMissingRelationOrRpcError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the function') ||
    msg.includes('schema cache')
  );
}

function mapFormRow(row: any): AssessmentForm {
  const questions = normalizeQuestionsList(Array.isArray(row?.questions) ? row.questions : []);
  const computedPts = questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0);
  return {
    id: String(row.id),
    assessmentId: String(row.assessment_id),
    name: String(row.name || 'Form A'),
    sortOrder: Number(row.sort_order) || 1,
    questions,
    totalPoints: Number(row.total_points) > 0 ? Number(row.total_points) : computedPts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttemptRow(row: any, formName?: string, studentName?: string, studentCode?: string): AssessmentAttempt {
  return {
    id: String(row.id),
    assessmentId: String(row.assessment_id),
    formId: String(row.form_id),
    formName: formName || row.form_name || undefined,
    studentId: String(row.student_id),
    studentName: studentName || row.student_name || undefined,
    studentCode: studentCode || row.student_code || undefined,
    attemptNumber: Number(row.attempt_number) || 1,
    status: (row.status || 'in_progress') as AssessmentAttempt['status'],
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at || row.started_at,
    firstExitedAt: row.first_exited_at || null,
    totalDeadlineAt: row.total_deadline_at || null,
    resumeDeadlineAt: row.resume_deadline_at || null,
    submittedAt: row.submitted_at || null,
    questionOrder: Array.isArray(row.question_order) ? row.question_order : [],
    choiceOrders: row.choice_orders && typeof row.choice_orders === 'object' ? row.choice_orders : {},
    answers: row.answers && typeof row.answers === 'object' ? row.answers : {},
    visitedQuestionIndices: Array.isArray(row.visited_question_indices) ? row.visited_question_indices : [0],
    questionsSnapshot: normalizeQuestionsList(
      Array.isArray(row.questions_snapshot) ? row.questions_snapshot : []
    ),
    questionGrades: row.question_grades && typeof row.question_grades === 'object' ? row.question_grades : {},
    autoZeroedQuestions: Array.isArray(row.auto_zeroed_questions) ? row.auto_zeroed_questions : [],
    score: Number(row.score) || 0,
    mcqScore: row.mcq_score !== undefined && row.mcq_score !== null ? Number(row.mcq_score) : undefined,
    mcqTotal: row.mcq_total !== undefined && row.mcq_total !== null ? Number(row.mcq_total) : undefined,
    totalPoints: Number(row.total_points) || 0,
    percentage: Number(row.percentage) || 0,
    hasEssayQuestions: Boolean(row.has_essay_questions),
    essayGradingPending: Boolean(row.essay_grading_pending),
    teacherFeedback: row.teacher_feedback || undefined,
    gradedAt: row.graded_at || undefined,
    gradedBy: row.graded_by || undefined,
  };
}

function mapGrievanceRow(row: any): QuestionGrievance {
  return {
    id: String(row.id),
    attemptId: String(row.attempt_id),
    assessmentId: String(row.assessment_id),
    formId: row.form_id ? String(row.form_id) : undefined,
    studentId: String(row.student_id),
    questionId: String(row.question_id),
    questionText: String(row.question_text || ''),
    studentAnswer: String(row.student_answer || ''),
    correctAnswer: String(row.correct_answer || ''),
    questionPoints: Number(row.question_points) || 0,
    message: String(row.message || ''),
    status: (row.status || 'new') as GrievanceStatus,
    teacherNote: row.teacher_note || undefined,
    isSeenByAdmin: Boolean(row.is_seen_by_admin),
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

// ============================================================================
// 1. ASSESSMENT FORMS CRUD
// ============================================================================

export async function fetchFormsForAssessment(assessmentId: string): Promise<AssessmentForm[]> {
  const client = getSupabaseClient();
  if (!client || !assessmentId) return [];
  const safeId = toValidUuid(assessmentId);
  const { data, error } = await client
    .from('assessment_forms')
    .select('*')
    .eq('assessment_id', safeId)
    .order('sort_order', { ascending: true });

  if (error) {
    if (!isMissingRelationOrRpcError(error)) {
      console.warn('fetchFormsForAssessment warning:', error.message);
    }
    return [];
  }
  return (data || []).map(mapFormRow);
}

export async function fetchAllAssessmentFormsMap(): Promise<Map<string, AssessmentForm[]>> {
  const map = new Map<string, AssessmentForm[]>();
  const client = getSupabaseClient();
  if (!client) return map;

  const { data, error } = await client
    .from('assessment_forms')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    if (!isMissingRelationOrRpcError(error)) {
      console.warn('fetchAllAssessmentFormsMap warning:', error.message);
    }
    return map;
  }

  (data || []).forEach((row: any) => {
    const mapped = mapFormRow(row);
    const list = map.get(mapped.assessmentId) || [];
    list.push(mapped);
    map.set(mapped.assessmentId, list);
  });
  return map;
}

export async function saveAssessmentForms(
  assessmentId: string,
  forms: AssessmentForm[]
): Promise<{ success: boolean; forms: AssessmentForm[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, forms, error: getTranslations().lib.supabaseNotConnected };

  const safeAssessmentId = toValidUuid(assessmentId);
  const normalizedForms: AssessmentForm[] = forms.slice(0, 10).map((f, idx) => {
    const normQuestions = normalizeQuestionsList(f.questions || []);
    const pts = normQuestions.reduce((acc, q) => acc + (Number(q.points) || 0), 0);
    return {
      ...f,
      id: toValidUuid(f.id),
      assessmentId: safeAssessmentId,
      name: String(f.name || `Form ${idx + 1}`).trim(),
      sortOrder: idx + 1,
      questions: normQuestions,
      totalPoints: pts,
    };
  });

  // Fetch existing DB form IDs to delete any forms removed by the teacher
  const { data: existingRows, error: fetchErr } = await client
    .from('assessment_forms')
    .select('id')
    .eq('assessment_id', safeAssessmentId);

  if (fetchErr) {
    if (isMissingRelationOrRpcError(fetchErr)) {
      return {
        success: false,
        forms: normalizedForms,
        error: getTranslations().lib.needFormsMigration,
      };
    }
    return { success: false, forms: normalizedForms, error: fetchErr.message };
  }

  const keepIds = new Set(normalizedForms.map((f) => f.id));
  const idsToDelete = (existingRows || [])
    .map((r: any) => String(r.id))
    .filter((id: string) => !keepIds.has(id));

  if (idsToDelete.length > 0) {
    await client.from('assessment_forms').delete().in('id', idsToDelete);
  }

  const upsertRows = normalizedForms.map((f) => ({
    id: f.id,
    assessment_id: safeAssessmentId,
    name: f.name,
    sort_order: f.sortOrder,
    questions: f.questions,
    total_points: f.totalPoints || 0,
    updated_at: new Date().toISOString(),
  }));

  if (upsertRows.length > 0) {
    const { error: upsertErr } = await client.from('assessment_forms').upsert(upsertRows);
    if (upsertErr) {
      return { success: false, forms: normalizedForms, error: upsertErr.message };
    }
  }

  return { success: true, forms: normalizedForms };
}

// ============================================================================
// 2. BALANCED STUDENT FORM ASSIGNMENT & REASSIGNMENT
// ============================================================================

export async function assignBalancedFormForStudent(
  assessment: ExamOrAssignment,
  studentId: string
): Promise<{
  formId: string;
  formName: string;
  questions: ExamQuestion[];
  totalPoints: number;
  formsCount: number;
}> {
  const client = getSupabaseClient();
  const safeAssessmentId = toValidUuid(assessment.id);
  const safeStudentId = toValidUuid(studentId);

  if (client && studentId && studentId !== 'guest' && studentId !== 'admin-amr') {
    const { data, error } = await client.rpc('assign_balanced_assessment_form', {
      p_assessment_id: safeAssessmentId,
      p_student_id: safeStudentId,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0];
      const questions = normalizeQuestionsList(Array.isArray(row.questions) ? row.questions : []);
      const totalPts =
        Number(row.total_points) > 0
          ? Number(row.total_points)
          : questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0);
      return {
        formId: String(row.form_id),
        formName: String(row.form_name || 'Form A'),
        questions,
        totalPoints: totalPts,
        formsCount: Number(row.forms_count) || 1,
      };
    }
  }

  // Fallback for previewing / inline assessments without DB forms yet
  const forms = assessment.forms && assessment.forms.length > 0 ? assessment.forms : null;
  if (forms) {
    const picked = forms[0];
    const qs = normalizeQuestionsList(picked.questions || []);
    return {
      formId: picked.id,
      formName: picked.name,
      questions: qs,
      totalPoints: qs.reduce((acc, q) => acc + (Number(q.points) || 0), 0),
      formsCount: forms.length,
    };
  }

  const fallbackQs = normalizeQuestionsList(assessment.questions || []);
  return {
    formId: toValidUuid(`form:${safeAssessmentId}:1`),
    formName: 'Form A',
    questions: fallbackQs,
    totalPoints: fallbackQs.reduce((acc, q) => acc + (Number(q.points) || 0), 0),
    formsCount: 1,
  };
}

export async function fetchAssessmentFormAssignments(
  assessmentId?: string
): Promise<AssessmentFormAssignment[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  let q = client.from('assessment_form_assignments').select('*, assessment_forms(name)');
  if (assessmentId) {
    q = q.eq('assessment_id', toValidUuid(assessmentId));
  }
  const { data, error } = await q;
  if (error) {
    if (!isMissingRelationOrRpcError(error)) {
      console.warn('fetchAssessmentFormAssignments warning:', error.message);
    }
    return [];
  }
  return (data || []).map((r: any) => ({
    id: String(r.id),
    assessmentId: String(r.assessment_id),
    studentId: String(r.student_id),
    formId: String(r.form_id),
    formName: r.assessment_forms?.name || undefined,
    assignedAt: r.assigned_at,
    reassignedBy: r.reassigned_by || undefined,
  }));
}

export async function reassignStudentForm(
  assessmentId: string,
  studentId: string,
  newFormId: string,
  reassignedBy: string,
  forceOverride = false
): Promise<{ success: boolean; blocked?: boolean; attemptsCount?: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: getTranslations().lib.supabaseNotConnected };

  const { data, error } = await client.rpc('reassign_student_assessment_form', {
    p_assessment_id: toValidUuid(assessmentId),
    p_student_id: toValidUuid(studentId),
    p_new_form_id: toValidUuid(newFormId),
    p_reassigned_by: reassignedBy,
    p_force_override: forceOverride,
  });

  if (error) return { success: false, error: error.message };
  if (data?.blocked) {
    return {
      success: false,
      blocked: true,
      attemptsCount: Number(data.attempts_count) || 1,
      error: data.error,
    };
  }
  return { success: true, attemptsCount: Number(data?.attempts_count) || 0 };
}

// ============================================================================
// 3. ATTEMPTS, DUAL SERVER TIMERS & HEARTBEAT / EXIT BEACON
// ============================================================================

export async function runServerAutoSubmitExpiredAttempts(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.rpc('auto_submit_expired_attempts');
  } catch {
    // Non-blocking
  }
}

export async function startOrResumeAttempt(
  assessment: ExamOrAssignment,
  studentId: string,
  assignedForm: { formId: string; formName: string; questions: ExamQuestion[]; totalPoints: number }
): Promise<{
  attempt: AssessmentAttempt | null;
  formName: string;
  limitReached?: boolean;
  error?: string;
}> {
  const t = getTranslations();
  const client = getSupabaseClient();
  if (!client || !studentId || studentId === 'guest' || studentId === 'admin-amr') {
    return { attempt: null, formName: assignedForm.formName, error: t.lib.previewNoAttemptSave };
  }

  const shuffleEnabled = assessment.shuffleForStudents !== false;
  const { questionOrder, choiceOrders } = buildAttemptShuffleOrders(
    assignedForm.questions,
    shuffleEnabled
  );

  const { data, error } = await client.rpc('start_or_resume_assessment_attempt', {
    p_assessment_id: toValidUuid(assessment.id),
    p_student_id: toValidUuid(studentId),
    p_question_order: questionOrder,
    p_choice_orders: choiceOrders,
    p_questions_snapshot: assignedForm.questions,
    p_total_points: assignedForm.totalPoints,
  });

  if (error) {
    return { attempt: null, formName: assignedForm.formName, error: error.message };
  }
  if (data?.error) {
    return {
      attempt: null,
      formName: assignedForm.formName,
      limitReached: Boolean(data.limit_reached),
      error: data.error,
    };
  }
  if (!data?.attempt) {
    return { attempt: null, formName: assignedForm.formName, error: t.lib.attemptCannotStart };
  }
  return {
    attempt: mapAttemptRow(data.attempt, data.form_name || assignedForm.formName),
    formName: data.form_name || assignedForm.formName,
  };
}

export async function heartbeatAttempt(
  attemptId: string,
  answers: Record<string, string>,
  visitedIndices: number[],
  markExit = false
): Promise<{ attempt?: AssessmentAttempt; expired?: boolean; serverNow?: string }> {
  const client = getSupabaseClient();
  if (!client || !attemptId) return {};
  const { data, error } = await client.rpc('heartbeat_assessment_attempt', {
    p_attempt_id: attemptId,
    p_answers: answers,
    p_visited: visitedIndices,
    p_mark_exit: markExit,
  });

  if (error || !data) return {};
  return {
    attempt: data.attempt ? mapAttemptRow(data.attempt) : undefined,
    expired: Boolean(data.expired),
    serverNow: data.server_now,
  };
}

/**
 * Reliable background exit signal fired on pagehide / visibilitychange(hidden) / beforeunload
 * using fetch(..., { keepalive: true }) directly to Supabase REST RPC.
 */
export function sendAttemptExitBeacon(
  attemptId: string,
  answers: Record<string, string>,
  visitedIndices: number[],
  markExit = false
): void {
  if (!attemptId) return;
  try {
    const creds = getSupabaseCredentials();
    if (!creds.url || !creds.anonKey) return;
    const endpoint = `${creds.url.replace(/\/$/, '')}/rest/v1/rpc/heartbeat_assessment_attempt`;
    void fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: creds.anonKey,
        Authorization: `Bearer ${creds.anonKey}`,
      },
      body: JSON.stringify({
        p_attempt_id: attemptId,
        p_answers: answers,
        p_visited: visitedIndices,
        p_mark_exit: markExit,
      }),
    }).catch(() => {});
  } catch {
    // Never block unload
  }
}

export async function submitAssessmentAttempt(params: {
  attempt: AssessmentAttempt;
  exam: ExamOrAssignment;
  status: 'submitted' | 'auto_submitted';
  answers: Record<string, string>;
  questionGrades: Record<string, number>;
  autoZeroedQuestions: string[];
  score: number;
  mcqScore: number;
  mcqTotal: number;
  totalPoints: number;
  hasEssayQuestions: boolean;
  essayGradingPending: boolean;
  studentName: string;
  studentCode: string;
  solvedCount: number;
  correctCount: number;
}): Promise<{ success: boolean; attempt?: AssessmentAttempt; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: getTranslations().lib.supabaseNotConnected };

  const { data, error } = await client.rpc('submit_assessment_attempt', {
    p_attempt_id: params.attempt.id,
    p_status: params.status,
    p_answers: params.answers,
    p_question_grades: params.questionGrades,
    p_auto_zeroed: params.autoZeroedQuestions,
    p_score: params.score,
    p_mcq_score: params.mcqScore,
    p_mcq_total: params.mcqTotal,
    p_total_points: params.totalPoints,
    p_has_essay: params.hasEssayQuestions,
    p_essay_pending: params.essayGradingPending,
  });

  if (error) return { success: false, error: error.message };
  const mappedAttempt = data?.attempt ? mapAttemptRow(data.attempt, params.attempt.formName) : undefined;

  // Also mirror into exam_results so existing student/admin analytics stay synchronized
  await syncSubmissionToSupabase(
    {
      id: params.attempt.id,
      examId: params.exam.id,
      formId: params.attempt.formId,
      formName: params.attempt.formName,
      attemptId: params.attempt.id,
      submissionStatus: params.status,
      studentId: params.attempt.studentId,
      studentName: params.studentName,
      studentCode: params.studentCode,
      score: params.score,
      totalPoints: params.totalPoints,
      answers: params.answers,
      questionsSnapshot: params.attempt.questionsSnapshot,
      hasEssayQuestions: params.hasEssayQuestions,
      mcqScore: params.mcqScore,
      mcqTotal: params.mcqTotal,
      essayGradingPending: params.essayGradingPending,
      questionGrades: params.questionGrades,
      autoZeroedQuestions: params.autoZeroedQuestions,
      startedAt: params.attempt.startedAt,
      attemptNumber: params.attempt.attemptNumber,
      solvedCount: params.solvedCount,
      correctCount: params.correctCount,
      submittedAt: mappedAttempt?.submittedAt || new Date().toISOString(),
    },
    { exam: params.exam }
  );

  return { success: true, attempt: mappedAttempt };
}

export async function fetchStudentAttempts(
  studentId: string,
  assessmentId?: string
): Promise<AssessmentAttempt[]> {
  const client = getSupabaseClient();
  if (!client || !studentId || studentId === 'guest' || studentId === 'admin-amr') return [];

  await runServerAutoSubmitExpiredAttempts();

  let q = client
    .from('assessment_attempts')
    .select('*, assessment_forms(name)')
    .eq('student_id', toValidUuid(studentId))
    .order('attempt_number', { ascending: true });

  if (assessmentId) {
    q = q.eq('assessment_id', toValidUuid(assessmentId));
  }

  const { data, error } = await q;
  if (error) {
    if (!isMissingRelationOrRpcError(error)) {
      console.warn('fetchStudentAttempts warning:', error.message);
    }
    return [];
  }
  return (data || []).map((r: any) => mapAttemptRow(r, r.assessment_forms?.name));
}

export async function fetchAllAttemptsForAdmin(): Promise<AssessmentAttempt[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  await runServerAutoSubmitExpiredAttempts();

  const { data, error } = await client
    .from('assessment_attempts')
    .select('*, assessment_forms(name), profiles(full_name, student_code)')
    .order('started_at', { ascending: false });

  if (error) {
    if (!isMissingRelationOrRpcError(error)) {
      console.warn('fetchAllAttemptsForAdmin warning:', error.message);
    }
    return [];
  }
  return (data || []).map((r: any) =>
    mapAttemptRow(r, r.assessment_forms?.name, r.profiles?.full_name, r.profiles?.student_code)
  );
}

export async function updateAttemptEssayGrades(params: {
  attemptId: string;
  questionGrades: Record<string, number>;
  score: number;
  mcqScore: number;
  totalPoints: number;
  teacherFeedback?: string;
  gradedBy: string;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const pct =
    params.totalPoints > 0
      ? Number(((params.score / params.totalPoints) * 100).toFixed(2))
      : 0;
  const { error } = await client
    .from('assessment_attempts')
    .update({
      question_grades: params.questionGrades,
      score: params.score,
      mcq_score: params.mcqScore,
      percentage: pct,
      essay_grading_pending: false,
      teacher_feedback: params.teacherFeedback || null,
      graded_at: new Date().toISOString(),
      graded_by: params.gradedBy,
    })
    .eq('id', params.attemptId);
  return !error;
}

// ============================================================================
// 4. QUESTION GRIEVANCES
// ============================================================================

export async function submitQuestionGrievance(params: {
  attemptId: string;
  assessmentId: string;
  formId?: string;
  studentId: string;
  questionId: string;
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  questionPoints: number;
  message: string;
}): Promise<{ success: boolean; grievance?: QuestionGrievance; error?: string }> {
  const t = getTranslations();
  const client = getSupabaseClient();
  if (!client) return { success: false, error: t.lib.supabaseNotConnected };

  const trimmedMsg = params.message.trim();
  if (!trimmedMsg) return { success: false, error: t.lib.appealWriteReason };

  const { data, error } = await client
    .from('question_grievances')
    .insert({
      attempt_id: params.attemptId,
      assessment_id: toValidUuid(params.assessmentId),
      form_id: params.formId ? toValidUuid(params.formId) : null,
      student_id: toValidUuid(params.studentId),
      question_id: params.questionId,
      question_text: params.questionText,
      student_answer: params.studentAnswer,
      correct_answer: params.correctAnswer,
      question_points: params.questionPoints,
      message: trimmedMsg,
      status: 'new',
      is_seen_by_admin: false,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: t.lib.appealDuplicate };
    }
    return { success: false, error: error.message };
  }
  return { success: true, grievance: mapGrievanceRow(data) };
}

export async function fetchGrievancesForAttempt(attemptId: string): Promise<QuestionGrievance[]> {
  const client = getSupabaseClient();
  if (!client || !attemptId) return [];
  const { data, error } = await client
    .from('question_grievances')
    .select('*')
    .eq('attempt_id', attemptId);
  if (error) return [];
  return (data || []).map(mapGrievanceRow);
}

export async function fetchAllGrievancesForAdmin(): Promise<QuestionGrievance[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('question_grievances')
    .select('*, assessment_forms(name), assessment_attempts(attempt_number), profiles(full_name, student_code)')
    .order('created_at', { ascending: false });

  if (error) {
    if (!isMissingRelationOrRpcError(error)) {
      console.warn('fetchAllGrievancesForAdmin warning:', error.message);
    }
    return [];
  }
  return (data || []).map((r: any) => ({
    ...mapGrievanceRow(r),
    formName: r.assessment_forms?.name || undefined,
    attemptNumber: r.assessment_attempts?.attempt_number || undefined,
    studentName: r.profiles?.full_name || undefined,
    studentCode: r.profiles?.student_code || undefined,
  }));
}

export async function fetchUnreadGrievancesCount(): Promise<number> {
  const client = getSupabaseClient();
  if (!client) return 0;
  const { count, error } = await client
    .from('question_grievances')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new')
    .eq('is_seen_by_admin', false);
  if (error) return 0;
  return Number(count) || 0;
}

export async function markAllGrievancesSeen(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.rpc('mark_grievances_seen');
  } catch {
    // Non-blocking
  }
}

export async function reviewQuestionGrievance(params: {
  grievanceId: string;
  action: 'approved' | 'rejected';
  teacherNote?: string;
  reviewedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: getTranslations().lib.supabaseNotConnected };

  const { data, error } = await client.rpc('review_question_grievance', {
    p_grievance_id: params.grievanceId,
    p_action: params.action,
    p_teacher_note: params.teacherNote?.trim() || null,
    p_reviewed_by: params.reviewedBy,
  });

  if (error) return { success: false, error: error.message };
  if (data?.error) return { success: false, error: data.error };

  // Also update mirrored exam_results row if an updated attempt was returned
  if (data?.attempt) {
    const att = mapAttemptRow(data.attempt);
    await client
      .from('exam_results')
      .update({
        score: att.score,
        total_score: att.totalPoints,
      })
      .eq('id', att.id);
    // Sync submission_meta relay if present
    try {
      const metaId = toValidUuid(`sub_meta:${att.id}`);
      const { data: metaRow } = await client
        .from('assignments')
        .select('questions')
        .eq('id', metaId)
        .limit(1);
      if (metaRow && metaRow[0]?.questions) {
        await client
          .from('assignments')
          .update({
            questions: {
              ...metaRow[0].questions,
              score: att.score,
              mcqScore: att.mcqScore,
              questionGrades: att.questionGrades,
              gradedAt: att.gradedAt,
              gradedBy: att.gradedBy,
            },
          })
          .eq('id', metaId);
      }
    } catch {
      // Non-blocking mirror sync
    }
  }

  return { success: true };
}

// ============================================================================
// 5. AI TEMPORARY SOURCE IMAGE LIFECYCLE (ai-sources/ -> question-images/ + cleanup)
// ============================================================================

export async function uploadCompressedAiSource(
  rawFile: File,
  assessmentId?: string,
  formId?: string
): Promise<{ success: boolean; publicUrl?: string; storagePath?: string; error?: string }> {
  const compressed = await compressImageFile(rawFile, 1600, 0.8);
  const uploadRes = await uploadFileWithRealProgress(compressed, 'Files', undefined, 'ai-sources');
  if (!uploadRes.success || !uploadRes.url) {
    return { success: false, error: uploadRes.error || 'Failed to upload source image' };
  }

  const client = getSupabaseClient();
  if (client && uploadRes.path) {
    try {
      await client.from('ai_temp_sources').insert({
        assessment_id: assessmentId ? toValidUuid(assessmentId) : null,
        form_id: formId ? toValidUuid(formId) : null,
        storage_path: uploadRes.path,
        public_url: uploadRes.url,
      });
    } catch {
      // Non-blocking tracking row
    }
  }

  return {
    success: true,
    publicUrl: uploadRes.url,
    storagePath: uploadRes.path,
  };
}

export async function deleteAiTempSourceImmediately(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  await deleteFilesBucketPaths([storagePath], 'Files');
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.from('ai_temp_sources').delete().eq('storage_path', storagePath);
    } catch {
      // Non-blocking
    }
  }
}

/**
 * On assessment publish/save:
 * 1) Any question or choice image pointing to ai-sources/ is copied to permanent question-images/.
 * 2) All ai-sources/ objects associated with this assessment/session are deleted from Storage + ai_temp_sources.
 * Never throws or blocks publishing if storage cleanup fails.
 */
export async function promoteAiSourcesAndCleanupOnPublish(
  assessmentId: string,
  forms: AssessmentForm[],
  sessionTempPaths: string[]
): Promise<{ updatedForms: AssessmentForm[] }> {
  const pathsToDelete = new Set<string>(sessionTempPaths.filter(Boolean));
  const copiedCache = new Map<string, string>();

  const promoteUrl = async (url?: string): Promise<string | undefined> => {
    const clean = String(url || '').trim();
    if (!clean) return undefined;
    const bucketPath = extractFilesBucketPath(clean, 'Files');
    if (bucketPath && bucketPath.startsWith('ai-sources/')) {
      pathsToDelete.add(bucketPath);
      if (copiedCache.has(bucketPath)) return copiedCache.get(bucketPath);
      const copied = await copyFilesBucketObject(bucketPath, 'question-images', 'Files');
      if (copied.success && copied.publicUrl) {
        copiedCache.set(bucketPath, copied.publicUrl);
        return copied.publicUrl;
      }
    }
    return clean;
  };

  const updatedForms: AssessmentForm[] = [];
  for (const form of forms) {
    const updatedQuestions: ExamQuestion[] = [];
    for (const q of form.questions) {
      const nextImgUrls: string[] = [];
      const existingImgs = Array.isArray(q.imageUrls)
        ? q.imageUrls
        : q.imageUrl
        ? [q.imageUrl]
        : [];
      for (const u of existingImgs) {
        const promoted = await promoteUrl(u);
        if (promoted && !nextImgUrls.includes(promoted)) nextImgUrls.push(promoted);
      }
      const nextChoices = q.choices
        ? await Promise.all(
            q.choices.map(async (c) => ({
              ...c,
              imageUrl: await promoteUrl(c.imageUrl),
            }))
          )
        : undefined;

      updatedQuestions.push(
        normalizeQuestion({
          ...q,
          imageUrl: nextImgUrls[0],
          imageUrls: nextImgUrls.length > 0 ? nextImgUrls : undefined,
          choices: nextChoices,
        })
      );
    }
    updatedForms.push({ ...form, questions: updatedQuestions });
  }

  // Non-blocking cleanup of ai-sources/ in Storage & ai_temp_sources table
  try {
    const client = getSupabaseClient();
    const safeAssessmentId = toValidUuid(assessmentId);
    if (client) {
      const { data: tracked } = await client
        .from('ai_temp_sources')
        .select('storage_path')
        .eq('assessment_id', safeAssessmentId);
      if (Array.isArray(tracked)) {
        tracked.forEach((r: any) => {
          if (r?.storage_path) pathsToDelete.add(String(r.storage_path));
        });
      }
    }
    const allPaths = Array.from(pathsToDelete);
    if (allPaths.length > 0) {
      await deleteFilesBucketPaths(allPaths, 'Files');
      if (client) {
        await client.from('ai_temp_sources').delete().in('storage_path', allPaths);
      }
    }
  } catch {
    // Do not block publish if cleanup errors
  }

  return { updatedForms };
}
