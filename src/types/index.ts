/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'student' | 'admin' | 'secretary';

export interface UserProfile {
  id: string;
  studentCode: string;
  fullName: string;
  phone: string;
  parentPhone?: string;
  email?: string;
  password?: string;
  governorate: string;
  grade: string;
  role: UserRole;
  balance: number;
  completedLectures?: string[];
  enrolledCourses?: string[];
  grantedDocuments?: string[];
  createdAt: string;
}

export type LessonSectionContentType = 'video' | 'pdf' | 'assignment' | 'exam' | 'link' | 'text';

export interface SectionContentItem {
  id: string;
  title: string;
  contentType: LessonSectionContentType;
  order?: number;
  videoUrl?: string;
  fileUrl?: string;
  examId?: string;
  documentId?: string;
  textContent?: string;
  description?: string;
  durationMinutes?: number;
  durationSeconds?: number;
  pagesCount?: number;
  inlineQuestions?: ExamQuestion[];
}

export interface LessonSubSection {
  id: string;
  title: string;
  contentType: LessonSectionContentType;
  order?: number;
  videoUrl?: string;
  fileUrl?: string;
  examId?: string;
  documentId?: string;
  textContent?: string;
  description?: string;
  durationMinutes?: number;
  durationSeconds?: number;
  pagesCount?: number;
  isDefault?: boolean;
  inlineQuestions?: ExamQuestion[];
  items?: SectionContentItem[];
}

export interface CourseLesson {
  id: string;
  title: string;
  description?: string;
  order: number;
  sections: LessonSubSection[];
}

export interface CourseLecture {
  id: string;
  title: string;
  chapter: string;
  description: string;
  coverUrl?: string;
  instructions?: string;
  scheduleText?: string;
  lessons?: CourseLesson[];
  draftLessons?: CourseLesson[];
  videoUrl: string;
  streamUrl?: string;
  videoSource: 'youtube' | 'drive' | 'supabase' | 'direct' | 'telegram';
  provider?: string;
  external_id?: string;
  original_url?: string;
  price: number;
  isFree: boolean;
  grade: string;
  durationMinutes: number;
  durationSeconds?: number;
  viewsCount: number;
  attachedPdfUrl?: string;
  attachedExamId?: string;
  createdAt: string;
}

export interface ChemistryDocument {
  id: string;
  title: string;
  docType: 'Study Notes' | 'Question Sheet' | 'Grammar & Rules Summary' | 'Final Revision';
  grade: string;
  fileUrl: string;
  fileSize: string;
  pagesCount: number;
  downloadsCount: number;
  price?: number;
  isFree?: boolean;
  provider?: string;
  external_id?: string;
  original_url?: string;
  createdAt: string;
}

export type DurationUnit = 'minutes' | 'hours' | 'days';

export interface ExamChoice {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface ExamQuestion {
  id: string;
  type: 'mcq' | 'essay';
  question: string;
  options?: string[];
  choices?: ExamChoice[];
  correctChoiceIds?: string[];
  correctAnswer: string;
  explanation: string;
  points: number;
  imageUrl?: string;
  imageUrls?: string[];
  lockChoiceOrder?: boolean;
  groupId?: string;
  chapter?: string;
  lesson?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  _cachedMcqChoices?: {
    choices?: ExamChoice[];
    correctChoiceIds?: string[];
    options?: string[];
    correctAnswer?: string;
  };
}

export interface QuestionBankItem extends ExamQuestion {
  grade: string;
  chapter: string;
  lesson: string;
  sourceTitle?: string;
}

export interface QuestionBankAttemptEntry {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  answeredAt: string;
}

export interface AssessmentForm {
  id: string;
  assessmentId: string;
  name: string;
  sortOrder: number;
  questions: ExamQuestion[];
  totalPoints?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AssessmentFormAssignment {
  id: string;
  assessmentId: string;
  studentId: string;
  formId: string;
  formName?: string;
  assignedAt: string;
  reassignedBy?: string;
}

export type AssessmentAttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted';

export interface AssessmentAttempt {
  id: string;
  assessmentId: string;
  formId: string;
  formName?: string;
  studentId: string;
  studentName?: string;
  studentCode?: string;
  attemptNumber: number;
  status: AssessmentAttemptStatus;
  startedAt: string;
  lastSeenAt: string;
  firstExitedAt?: string | null;
  totalDeadlineAt?: string | null;
  resumeDeadlineAt?: string | null;
  submittedAt?: string | null;
  questionOrder: string[];
  choiceOrders: Record<string, string[]>;
  answers: Record<string, string>;
  visitedQuestionIndices?: number[];
  questionsSnapshot: ExamQuestion[];
  questionGrades?: Record<string, number>;
  autoZeroedQuestions?: string[];
  score: number;
  mcqScore?: number;
  mcqTotal?: number;
  totalPoints: number;
  percentage: number;
  hasEssayQuestions?: boolean;
  essayGradingPending?: boolean;
  teacherFeedback?: string;
  gradedAt?: string;
  gradedBy?: string;
}

export type GrievanceStatus = 'new' | 'approved' | 'rejected';

export interface QuestionGrievance {
  id: string;
  attemptId: string;
  assessmentId: string;
  formId?: string;
  formName?: string;
  attemptNumber?: number;
  studentId: string;
  studentName?: string;
  studentCode?: string;
  questionId: string;
  questionText?: string;
  studentAnswer: string;
  correctAnswer: string;
  questionPoints: number;
  message: string;
  status: GrievanceStatus;
  teacherNote?: string;
  isSeenByAdmin?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface AiTempSource {
  id: string;
  assessmentId?: string;
  formId?: string;
  storagePath: string;
  publicUrl: string;
  createdAt: string;
}

export interface QuestionAuditEntry {
  questionId: string;
  questionText: string;
  studentAnswerDisplay: string;
  storedCorrectDisplay: string;
  awardedPoints: number;
  maxPoints: number;
  isCorrect: boolean;
  isPendingEssay?: boolean;
}

export interface ExamOrAssignment {
  id: string;
  title: string;
  category: 'exam' | 'assignment' | 'sheet';
  grade: string;
  durationMinutes?: number;
  durationUnit?: DurationUnit;
  resumeWindowMinutes?: number;
  resumeWindowUnit?: DurationUnit;
  maxAttempts?: number;
  shuffleForStudents?: boolean;
  totalPoints: number;
  deadline?: string;
  lessonTitle?: string;
  lessonNumber?: number;
  maxCompletionHours?: number;
  questions: ExamQuestion[];
  forms?: AssessmentForm[];
  imageUrl?: string;
  chapter?: string;
  isCustomForStudentId?: string;
  createdAt: string;
}

export interface ExamSubmission {
  id: string;
  examId: string;
  formId?: string;
  formName?: string;
  attemptId?: string;
  submissionStatus?: AssessmentAttemptStatus;
  studentId: string;
  studentName: string;
  studentCode: string;
  score: number;
  totalPoints: number;
  answers: Record<string, string>;
  questionsSnapshot?: ExamQuestion[];
  questionOrder?: string[];
  choiceOrders?: Record<string, string[]>;
  hasEssayQuestions?: boolean;
  mcqScore?: number;
  mcqTotal?: number;
  essayGradingPending?: boolean;
  questionGrades?: Record<string, number>;
  autoZeroedQuestions?: string[];
  teacherFeedback?: string;
  gradedAt?: string;
  gradedBy?: string;
  startedAt?: string;
  attemptNumber?: number;
  solvedCount?: number;
  correctCount?: number;
  submittedAt: string;
}

export interface ExamProgress {
  examId: string;
  formId?: string;
  attemptId?: string;
  studentId: string;
  category: 'exam' | 'assignment' | 'sheet';
  answers: Record<string, string>;
  visitedQuestionIndices: number[];
  secondsElapsed: number;
  remainingSeconds: number;
  startedAt?: string;
  expiresAt?: string;
  firstExitedAt?: string | null;
  resumeDeadlineAt?: string | null;
  lastUpdated: string;
}

export interface PaymentMethodItem {
  id: string;
  name: string;
  accountValue: string;
  instructions?: string;
  iconType?: 'phone' | 'zap' | 'building' | 'card' | 'wallet';
  accentColor?: 'red' | 'purple' | 'amber' | 'blue' | 'emerald';
  isActive: boolean;
  createdAt?: string;
}

export interface RedeemCode {
  code: string;
  amount: number;
  maxUses: number;
  usedCount: number;
  codeType?: 'balance' | 'course';
  courseId?: string;
  targetCourseTitle?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  createdBy?: string;
  createdAt: string;
}

export interface PaymentRequest {
  id: string;
  studentId: string;
  studentName: string;
  studentPhone: string;
  studentCode: string;
  method: string;
  methodLabel?: string;
  amount: number;
  receiptImage?: string;
  referenceNumber: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface PlatformNotification {
  id: string;
  title: string;
  content: string;
  targetGrade: string;
  isUrgent: boolean;
  audioUrl?: string;
  audioDurationSeconds?: number;
  createdBy?: string;
  createdAt: string;
  isRead?: boolean;
}

export interface HonorStudent {
  id: string;
  studentName: string;
  governorate: string;
  score: number;
  maxScore: number;
  rank: number;
  titleBadge: string;
  notes?: string;
  createdAt: string;
}

export interface SecretaryMember {
  id: string;
  name: string;
  phone: string;
  role: string;
  notes?: string;
  permissions: {
    manageStudents: boolean;
    manageExams: boolean;
    managePayments: boolean;
    manageCourses: boolean;
  };
  createdAt: string;
}

export interface PlatformSettings {
  academicYear: string;
  platformName: string;
  teacherName: string;
  teacherPhone: string;
  supportPhone: string;
  themeColor: string;
  colorTheme?: 'amber' | 'blue' | 'emerald' | 'purple' | 'rose' | 'cyan';
  pageLayout?: 'comfortable' | 'compact' | 'modern';
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseConnected?: boolean;
}

export interface SupportMessage {
  id: string;
  senderRole: 'student' | 'admin';
  senderName: string;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDurationSeconds?: number;
  createdAt: string;
}

export interface SupportThread {
  id: string;
  ownerKey: string;
  studentId?: string;
  studentName: string;
  studentCode?: string;
  studentPhone?: string;
  studentGrade?: string;
  pageNumber?: string;
  questionNumber?: string;
  status: 'open' | 'answered';
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
}


