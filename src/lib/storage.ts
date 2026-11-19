/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  UserProfile,
  CourseLecture,
  ChemistryDocument,
  ExamOrAssignment,
  RedeemCode,
  PaymentRequest,
  PaymentMethodItem,
  PlatformNotification,
  HonorStudent,
  SecretaryMember,
  PlatformSettings,
  ExamSubmission,
  ExamProgress,
  QuestionBankAttemptEntry,
  SupportThread,
  SupportMessage,
} from '../types';
import { formatTemplate, getCurrentLanguage, getPaymentMethodFallbackLabel, getTranslations } from './translations';
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  SupabaseSyncResult,
  generateUuid,
  toValidUuid,
  syncCourseToSupabase,
  deleteCourseFromSupabase,
  syncRedeemCodeToSupabase,
  syncRedeemCodesBulkToSupabase,
  deleteRedeemCodeFromSupabase,
  syncProfileToSupabase,
  deleteProfileFromSupabase,
  findProfileInSupabase,
  findProfileInSupabaseWithStatus,
  syncDocumentToSupabase,
  deleteDocumentFromSupabase,
  syncExamToSupabase,
  deleteExamFromSupabase,
  syncExamProgressToSupabase,
  fetchExamProgressFromSupabase,
  fetchStudentExamProgressListFromSupabase,
  deleteExamProgressFromSupabase,
  syncSubmissionToSupabase,
  syncPaymentToSupabase,
  deletePaymentFromSupabase,
  fetchSettingsFromSupabase,
  syncSettingsToSupabase,
  fetchCoursesFromSupabase,
  fetchProfilesFromSupabase,
  fetchDocumentsFromSupabase,
  fetchExamsFromSupabase,
  fetchSubmissionsFromSupabase,
  fetchPaymentsFromSupabase,
  fetchRedeemCodesFromSupabase,
  syncQuestionBankProgressToSupabase,
  fetchQuestionBankProgressFromSupabase,
  fetchPaymentMethodsFromSupabase,
  syncPaymentMethodsToSupabase,
  fetchNotificationsFromSupabase,
  syncNotificationToSupabase,
  deleteNotificationFromSupabase,
  fetchSecretariesFromSupabase,
  syncSecretariesToSupabase,
  fetchHonorStudentsFromSupabase,
  syncHonorStudentToSupabase,
  deleteHonorStudentFromSupabase,
  fetchSupportThreadsFromSupabase,
  syncSupportThreadToSupabase,
  deleteSupportThreadFromSupabase,
} from './supabase';
import { fetchAllAssessmentFormsMap } from './supabaseAssessments';

const INITIAL_SETTINGS: PlatformSettings = {
  academicYear: '2026',
  platformName: 'English with Miss Asmaa',
  teacherName: 'Miss Asmaa',
  teacherPhone: '01069780486',
  supportPhone: '01069780486',
  themeColor: '#F59E0B',
  colorTheme: 'amber',
  pageLayout: 'comfortable',
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
};

const INITIAL_COURSES: CourseLecture[] = [
  {
    id: 'course-1',
    title: 'Lecture 1: English Grammar Foundations, Tenses & Sentence Structure',
    chapter: 'Unit 1: Mastering English Tenses',
    description: 'Detailed explanation of past, present, and future tenses, common usage rules, and exam-style practice questions.',
    coverUrl: '/src/assets/images/chem_transition_elements_cover_1794567946561.jpg',
    scheduleText: 'Available Daily · Foundation Week 1',
    instructions: 'Watch the full lecture video, download the grammar summary notes, and complete the homework assignment and interactive quiz.',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoSource: 'youtube',
    price: 0,
    isFree: true,
    grade: '3rd Secondary',
    durationMinutes: 65,
    viewsCount: 1420,
    createdAt: '2026-09-01T10:00:00Z',
    lessons: [
      {
        id: 'c1-l1',
        title: 'Lesson 1: Grammar Foundations & Core Tenses',
        description: 'Present simple, present continuous, past simple, and past continuous in context',
        order: 1,
        sections: [
          {
            id: 'c1-l1-vid',
            title: 'Lesson Explanation',
            contentType: 'video',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            durationMinutes: 65,
            description: 'Complete explanation of English tense foundations',
            isDefault: true,
          },
          {
            id: 'c1-l1-pdf',
            title: 'Notes & PDF Files',
            contentType: 'pdf',
            documentId: 'doc-1',
            description: 'Master Study Notes - Unit 1: English Tenses & Grammar',
          },
          {
            id: 'c1-l1-assign',
            title: 'Submit Assignment',
            contentType: 'assignment',
            examId: 'assign-1',
            description: 'Practice homework on verb tenses and key vocabulary',
            isDefault: true,
          },
          {
            id: 'c1-l1-exam',
            title: 'Interactive Quiz',
            contentType: 'exam',
            examId: 'exam-1',
            description: 'Weekly comprehensive exam on English tenses and sentence structure',
            isDefault: true,
          },
        ],
      },
      {
        id: 'c1-l2',
        title: 'Lesson 2: Perfect Tenses & Time Expressions',
        description: 'Present perfect vs. past simple and past perfect sequences with time clauses',
        order: 2,
        sections: [
          {
            id: 'c1-l2-vid',
            title: 'Lesson Explanation',
            contentType: 'video',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            durationMinutes: 45,
            description: 'Detailed guide to perfect tenses and time markers',
            isDefault: true,
          },
          {
            id: 'c1-l2-mnd',
            title: 'Workbook Practice',
            contentType: 'video',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            durationMinutes: 35,
            description: 'Step-by-step solutions for Lesson 1 workbook exercises',
          },
          {
            id: 'c1-l2-thw',
            title: 'Past General Secondary Exam Questions',
            contentType: 'pdf',
            documentId: 'doc-3',
            description: 'Official past exam questions from previous academic years',
          },
          {
            id: 'c1-l2-exam',
            title: 'Interactive Quiz',
            contentType: 'exam',
            examId: 'sheet-1',
            description: 'Quick practice sheet on perfect tenses and expressions',
            isDefault: true,
          },
        ],
      },
    ],
  },
  {
    id: 'course-2',
    title: 'Lecture 2: Passive Voice, Causative Verbs & Modal Deductions',
    chapter: 'Unit 2: Advanced Grammar & Voice',
    description: 'Comprehensive guide to active-to-passive transformations across all tenses, causative "have/get", and modal verbs of deduction.',
    coverUrl: '/src/assets/images/chem_analytical_titration_cover_1794567947084.jpg',
    scheduleText: 'Every Saturday & Tuesday · 6:00 PM',
    instructions: 'Review the passive voice tense table before attempting the interactive quiz and submitting the practice sheet.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    videoSource: 'direct',
    price: 50,
    isFree: false,
    grade: '3rd Secondary',
    durationMinutes: 75,
    viewsCount: 890,
    createdAt: '2026-09-08T10:00:00Z',
    lessons: [
      {
        id: 'c2-l1',
        title: 'Lesson 1: Passive Structures & Modal Verbs',
        order: 1,
        sections: [
          {
            id: 'c2-l1-vid',
            title: 'Lesson Explanation',
            contentType: 'video',
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            durationMinutes: 75,
            isDefault: true,
          },
          {
            id: 'c2-l1-assign',
            title: 'Submit Assignment',
            contentType: 'assignment',
            examId: 'assign-1',
            isDefault: true,
          },
          {
            id: 'c2-l1-exam',
            title: 'Interactive Quiz',
            contentType: 'exam',
            examId: 'exam-1',
            isDefault: true,
          },
          {
            id: 'c2-l1-emt',
            title: 'Exam Practice Solutions',
            contentType: 'video',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            durationMinutes: 40,
          },
        ],
      },
    ],
  },
  {
    id: 'course-3',
    title: 'Lecture 3: Reading Comprehension Strategies & Critical Inference',
    chapter: 'Unit 3: Reading & Vocabulary Mastery',
    description: 'Techniques for skimming, scanning, guessing word meanings from context, and answering inference questions accurately.',
    coverUrl: '/src/assets/images/chem_transition_elements_cover_1794567946561.jpg',
    scheduleText: 'Every Wednesday · 7:00 PM',
    instructions: 'Print the reading passage worksheet from the Study Notes section before watching the lesson.',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoSource: 'youtube',
    price: 50,
    isFree: false,
    grade: '3rd Secondary',
    durationMinutes: 80,
    viewsCount: 650,
    createdAt: '2026-09-15T10:00:00Z',
  },
  {
    id: 'course-4',
    title: 'Lecture 1: Academic Essay Writing, Punctuation & Translation Skills',
    chapter: 'Unit 4: Writing & Translation',
    description: 'How to structure persuasive and descriptive essays, master English punctuation marks, and translate idioms naturally.',
    coverUrl: '/src/assets/images/chem_organic_hydrocarbons_cover_1794567946655.jpg',
    scheduleText: 'Every Friday · 5:00 PM',
    instructions: 'Pay close attention to topic sentences, transition signals, and comma/semicolon rules.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    videoSource: 'direct',
    price: 60,
    isFree: false,
    grade: '3rd Secondary',
    durationMinutes: 90,
    viewsCount: 1240,
    createdAt: '2026-10-01T10:00:00Z',
  },
  {
    id: 'course-5',
    title: 'Foundation Lecture: Parts of Speech, Future Forms & Comparisons',
    chapter: 'Unit 1: Language Foundations',
    description: 'A thorough review of English sentence essentials, future forms, and adjective comparisons for 2nd Secondary students.',
    coverUrl: '/src/assets/images/chem_analytical_titration_cover_1794567947084.jpg',
    scheduleText: 'Available Free All Week',
    instructions: 'Free foundation lecture including PDF study notes and an interactive practice quiz.',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoSource: 'youtube',
    price: 0,
    isFree: true,
    grade: '2nd Secondary',
    durationMinutes: 50,
    viewsCount: 780,
    createdAt: '2026-09-05T10:00:00Z',
  },
];

const INITIAL_DOCUMENTS: ChemistryDocument[] = [
  {
    id: 'doc-1',
    title: 'Master Study Notes - Unit 1: English Tenses & Sentence Structure',
    docType: 'Study Notes',
    grade: '3rd Secondary',
    fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    fileSize: '14.8 MB',
    pagesCount: 48,
    downloadsCount: 1530,
    createdAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'doc-2',
    title: 'Complete English Grammar, Idioms & Phrasal Verbs Handbook',
    docType: 'Grammar & Rules Summary',
    grade: '3rd Secondary',
    fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    fileSize: '8.2 MB',
    pagesCount: 22,
    downloadsCount: 2100,
    createdAt: '2026-09-10T10:00:00Z',
  },
  {
    id: 'doc-3',
    title: 'Reading Comprehension & Translation Practice Question Sheet',
    docType: 'Question Sheet',
    grade: '3rd Secondary',
    fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    fileSize: '11.5 MB',
    pagesCount: 36,
    downloadsCount: 940,
    createdAt: '2026-09-18T10:00:00Z',
  },
  {
    id: 'doc-4',
    title: '2nd Secondary Study Notes - Future Forms, Modals & Vocabulary',
    docType: 'Study Notes',
    grade: '2nd Secondary',
    fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    fileSize: '9.0 MB',
    pagesCount: 30,
    downloadsCount: 620,
    createdAt: '2026-09-12T10:00:00Z',
  },
];

const INITIAL_EXAMS: ExamOrAssignment[] = [
  {
    id: 'exam-1',
    title: 'Weekly Comprehensive Exam 1: English Tenses & Vocabulary',
    category: 'exam',
    grade: '3rd Secondary',
    durationMinutes: 300,
    totalPoints: 18,
    deadline: 'Available immediately',
    lessonTitle: 'Lesson 1: Grammar & Tenses',
    lessonNumber: 1,
    maxCompletionHours: 5,
    imageUrl: '/assets/aistudio/FB_IMG_1793743497996_a470a9e3.jpg',
    createdAt: '2026-09-10T12:00:00Z',
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        question: 'By the time the guests arrived, Miss Asmaa ________ preparing all the study materials.',
        options: [
          'A) had finished',
          'B) has finished',
          'C) was finishing',
          'D) finishes',
        ],
        correctAnswer: 'A) had finished',
        explanation: 'The past perfect (had finished) is used for an action completed before another past action ("arrived").',
        points: 4,
        chapter: 'Unit 1',
      },
      {
        id: 'q2',
        type: 'mcq',
        question: 'Which sentence uses a phrasal verb correctly to mean "discover or find by chance"?',
        options: [
          'A) I ran out of my old English notebook.',
          'B) I came across an interesting article about bilingual education.',
          'C) She put up with the heavy traffic.',
          'D) They turned down the job offer.',
        ],
        correctAnswer: 'B) I came across an interesting article about bilingual education.',
        explanation: '"Come across" means to meet or find someone or something by chance.',
        points: 4,
        chapter: 'Unit 1',
      },
      {
        id: 'q3',
        type: 'mcq',
        question: 'Neither the teacher nor the students ________ satisfied with the audio quality yesterday.',
        options: [
          'A) were',
          'B) was',
          'C) are',
          'D) is',
        ],
        correctAnswer: 'A) were',
        explanation: 'With "neither ... nor", the verb agrees with the closer subject ("the students", plural) and matches the past time marker "yesterday".',
        points: 4,
        chapter: 'Unit 1',
      },
      {
        id: 'q4',
        type: 'essay',
        question: 'Explain the difference between "used to + infinitive" and "be used to + -ing / noun", and write one example sentence for each.',
        options: [],
        correctAnswer: '"Used to + infinitive" describes a past habit or state that no longer exists (e.g., I used to read short stories every night). "Be used to + -ing/noun" means being accustomed to or familiar with something (e.g., She is used to speaking English in class).',
        explanation: 'Use "used to" for discontinued past habits, and "be/get used to" for familiarity.',
        points: 6,
        chapter: 'Unit 1',
      },
    ],
  },
  {
    id: 'assign-1',
    title: 'Week 2 Assignment: Practice Sheet on Tenses & Collocations',
    category: 'assignment',
    grade: '3rd Secondary',
    durationMinutes: 1440,
    totalPoints: 10,
    deadline: 'Available to complete within 24 hours of starting',
    lessonTitle: 'Lesson 2: Collocations & Phrasal Verbs',
    lessonNumber: 2,
    maxCompletionHours: 24,
    createdAt: '2026-09-15T12:00:00Z',
    questions: [
      {
        id: 'aq1',
        type: 'mcq',
        question: 'To achieve fluency in English, students should ________ a habit of reading for twenty minutes every day.',
        options: ['A) do', 'B) take', 'C) make', 'D) develop'],
        correctAnswer: 'D) develop',
        explanation: 'The natural English collocation is "develop a habit of" (or "form a habit of").',
        points: 5,
        chapter: 'Unit 1',
      },
      {
        id: 'aq2',
        type: 'mcq',
        question: 'Choose the correct reported sentence for: "I will submit the essay tomorrow," said Mona.',
        options: [
          'A) Mona said that she will submit the essay tomorrow.',
          'B) Mona said that she would submit the essay the following day.',
          'C) Mona told she would submit the essay the next day.',
          'D) Mona said that I would submit the essay yesterday.',
        ],
        correctAnswer: 'B) Mona said that she would submit the essay the following day.',
        explanation: 'In reported speech, "will" changes to "would" and "tomorrow" changes to "the following day" or "the next day".',
        points: 5,
        chapter: 'Unit 1',
      },
    ],
  },
  {
    id: 'sheet-1',
    title: 'Lesson 1 Sheet: Reading Comprehension & Writing Mechanics',
    category: 'sheet',
    grade: '3rd Secondary',
    durationMinutes: 300,
    totalPoints: 10,
    deadline: 'Available for 5 hours after clicking resume',
    lessonTitle: 'Lesson 1: Grammar & Tenses',
    lessonNumber: 1,
    maxCompletionHours: 5,
    createdAt: '2026-09-20T12:00:00Z',
    questions: [
      {
        id: 'sq1',
        type: 'mcq',
        question: 'Which punctuation mark is most appropriate to join two closely related independent clauses without a coordinating conjunction?',
        options: [
          'A) A comma',
          'B) A question mark',
          'C) A semicolon (;)',
          'D) An apostrophe',
        ],
        correctAnswer: 'C) A semicolon (;)',
        explanation: 'A semicolon connects two closely related independent clauses without using "and", "but", or "so".',
        points: 10,
        chapter: 'Unit 1',
      },
    ],
  },
];

const INITIAL_REDEEM_CODES: RedeemCode[] = [
  {
    code: 'ENG-100',
    amount: 100,
    maxUses: 1000,
    usedCount: 23,
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    code: 'ASMAA-50',
    amount: 50,
    maxUses: 500,
    usedCount: 45,
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    code: 'WELCOME-2026',
    amount: 150,
    maxUses: 2000,
    usedCount: 112,
    createdAt: '2026-09-01T00:00:00Z',
  },
];

const INITIAL_HONOR_STUDENTS: HonorStudent[] = [
  {
    id: 'h-1',
    studentName: 'Yasmine Ahmed El-Said',
    governorate: 'Dakahlia - Mansoura',
    score: 60,
    maxScore: 60,
    rank: 1,
    titleBadge: '1st Place Nationwide 🥇',
    notes: 'Full marks in all Unit 1 exams and weekly assignments',
    createdAt: '2026-09-25T10:00:00Z',
  },
  {
    id: 'h-2',
    studentName: 'Mohamed Hossam Abdel-Aziz',
    governorate: 'Cairo - Nasr City',
    score: 59,
    maxScore: 60,
    rank: 2,
    titleBadge: '2nd Place in Cohort 🥈',
    notes: 'Outstanding excellence in essay writing and reading comprehension',
    createdAt: '2026-09-25T10:00:00Z',
  },
  {
    id: 'h-3',
    studentName: 'Salma Ibrahim El-Shenawy',
    governorate: 'Alexandria - Smouha',
    score: 59,
    maxScore: 60,
    rank: 3,
    titleBadge: '3rd Place in Cohort 🥉',
    notes: 'Submitted all sheets on time with full scores',
    createdAt: '2026-09-25T10:00:00Z',
  },
  {
    id: 'h-4',
    studentName: 'Omar Tarek El-Naggar',
    governorate: 'Gharbia - Tanta',
    score: 58,
    maxScore: 60,
    rank: 4,
    titleBadge: 'English Star Achiever 🌟',
    notes: 'Distinction score in the comprehensive cumulative exam',
    createdAt: '2026-09-25T10:00:00Z',
  },
];

const INITIAL_SECRETARIES: SecretaryMember[] = [
  {
    id: 'sec-1',
    name: 'Mr. Mahmoud Azmy (Senior Secretary)',
    phone: '01011223344',
    role: 'Follow-up & Payment Verification Manager',
    notes: 'Responsible for reviewing Vodafone Cash and InstaPay transfers and activating center codes',
    permissions: {
      manageStudents: true,
      manageExams: true,
      managePayments: true,
      manageCourses: false,
    },
    createdAt: '2026-09-01T08:00:00Z',
  },
  {
    id: 'sec-2',
    name: 'Miss Sara El-Sherif (Academic Coordinator)',
    phone: '01099887766',
    role: 'Assignments & Exams Coordinator',
    notes: 'Following up on essay grading and sending exam results to parents',
    permissions: {
      manageStudents: true,
      manageExams: true,
      managePayments: false,
      manageCourses: true,
    },
    createdAt: '2026-09-05T08:00:00Z',
  },
];

const INITIAL_NOTIFICATIONS: PlatformNotification[] = [
  {
    id: 'notif-1',
    title: 'Welcome to English with Miss Asmaa for the New Academic Year 📚',
    content: 'Welcome to all our Secondary students on your official learning platform! Follow the weekly schedule of lectures, study sheets, and exams right here.',
    targetGrade: 'All',
    isUrgent: true,
    createdAt: '2026-09-01T09:00:00Z',
    isRead: false,
  },
  {
    id: 'notif-2',
    title: 'First Comprehensive Exam & Honor Board Recognition 🏆',
    content: 'The first exam is now open on the platform (45 minutes, modern exam format). Students scoring above 95% will be featured on the official Honor Board.',
    targetGrade: '3rd Secondary',
    isUrgent: false,
    createdAt: '2026-09-12T14:00:00Z',
    isRead: false,
  },
];

const INITIAL_PAYMENT_METHODS: PaymentMethodItem[] = [
  {
    id: 'vodafone_cash',
    name: 'Vodafone Cash & Mobile Wallets',
    accountValue: '01069780486',
    instructions: 'Transfer the amount from any mobile wallet, then upload a screenshot of the receipt to confirm your balance within 20 minutes.',
    iconType: 'phone',
    accentColor: 'red',
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'instapay',
    name: 'InstaPay',
    accountValue: 'asmaa.english@instapay',
    instructions: 'Instant bank transfer via InstaPay—please write the student name in the transfer notes.',
    iconType: 'zap',
    accentColor: 'purple',
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'fawry',
    name: 'Fawry & Payment Outlets',
    accountValue: 'Service Code: 7894',
    instructions: 'Pay at any nearby Fawry outlet or get top-up cards directly from Miss Asmaa’s study centers.',
    iconType: 'building',
    accentColor: 'amber',
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
  },
];

const INITIAL_PAYMENTS: PaymentRequest[] = [
  {
    id: 'pay-1',
    studentId: 'std-1',
    studentName: 'Yasmine Ahmed El-Said',
    studentPhone: '01012345678',
    studentCode: 'ENG-101',
    method: 'vodafone_cash',
    amount: 150,
    receiptImage: '/assets/aistudio/Screenshot_________________Chrome_d4f75a4b.jpg',
    referenceNumber: 'VF-9823411',
    status: 'approved',
    notes: 'Confirmed and balance topped up within 10 minutes',
    createdAt: '2026-09-05T12:00:00Z',
    reviewedAt: '2026-09-05T12:12:00Z',
  },
];

// Helper to safely read and write to LocalStorage
function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const val = localStorage.getItem(`amr_chem_${key}`);
    return val ? JSON.parse(val) : defaultValue;
  } catch (e) {
    console.error(`Error reading storage key ${key}:`, e);
    return defaultValue;
  }
}

function setToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`amr_chem_${key}`, JSON.stringify(value));
  } catch (e) {
    console.error(`Error setting storage key ${key}:`, e);
  }
}

export const platformDB = {
  // Current user
  getCurrentUser(): UserProfile | null {
    return getFromStorage<UserProfile | null>('current_user', null);
  },
  setCurrentUser(user: UserProfile | null) {
    setToStorage('current_user', user);
  },

  // Settings
  getSettings(): PlatformSettings {
    return getFromStorage<PlatformSettings>('settings', INITIAL_SETTINGS);
  },
  updateSettings(settings: Partial<PlatformSettings>): PlatformSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    setToStorage('settings', updated);
    const payload: Record<string, string> = {};
    Object.entries(updated).forEach(([k, v]) => {
      if (v !== undefined && v !== null) payload[k] = String(v);
    });
    syncSettingsToSupabase(payload).catch(() => {});
    return updated;
  },
  async updateSettingsAsync(settings: Partial<PlatformSettings>): Promise<{ settings: PlatformSettings; supabaseResult: SupabaseSyncResult }> {
    const updated = this.updateSettings(settings);
    const payload: Record<string, string> = {};
    Object.entries(updated).forEach(([k, v]) => {
      if (v !== undefined && v !== null) payload[k] = String(v);
    });
    const supabaseResult = await syncSettingsToSupabase(payload);
    return { settings: updated, supabaseResult };
  },

  // Courses
  getCourses(): CourseLecture[] {
    return getFromStorage<CourseLecture[]>('courses', INITIAL_COURSES);
  },
  async saveCourse(course: CourseLecture): Promise<{ list: CourseLecture[]; supabaseResult: { success: boolean; error?: string } }> {
    const list = this.getCourses();
    const idx = list.findIndex((c) => c.id === course.id || toValidUuid(c.id) === toValidUuid(course.id));
    if (idx >= 0) {
      list[idx] = course;
    } else {
      list.unshift(course);
    }
    setToStorage('courses', list);
    const supabaseResult = await syncCourseToSupabase(course);
    if (supabaseResult.success && !supabaseResult.isLocalFallback) {
      setToStorage('synced_courses', true);
    }
    return { list, supabaseResult };
  },
  async saveCourseWithProbe(course: CourseLecture): Promise<{ course: CourseLecture; supabaseResult: { success: boolean; error?: string } }> {
    const { supabaseResult } = await this.saveCourse(course);
    return { course, supabaseResult };
  },
  deleteCourse(id: string) {
    const list = this.getCourses().filter((c) => c.id !== id && toValidUuid(c.id) !== toValidUuid(id));
    setToStorage('courses', list);
    setToStorage('synced_courses', true);
    void deleteCourseFromSupabase(id);
    return list;
  },

  // Documents
  getDocuments(): ChemistryDocument[] {
    return getFromStorage<ChemistryDocument[]>('documents', INITIAL_DOCUMENTS);
  },
  async saveDocument(doc: ChemistryDocument): Promise<{ list: ChemistryDocument[]; supabaseResult: { success: boolean; error?: string } }> {
    const list = this.getDocuments();
    const idx = list.findIndex((d) => d.id === doc.id || toValidUuid(d.id) === toValidUuid(doc.id));
    if (idx >= 0) {
      list[idx] = doc;
    } else {
      list.unshift(doc);
    }
    setToStorage('documents', list);
    const supabaseResult = await syncDocumentToSupabase(doc);
    if (supabaseResult.success && !supabaseResult.isLocalFallback) {
      setToStorage('synced_documents', true);
    }
    return { list, supabaseResult };
  },
  async saveDocumentWithProbe(doc: ChemistryDocument): Promise<{ doc: ChemistryDocument; supabaseResult: { success: boolean; error?: string } }> {
    const { supabaseResult } = await this.saveDocument(doc);
    return { doc, supabaseResult };
  },
  deleteDocument(id: string) {
    const list = this.getDocuments().filter((d) => d.id !== id && toValidUuid(d.id) !== toValidUuid(id));
    setToStorage('documents', list);
    setToStorage('synced_documents', true);
    void deleteDocumentFromSupabase(id);
    return list;
  },

  // Exams
  getExams(): ExamOrAssignment[] {
    return getFromStorage<ExamOrAssignment[]>('exams', INITIAL_EXAMS);
  },
  saveExam(exam: ExamOrAssignment) {
    const list = this.getExams();
    const idx = list.findIndex((e) => e.id === exam.id || toValidUuid(e.id) === toValidUuid(exam.id));
    if (idx >= 0) {
      list[idx] = exam;
    } else {
      list.unshift(exam);
    }
    setToStorage('exams', list);
    void syncExamToSupabase(exam).then((res) => {
      if (res.success && !res.isLocalFallback) setToStorage('synced_assignments', true);
    });
    return list;
  },
  async saveExamAsync(exam: ExamOrAssignment): Promise<{ list: ExamOrAssignment[]; supabaseResult: SupabaseSyncResult }> {
    const list = this.getExams();
    const idx = list.findIndex((e) => e.id === exam.id || toValidUuid(e.id) === toValidUuid(exam.id));
    if (idx >= 0) {
      list[idx] = exam;
    } else {
      list.unshift(exam);
    }
    setToStorage('exams', list);
    const supabaseResult = await syncExamToSupabase(exam);
    if (supabaseResult.success && !supabaseResult.isLocalFallback) {
      setToStorage('synced_assignments', true);
    }
    return { list, supabaseResult };
  },
  deleteExam(id: string) {
    const list = this.getExams().filter((e) => e.id !== id && toValidUuid(e.id) !== toValidUuid(id));
    setToStorage('exams', list);
    setToStorage('synced_assignments', true);
    void deleteExamFromSupabase(id);
    return list;
  },

  // Submissions (100% live from Supabase `exam_results` — no fake local seed)
  getSubmissions(): ExamSubmission[] {
    return getFromStorage<ExamSubmission[]>('submissions', []);
  },
  saveSubmission(submission: ExamSubmission) {
    const list = this.getSubmissions();
    const targetExamUuid = toValidUuid(submission.examId);
    const targetStudentUuid = toValidUuid(submission.studentId);
    const priorAttemptsCount = list.filter(
      (s) =>
        s.id !== submission.id &&
        toValidUuid(s.id) !== toValidUuid(submission.id) &&
        (s.examId === submission.examId || toValidUuid(s.examId) === targetExamUuid) &&
        (s.studentId === submission.studentId || toValidUuid(s.studentId) === targetStudentUuid)
    ).length;
    const enriched: ExamSubmission = {
      ...submission,
      attemptNumber: submission.attemptNumber || priorAttemptsCount + 1,
    };
    const idx = list.findIndex((s) => s.id === enriched.id || toValidUuid(s.id) === toValidUuid(enriched.id));
    if (idx >= 0) {
      list[idx] = enriched;
    } else {
      list.unshift(enriched);
    }
    setToStorage('submissions', list);
    const exam = this.getExams().find((e) => e.id === enriched.examId || toValidUuid(e.id) === toValidUuid(enriched.examId));
    const currentUser = this.getCurrentUser();
    const student =
      this.getStudents().find((s) => s.id === enriched.studentId || toValidUuid(s.id) === toValidUuid(enriched.studentId)) ||
      (currentUser && currentUser.id === enriched.studentId ? currentUser : null);
    void syncSubmissionToSupabase(enriched, { exam, student }).then((res) => {
      if (res.success && !res.isLocalFallback) setToStorage('synced_exam_results', true);
    });
    return list;
  },
  async saveSubmissionAsync(submission: ExamSubmission): Promise<{ list: ExamSubmission[]; supabaseResult: SupabaseSyncResult }> {
    const list = this.getSubmissions();
    const targetExamUuid = toValidUuid(submission.examId);
    const targetStudentUuid = toValidUuid(submission.studentId);
    const priorAttemptsCount = list.filter(
      (s) =>
        s.id !== submission.id &&
        toValidUuid(s.id) !== toValidUuid(submission.id) &&
        (s.examId === submission.examId || toValidUuid(s.examId) === targetExamUuid) &&
        (s.studentId === submission.studentId || toValidUuid(s.studentId) === targetStudentUuid)
    ).length;
    const enriched: ExamSubmission = {
      ...submission,
      attemptNumber: submission.attemptNumber || priorAttemptsCount + 1,
    };
    const idx = list.findIndex((s) => s.id === enriched.id || toValidUuid(s.id) === toValidUuid(enriched.id));
    if (idx >= 0) {
      list[idx] = enriched;
    } else {
      list.unshift(enriched);
    }
    setToStorage('submissions', list);
    const exam = this.getExams().find((e) => e.id === enriched.examId || toValidUuid(e.id) === toValidUuid(enriched.examId));
    const currentUser = this.getCurrentUser();
    const student =
      this.getStudents().find((s) => s.id === enriched.studentId || toValidUuid(s.id) === toValidUuid(enriched.studentId)) ||
      (currentUser && currentUser.id === enriched.studentId ? currentUser : null);
    const supabaseResult = await syncSubmissionToSupabase(enriched, { exam, student });
    if (supabaseResult.success && !supabaseResult.isLocalFallback) {
      setToStorage('synced_exam_results', true);
    }
    return { list, supabaseResult };
  },

  // Students Directory (100% live from Supabase `profiles` — no fake local seed)
  getStudents(): UserProfile[] {
    return getFromStorage<UserProfile[]>('students', []);
  },
  async findProfileRemoteWithStatus(identifier: string): Promise<{ profile: UserProfile | null; error?: string }> {
    const { profile: found, error } = await findProfileInSupabaseWithStatus(identifier);
    if (found) {
      const list = this.getStudents();
      const idx = list.findIndex((s) => s.id === found.id || s.phone === found.phone || toValidUuid(s.id) === found.id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          ...found,
          completedLectures:
            found.completedLectures && found.completedLectures.length > 0
              ? found.completedLectures
              : list[idx].completedLectures || [],
          enrolledCourses:
            found.enrolledCourses && found.enrolledCourses.length > 0
              ? found.enrolledCourses
              : list[idx].enrolledCourses || [],
          grantedDocuments:
            found.grantedDocuments && found.grantedDocuments.length > 0
              ? found.grantedDocuments
              : list[idx].grantedDocuments || [],
        };
        setToStorage('students', list);
        return { profile: list[idx] };
      }
      list.unshift(found);
      setToStorage('students', list);
      return { profile: found };
    }
    return { profile: null, error };
  },
  async findProfileRemote(identifier: string): Promise<UserProfile | null> {
    const { profile } = await this.findProfileRemoteWithStatus(identifier);
    return profile;
  },
  saveStudent(student: UserProfile) {
    const list = this.getStudents();
    const idx = list.findIndex((s) => s.id === student.id || s.phone === student.phone || toValidUuid(s.id) === toValidUuid(student.id));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...student };
    } else {
      list.unshift(student);
    }
    setToStorage('students', list);
    void syncProfileToSupabase(student).then((res) => {
      if (res.success && !res.isLocalFallback) setToStorage('synced_profiles', true);
    });
    return list;
  },
  async saveStudentAsync(student: UserProfile): Promise<{ list: UserProfile[]; supabaseResult: SupabaseSyncResult }> {
    const supabaseResult = await syncProfileToSupabase(student);
    const list = this.getStudents();
    if (!supabaseResult.success) {
      return { list, supabaseResult };
    }
    const idx = list.findIndex((s) => s.id === student.id || s.phone === student.phone || toValidUuid(s.id) === toValidUuid(student.id));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...student };
    } else {
      list.unshift(student);
    }
    setToStorage('students', list);
    setToStorage('synced_profiles', true);
    return { list, supabaseResult };
  },
  deleteStudent(id: string) {
    const list = this.getStudents().filter((s) => s.id !== id && toValidUuid(s.id) !== toValidUuid(id));
    setToStorage('students', list);
    setToStorage('synced_profiles', true);
    void deleteProfileFromSupabase(id);
    return list;
  },

  // Payment Methods (Admin & Secretary Full CRUD)
  getPaymentMethods(): PaymentMethodItem[] {
    const initialized = getFromStorage<boolean>('payment_methods_initialized', false);
    const stored = getFromStorage<PaymentMethodItem[] | null>('payment_methods', null);
    if (stored !== null) return stored;
    if (initialized) return [];
    return INITIAL_PAYMENT_METHODS;
  },
  getActivePaymentMethods(): PaymentMethodItem[] {
    return this.getPaymentMethods().filter((m) => m.isActive);
  },
  getPaymentMethodLabel(methodKey: string): string {
    const found = this.getPaymentMethods().find((m) => m.id === methodKey || m.name === methodKey);
    if (found) return found.name;
    const lang = getCurrentLanguage();
    return getPaymentMethodFallbackLabel(methodKey, undefined, getTranslations(lang), lang);
  },
  savePaymentMethod(method: PaymentMethodItem): PaymentMethodItem[] {
    const list = [...this.getPaymentMethods()];
    const idx = list.findIndex((m) => m.id === method.id);
    if (idx >= 0) {
      list[idx] = { ...method };
    } else {
      list.push({ ...method, createdAt: method.createdAt || new Date().toISOString() });
    }
    setToStorage('payment_methods', list);
    setToStorage('payment_methods_initialized', true);
    void syncPaymentMethodsToSupabase(list);
    return list;
  },
  async savePaymentMethodAsync(
    method: PaymentMethodItem
  ): Promise<{ list: PaymentMethodItem[]; supabaseResult: SupabaseSyncResult }> {
    const list = [...this.getPaymentMethods()];
    const idx = list.findIndex((m) => m.id === method.id);
    if (idx >= 0) {
      list[idx] = { ...method };
    } else {
      list.push({ ...method, createdAt: method.createdAt || new Date().toISOString() });
    }
    setToStorage('payment_methods', list);
    setToStorage('payment_methods_initialized', true);
    const supabaseResult = await syncPaymentMethodsToSupabase(list);
    return { list, supabaseResult };
  },
  deletePaymentMethod(id: string): PaymentMethodItem[] {
    const list = this.getPaymentMethods().filter((m) => m.id !== id);
    setToStorage('payment_methods', list);
    setToStorage('payment_methods_initialized', true);
    void syncPaymentMethodsToSupabase(list);
    return list;
  },
  async deletePaymentMethodAsync(id: string): Promise<{ list: PaymentMethodItem[]; supabaseResult: SupabaseSyncResult }> {
    const list = this.getPaymentMethods().filter((m) => m.id !== id);
    setToStorage('payment_methods', list);
    setToStorage('payment_methods_initialized', true);
    const supabaseResult = await syncPaymentMethodsToSupabase(list);
    return { list, supabaseResult };
  },

  // Redeem Codes
  getRedeemCodes(): RedeemCode[] {
    return getFromStorage<RedeemCode[]>('redeem_codes', INITIAL_REDEEM_CODES);
  },
  saveRedeemCodes(newCodes: RedeemCode[]) {
    const current = this.getRedeemCodes();
    const existingSet = new Set(newCodes.map((c) => c.code.trim().toUpperCase()));
    const filteredCurrent = current.filter((c) => !existingSet.has(c.code.trim().toUpperCase()));
    const merged = [...newCodes, ...filteredCurrent];
    setToStorage('redeem_codes', merged);
    setToStorage('synced_redeem_codes', true);
    void syncRedeemCodesBulkToSupabase(newCodes);
    return merged;
  },
  deleteRedeemCode(codeStr: string) {
    const clean = codeStr.trim().toUpperCase();
    const current = this.getRedeemCodes().filter((c) => c.code.trim().toUpperCase() !== clean);
    setToStorage('redeem_codes', current);
    setToStorage('synced_redeem_codes', true);
    void deleteRedeemCodeFromSupabase(codeStr);
    return current;
  },
  async redeemCodeForUserAsync(
    codeStr: string,
    userId: string
  ): Promise<{ success: boolean; message: string; amount?: number; unlockedCourseId?: string }> {
    const t = getTranslations();
    const cleanInput = codeStr.trim().toUpperCase();
    if (!cleanInput) {
      return { success: false, message: t.lib.enterCodeFirst };
    }

    // Pull latest codes from Supabase so any newly created codes work immediately on all devices
    const remoteCodes = await fetchRedeemCodesFromSupabase();
    if (remoteCodes && remoteCodes.length > 0) {
      const localList = this.getRedeemCodes();
      const mergedMap = new Map<string, RedeemCode>();
      localList.forEach((c) => mergedMap.set(c.code.trim().toUpperCase(), c));
      remoteCodes.forEach((rc) => {
        const key = rc.code.trim().toUpperCase();
        const prev = mergedMap.get(key);
        mergedMap.set(key, {
          ...prev,
          ...rc,
          usedCount: Math.max(rc.usedCount || 0, prev?.usedCount || 0),
          maxUses: rc.maxUses || prev?.maxUses || 1,
          codeType: rc.codeType || prev?.codeType,
          courseId: rc.courseId || prev?.courseId,
          targetCourseTitle: rc.targetCourseTitle || prev?.targetCourseTitle,
        });
      });
      setToStorage('redeem_codes', Array.from(mergedMap.values()));
    }

    const list = this.getRedeemCodes();
    const target = list.find((c) => c.code.trim().toUpperCase() === cleanInput);
    if (!target) {
      return { success: false, message: t.lib.invalidCode };
    }
    if (target.usedCount >= target.maxUses) {
      return { success: false, message: t.lib.codeLimitReached };
    }

    target.usedCount += 1;
    setToStorage('redeem_codes', list);
    await syncRedeemCodeToSupabase(target, userId);

    const students = this.getStudents();
    let userRecord =
      students.find(
        (s) => s.id === userId || toValidUuid(s.id) === toValidUuid(userId)
      ) || null;
    const currentUser = this.getCurrentUser();
    if (!userRecord && currentUser && (currentUser.id === userId || toValidUuid(currentUser.id) === toValidUuid(userId))) {
      userRecord = currentUser;
    }

    if (userRecord) {
      if (target.courseId || target.codeType === 'course') {
        const enrolled = userRecord.enrolledCourses || [];
        const cid = target.courseId || '';
        const nextEnrolled = cid && !enrolled.includes(cid) ? [...enrolled, cid] : enrolled;
        const updatedUser: UserProfile = {
          ...userRecord,
          enrolledCourses: nextEnrolled,
        };
        await this.saveStudentAsync(updatedUser);
        if (currentUser && (currentUser.id === updatedUser.id || toValidUuid(currentUser.id) === toValidUuid(updatedUser.id))) {
          this.setCurrentUser(updatedUser);
        }
        return {
          success: true,
          message: formatTemplate(t.lib.courseCodeActivated, {
            title: target.targetCourseTitle || t.lib.lessonExplanationDefault,
          }),
          unlockedCourseId: cid,
        };
      }

      const nextBalance = Math.round(((Number(userRecord.balance) || 0) + (Number(target.amount) || 0)) * 100) / 100;
      const updatedUser: UserProfile = {
        ...userRecord,
        balance: nextBalance,
      };
      await this.saveStudentAsync(updatedUser);
      if (currentUser && (currentUser.id === updatedUser.id || toValidUuid(currentUser.id) === toValidUuid(updatedUser.id))) {
        this.setCurrentUser(updatedUser);
      }

      return {
        success: true,
        message: formatTemplate(t.lib.walletToppedUp, {
          amount: target.amount,
          balance: updatedUser.balance,
        }),
        amount: target.amount,
      };
    }

    return {
      success: true,
      message: t.lib.codeActivated,
    };
  },
  redeemCodeForUser(codeStr: string, userId: string): { success: boolean; message: string; amount?: number; unlockedCourseId?: string } {
    const t = getTranslations();
    const list = this.getRedeemCodes();
    const target = list.find((c) => c.code.trim().toUpperCase() === codeStr.trim().toUpperCase());
    if (!target) {
      return { success: false, message: t.lib.invalidCode };
    }
    if (target.usedCount >= target.maxUses) {
      return { success: false, message: t.lib.codeLimitReached };
    }

    target.usedCount += 1;
    setToStorage('redeem_codes', list);
    void syncRedeemCodeToSupabase(target, userId);

    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      if (target.courseId || target.codeType === 'course') {
        const enrolled = currentUser.enrolledCourses || [];
        const cid = target.courseId || '';
        if (cid && !enrolled.includes(cid)) {
          currentUser.enrolledCourses = [...enrolled, cid];
        }
        this.setCurrentUser(currentUser);
        this.saveStudent(currentUser);
        return {
          success: true,
          message: formatTemplate(t.lib.courseCodeActivated, {
            title: target.targetCourseTitle || t.lib.lessonExplanationDefault,
          }),
          unlockedCourseId: cid,
        };
      }

      currentUser.balance = (currentUser.balance || 0) + target.amount;
      this.setCurrentUser(currentUser);
      this.saveStudent(currentUser);

      return {
        success: true,
        message: formatTemplate(t.lib.walletToppedUp, {
          amount: target.amount,
          balance: currentUser.balance,
        }),
        amount: target.amount,
      };
    }

    return {
      success: true,
      message: t.lib.codeActivated,
    };
  },

  enrollUserInCourse(courseId: string, userId: string): { success: boolean; message: string } {
    const t = getTranslations();
    const courses = this.getCourses();
    const course = courses.find((c) => c.id === courseId);
    if (!course) {
      return { success: false, message: t.lib.courseNotFound };
    }

    const currentUser = this.getCurrentUser();
    if (!currentUser || currentUser.id !== userId) {
      return { success: false, message: t.lib.signInStudentFirst };
    }

    const enrolled = currentUser.enrolledCourses || [];
    if (enrolled.includes(courseId)) {
      return { success: true, message: t.lib.alreadyEnrolled };
    }

    if (course.isFree) {
      currentUser.enrolledCourses = [...enrolled, courseId];
      this.setCurrentUser(currentUser);
      this.saveStudent(currentUser);
      return { success: true, message: t.lib.freeUnlocked };
    }

    if ((currentUser.balance || 0) < course.price) {
      return {
        success: false,
        message: formatTemplate(t.lib.insufficientBalance, {
          balance: currentUser.balance || 0,
          price: course.price,
        }),
      };
    }

    // Deduct price and enroll
    currentUser.balance = (currentUser.balance || 0) - course.price;
    currentUser.enrolledCourses = [...enrolled, courseId];
    this.setCurrentUser(currentUser);
    this.saveStudent(currentUser);

    return {
      success: true,
      message: formatTemplate(t.lib.enrolledSuccess, {
        title: course.title,
        price: course.price,
        balance: currentUser.balance,
      }),
    };
  },

  async enrollUserInCourseAsync(
    courseId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    const t = getTranslations();
    const courses = this.getCourses();
    const course = courses.find((c) => c.id === courseId);
    if (!course) {
      return { success: false, message: t.lib.courseNotFound };
    }

    const students = this.getStudents();
    const currentUser = this.getCurrentUser();
    const targetUser =
      (currentUser && (currentUser.id === userId || toValidUuid(currentUser.id) === toValidUuid(userId))
        ? currentUser
        : students.find((s) => s.id === userId || toValidUuid(s.id) === toValidUuid(userId))) || null;

    if (!targetUser) {
      return { success: false, message: t.lib.signInStudentFirst };
    }

    const enrolled = targetUser.enrolledCourses || [];
    if (enrolled.includes(courseId)) {
      return { success: true, message: t.lib.alreadyEnrolled };
    }

    if (course.isFree) {
      const updatedUser: UserProfile = {
        ...targetUser,
        enrolledCourses: [...enrolled, courseId],
      };
      const { supabaseResult } = await this.saveStudentAsync(updatedUser);
      if (!supabaseResult.success) {
        return {
          success: false,
          message: supabaseResult.error || t.lib.enrollmentDbSaveError,
        };
      }
      if (currentUser && (currentUser.id === updatedUser.id || toValidUuid(currentUser.id) === toValidUuid(updatedUser.id))) {
        this.setCurrentUser(updatedUser);
      }
      return { success: true, message: t.lib.freeUnlocked };
    }

    if ((targetUser.balance || 0) < course.price) {
      return {
        success: false,
        message: formatTemplate(t.lib.insufficientBalance, {
          balance: targetUser.balance || 0,
          price: course.price,
        }),
      };
    }

    const nextBalance = Math.round(((targetUser.balance || 0) - course.price) * 100) / 100;
    const updatedUser: UserProfile = {
      ...targetUser,
      balance: nextBalance,
      enrolledCourses: [...enrolled, courseId],
    };
    const { supabaseResult } = await this.saveStudentAsync(updatedUser);
    if (!supabaseResult.success) {
      return {
        success: false,
        message: supabaseResult.error || t.lib.enrollmentDbSaveError,
      };
    }
    if (currentUser && (currentUser.id === updatedUser.id || toValidUuid(currentUser.id) === toValidUuid(updatedUser.id))) {
      this.setCurrentUser(updatedUser);
    }

    return {
      success: true,
      message: formatTemplate(t.lib.enrolledSuccess, {
        title: course.title,
        price: course.price,
        balance: updatedUser.balance,
      }),
    };
  },

  // Manual Balance & Gift Content Access Helpers (Authoritative Supabase sync)
  async updateStudentBalanceAsync(
    studentId: string,
    newBalance: number
  ): Promise<{ student: UserProfile | null; supabaseResult: SupabaseSyncResult }> {
    const safeBalance = Math.max(0, Math.round(Number(newBalance) * 100) / 100);
    const students = this.getStudents();
    const target = students.find((s) => s.id === studentId || toValidUuid(s.id) === toValidUuid(studentId));
    if (!target) {
      return { student: null, supabaseResult: { success: false, error: getTranslations().lib.studentNotFound } };
    }
    const updated: UserProfile = { ...target, balance: safeBalance };
    const { supabaseResult } = await this.saveStudentAsync(updated);
    const currentUser = this.getCurrentUser();
    if (
      currentUser &&
      (currentUser.id === updated.id ||
        toValidUuid(currentUser.id) === toValidUuid(updated.id) ||
        currentUser.phone === updated.phone)
    ) {
      this.setCurrentUser({ ...currentUser, balance: safeBalance });
    }
    return { student: updated, supabaseResult };
  },

  async grantContentToStudentAsync(
    studentId: string,
    courseIds: string[],
    documentIds: string[] = []
  ): Promise<{ student: UserProfile | null; supabaseResult: SupabaseSyncResult }> {
    const students = this.getStudents();
    const target = students.find((s) => s.id === studentId || toValidUuid(s.id) === toValidUuid(studentId));
    if (!target) {
      return { student: null, supabaseResult: { success: false, error: getTranslations().lib.studentNotFound } };
    }
    const mergedCourses = Array.from(new Set([...(target.enrolledCourses || []), ...courseIds]));
    const mergedDocs = Array.from(new Set([...(target.grantedDocuments || []), ...documentIds]));
    const updated: UserProfile = {
      ...target,
      enrolledCourses: mergedCourses,
      grantedDocuments: mergedDocs,
    };
    const { supabaseResult } = await this.saveStudentAsync(updated);
    const currentUser = this.getCurrentUser();
    if (
      currentUser &&
      (currentUser.id === updated.id ||
        toValidUuid(currentUser.id) === toValidUuid(updated.id) ||
        currentUser.phone === updated.phone)
    ) {
      this.setCurrentUser({
        ...currentUser,
        enrolledCourses: mergedCourses,
        grantedDocuments: mergedDocs,
      });
    }
    return { student: updated, supabaseResult };
  },

  // Payment Requests
  getPayments(): PaymentRequest[] {
    const synced = getFromStorage<boolean>('synced_payments', false);
    return getFromStorage<PaymentRequest[]>('payments', synced ? [] : INITIAL_PAYMENTS);
  },
  addPaymentRequest(req: PaymentRequest) {
    const list = this.getPayments();
    list.unshift(req);
    setToStorage('payments', list);
    void syncPaymentToSupabase(req);
    return list;
  },
  async addPaymentRequestAsync(
    req: PaymentRequest
  ): Promise<{ list: PaymentRequest[]; supabaseResult: SupabaseSyncResult }> {
    const supabaseResult = await syncPaymentToSupabase(req);
    const list = this.getPayments().filter((p) => p.id !== req.id && toValidUuid(p.id) !== toValidUuid(req.id));
    list.unshift(req);
    setToStorage('payments', list);
    if (supabaseResult.success) {
      setToStorage('synced_payments', true);
    }
    return { list, supabaseResult };
  },
  reviewPayment(id: string, status: 'approved' | 'rejected', notes?: string) {
    const list = this.getPayments();
    const req = list.find((p) => p.id === id || toValidUuid(p.id) === toValidUuid(id));
    if (!req) return list;

    const t = getTranslations();
    req.status = status;
    req.notes = notes || (status === 'approved' ? t.lib.paymentApprovedNote : t.lib.paymentRejectedNote);
    req.reviewedAt = new Date().toISOString();

    if (status === 'approved') {
      // Credit student balance
      const students = this.getStudents();
      const st = students.find(
        (s) =>
          s.id === req.studentId ||
          toValidUuid(s.id) === toValidUuid(req.studentId) ||
          (req.studentPhone && s.phone === req.studentPhone) ||
          (req.studentCode && s.studentCode === req.studentCode)
      );
      if (st) {
        st.balance = (st.balance || 0) + req.amount;
        this.saveStudent(st);
      }
      const currentUser = this.getCurrentUser();
      if (
        currentUser &&
        (currentUser.id === req.studentId ||
          toValidUuid(currentUser.id) === toValidUuid(req.studentId) ||
          (req.studentPhone && currentUser.phone === req.studentPhone))
      ) {
        currentUser.balance = (currentUser.balance || 0) + req.amount;
        this.setCurrentUser(currentUser);
      }
    }

    setToStorage('payments', list);
    void syncPaymentToSupabase(req);
    return list;
  },
  async reviewPaymentAsync(
    id: string,
    status: 'approved' | 'rejected',
    notes?: string
  ): Promise<{ list: PaymentRequest[]; supabaseResult: SupabaseSyncResult }> {
    const t = getTranslations();
    const list = this.getPayments();
    const req = list.find((p) => p.id === id || toValidUuid(p.id) === toValidUuid(id));
    if (!req) {
      return { list, supabaseResult: { success: false, error: t.lib.paymentReqNotFound } };
    }
    if (req.status === 'approved' && status === 'approved') {
      return { list, supabaseResult: { success: true } };
    }

    req.status = status;
    req.notes = notes || (status === 'approved' ? t.lib.paymentApprovedNote : t.lib.paymentRejectedNote);
    req.reviewedAt = new Date().toISOString();

    if (status === 'approved') {
      const students = this.getStudents();
      let st = students.find(
        (s) =>
          s.id === req.studentId ||
          toValidUuid(s.id) === toValidUuid(req.studentId) ||
          (req.studentPhone && s.phone === req.studentPhone) ||
          (req.studentCode && s.studentCode === req.studentCode)
      );
      if (!st && (req.studentPhone || req.studentCode || req.studentId)) {
        st = (await this.findProfileRemote(req.studentPhone || req.studentCode || req.studentId)) || undefined;
      }
      if (st) {
        const updatedStudent: UserProfile = {
          ...st,
          balance: (st.balance || 0) + Number(req.amount || 0),
        };
        await this.saveStudentAsync(updatedStudent);
      }
      const currentUser = this.getCurrentUser();
      if (
        currentUser &&
        (currentUser.id === req.studentId ||
          toValidUuid(currentUser.id) === toValidUuid(req.studentId) ||
          (req.studentPhone && currentUser.phone === req.studentPhone))
      ) {
        currentUser.balance = (currentUser.balance || 0) + Number(req.amount || 0);
        this.setCurrentUser(currentUser);
      }
    }

    setToStorage('payments', list);
    const supabaseResult = await syncPaymentToSupabase(req);
    return { list, supabaseResult };
  },
  deletePayment(id: string) {
    const list = this.getPayments().filter((p) => p.id !== id && toValidUuid(p.id) !== toValidUuid(id));
    setToStorage('payments', list);
    setToStorage('synced_payments', true);
    void deletePaymentFromSupabase(id);
    return list;
  },

  // Notifications (Text + Voice Messages)
  getNotifications(): PlatformNotification[] {
    return getFromStorage<PlatformNotification[]>('notifications', INITIAL_NOTIFICATIONS);
  },
  addNotification(notif: PlatformNotification) {
    const list = this.getNotifications();
    list.unshift(notif);
    setToStorage('notifications', list);
    void syncNotificationToSupabase(notif);
    return list;
  },
  async addNotificationAsync(
    notif: PlatformNotification
  ): Promise<{ list: PlatformNotification[]; supabaseResult: SupabaseSyncResult }> {
    const list = this.getNotifications();
    list.unshift(notif);
    setToStorage('notifications', list);
    const supabaseResult = await syncNotificationToSupabase(notif);
    return { list, supabaseResult };
  },
  markNotificationsAsRead() {
    const list = this.getNotifications().map((n) => ({ ...n, isRead: true }));
    setToStorage('notifications', list);
    return list;
  },
  deleteNotification(id: string) {
    const list = this.getNotifications().filter((n) => n.id !== id);
    setToStorage('notifications', list);
    void deleteNotificationFromSupabase(id);
    return list;
  },

  // Honor Board (Synced with Supabase)
  getHonorStudents(): HonorStudent[] {
    return getFromStorage<HonorStudent[]>('honor_students', INITIAL_HONOR_STUDENTS);
  },
  saveHonorStudent(item: HonorStudent) {
    const list = this.getHonorStudents();
    const idx = list.findIndex((h) => h.id === item.id || toValidUuid(h.id) === toValidUuid(item.id));
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.push(item);
    }
    list.sort((a, b) => a.rank - b.rank);
    setToStorage('honor_students', list);
    setToStorage('synced_honor', true);
    void syncHonorStudentToSupabase(item);
    return list;
  },
  async saveHonorStudentAsync(item: HonorStudent): Promise<{ list: HonorStudent[]; supabaseResult: SupabaseSyncResult }> {
    const list = this.getHonorStudents();
    const idx = list.findIndex((h) => h.id === item.id || toValidUuid(h.id) === toValidUuid(item.id));
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.push(item);
    }
    list.sort((a, b) => a.rank - b.rank);
    setToStorage('honor_students', list);
    setToStorage('synced_honor', true);
    const supabaseResult = await syncHonorStudentToSupabase(item);
    return { list, supabaseResult };
  },
  deleteHonorStudent(id: string) {
    const list = this.getHonorStudents().filter((h) => h.id !== id && toValidUuid(h.id) !== toValidUuid(id));
    setToStorage('honor_students', list);
    setToStorage('synced_honor', true);
    void deleteHonorStudentFromSupabase(id);
    return list;
  },

  // Private Support & Q&A Threads (Scoped per student/visitor, synced with Supabase)
  getSupportGuestId(): string {
    try {
      const existing = localStorage.getItem('amr_support_guest_owner_id');
      if (existing && existing.trim()) return existing.trim();
      const created = generateUuid();
      localStorage.setItem('amr_support_guest_owner_id', created);
      return created;
    } catch {
      return 'guest-local';
    }
  },
  getSupportOwnerKey(user?: UserProfile | null): string {
    const targetUser = user !== undefined ? user : this.getCurrentUser();
    if (targetUser && targetUser.id) {
      return `user:${toValidUuid(targetUser.id)}`;
    }
    return `guest:${this.getSupportGuestId()}`;
  },
  getSupportThreads(): SupportThread[] {
    return getFromStorage<SupportThread[]>('support_threads', []);
  },
  getMySupportThreads(user?: UserProfile | null): SupportThread[] {
    const targetUser = user !== undefined ? user : this.getCurrentUser();
    const myKey = this.getSupportOwnerKey(targetUser);
    const deviceGuestKey = `guest:${this.getSupportGuestId()}`;
    const targetStudentUuid = targetUser?.id ? toValidUuid(targetUser.id) : '';
    return this.getSupportThreads().filter((t) => {
      if (!t) return false;
      if (t.ownerKey === myKey) return true;
      if (targetUser?.id) {
        if (t.studentId && (t.studentId === targetUser.id || toValidUuid(t.studentId) === targetStudentUuid)) {
          return true;
        }
        // Keep threads sent by the same person on this browser right before signing in
        if (t.ownerKey === deviceGuestKey && (!t.studentId || toValidUuid(t.studentId) === targetStudentUuid)) {
          return true;
        }
      }
      return false;
    });
  },
  async saveSupportThreadAsync(
    thread: SupportThread
  ): Promise<{ list: SupportThread[]; supabaseResult: SupabaseSyncResult }> {
    const supabaseResult = await syncSupportThreadToSupabase(thread);
    const list = this.getSupportThreads();
    const idx = list.findIndex((t) => t.id === thread.id || toValidUuid(t.id) === toValidUuid(thread.id));
    if (idx >= 0) {
      list[idx] = thread;
    } else {
      list.unshift(thread);
    }
    list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    setToStorage('support_threads', list);
    setToStorage('synced_support_threads', true);
    return { list, supabaseResult };
  },
  async appendSupportMessageAsync(
    threadId: string,
    message: SupportMessage,
    nextStatus?: 'open' | 'answered'
  ): Promise<{ thread: SupportThread | null; list: SupportThread[]; supabaseResult: SupabaseSyncResult }> {
    const list = this.getSupportThreads();
    const existing = list.find((t) => t.id === threadId || toValidUuid(t.id) === toValidUuid(threadId));
    if (!existing) {
      return {
        thread: null,
        list,
        supabaseResult: { success: false, error: 'Conversation not found or has been deleted.' },
      };
    }
    const updatedThread: SupportThread = {
      ...existing,
      status: nextStatus || (message.senderRole === 'admin' ? 'answered' : 'open'),
      messages: [...(existing.messages || []), message],
      updatedAt: message.createdAt || new Date().toISOString(),
    };
    const res = await this.saveSupportThreadAsync(updatedThread);
    return { thread: updatedThread, ...res };
  },
  async deleteSupportThreadAsync(
    threadId: string
  ): Promise<{ list: SupportThread[]; supabaseResult: SupabaseSyncResult }> {
    const current = this.getSupportThreads();
    const target = current.find((t) => t.id === threadId || toValidUuid(t.id) === toValidUuid(threadId));
    const supabaseResult = await deleteSupportThreadFromSupabase(target || threadId);
    const nextList = current.filter((t) => t.id !== threadId && toValidUuid(t.id) !== toValidUuid(threadId));
    setToStorage('support_threads', nextList);
    setToStorage('synced_support_threads', true);
    return { list: nextList, supabaseResult };
  },

  // Secretaries
  getSecretaries(): SecretaryMember[] {
    return getFromStorage<SecretaryMember[]>('secretaries', INITIAL_SECRETARIES);
  },
  saveSecretary(sec: SecretaryMember) {
    const list = this.getSecretaries();
    const idx = list.findIndex((s) => s.id === sec.id || s.phone === sec.phone);
    if (idx >= 0) {
      list[idx] = sec;
    } else {
      list.push(sec);
    }
    setToStorage('secretaries', list);
    void syncSecretariesToSupabase(list);
    return list;
  },
  deleteSecretary(id: string) {
    const list = this.getSecretaries().filter((s) => s.id !== id);
    setToStorage('secretaries', list);
    void syncSecretariesToSupabase(list);
    return list;
  },

  // Exam & Assignment Progress (for Resume Later & Post-Click Countdown Synced with Supabase)
  getExamProgress(examId: string, studentId: string): ExamProgress | null {
    if (!examId || !studentId) return null;
    const all = getFromStorage<Record<string, ExamProgress>>('exam_progress', {});
    const exactKey = `${examId}_${studentId}`;
    if (all[exactKey]) return all[exactKey];
    const targetExamUuid = toValidUuid(examId);
    const targetStudentUuid = toValidUuid(studentId);
    const matched = Object.values(all).find(
      (p) =>
        p &&
        (p.examId === examId || toValidUuid(p.examId) === targetExamUuid) &&
        (p.studentId === studentId || toValidUuid(p.studentId) === targetStudentUuid)
    );
    return matched || null;
  },
  saveExamProgress(progress: ExamProgress) {
    const all = getFromStorage<Record<string, ExamProgress>>('exam_progress', {});
    const key = `${progress.examId}_${progress.studentId}`;
    all[key] = progress;
    setToStorage('exam_progress', all);
    void syncExamProgressToSupabase(progress);
    return progress;
  },
  async saveExamProgressAsync(progress: ExamProgress): Promise<SupabaseSyncResult> {
    const all = getFromStorage<Record<string, ExamProgress>>('exam_progress', {});
    const key = `${progress.examId}_${progress.studentId}`;
    all[key] = progress;
    setToStorage('exam_progress', all);
    return await syncExamProgressToSupabase(progress);
  },
  async fetchExamProgressRemote(examId: string, studentId: string): Promise<ExamProgress | null> {
    const local = this.getExamProgress(examId, studentId);
    const remote = await fetchExamProgressFromSupabase(examId, studentId);
    if (remote && remote.startedAt) {
      const localTime = local?.lastUpdated ? new Date(local.lastUpdated).getTime() : 0;
      const remoteTime = remote.lastUpdated ? new Date(remote.lastUpdated).getTime() : 0;
      // Always prefer earliest/existing startedAt + latest answers
      const merged: ExamProgress = {
        ...remote,
        examId: local?.examId || remote.examId || examId,
        studentId: local?.studentId || remote.studentId || studentId,
        startedAt: local?.startedAt && new Date(local.startedAt).getTime() < new Date(remote.startedAt).getTime()
          ? local.startedAt
          : remote.startedAt,
        expiresAt: local?.expiresAt && remote.expiresAt
          ? (new Date(local.expiresAt).getTime() <= new Date(remote.expiresAt).getTime() ? local.expiresAt : remote.expiresAt)
          : remote.expiresAt || local?.expiresAt,
        answers: remoteTime >= localTime ? remote.answers : local?.answers || remote.answers,
        visitedQuestionIndices:
          remoteTime >= localTime ? remote.visitedQuestionIndices : local?.visitedQuestionIndices || remote.visitedQuestionIndices,
      };
      const all = getFromStorage<Record<string, ExamProgress>>('exam_progress', {});
      all[`${examId}_${studentId}`] = merged;
      setToStorage('exam_progress', all);
      return merged;
    }
    return local;
  },
  clearExamProgress(examId: string, studentId: string) {
    const all = getFromStorage<Record<string, ExamProgress>>('exam_progress', {});
    const targetExamUuid = toValidUuid(examId);
    const targetStudentUuid = toValidUuid(studentId);
    Object.keys(all).forEach((k) => {
      const item = all[k];
      if (
        k === `${examId}_${studentId}` ||
        (item &&
          (item.examId === examId || toValidUuid(item.examId) === targetExamUuid) &&
          (item.studentId === studentId || toValidUuid(item.studentId) === targetStudentUuid))
      ) {
        delete all[k];
      }
    });
    setToStorage('exam_progress', all);
    void deleteExamProgressFromSupabase(examId, studentId);
  },

  // Question Bank Practice Progress per student
  getQuestionBankProgress(studentId: string): Record<string, QuestionBankAttemptEntry> {
    if (!studentId) return {};
    return getFromStorage<Record<string, QuestionBankAttemptEntry>>(`qb_progress_${studentId}`, {});
  },
  saveQuestionBankProgress(studentId: string, attempts: Record<string, QuestionBankAttemptEntry>) {
    if (!studentId) return;
    setToStorage(`qb_progress_${studentId}`, attempts);
    void syncQuestionBankProgressToSupabase(studentId, attempts);
  },
  async fetchQuestionBankProgressRemote(studentId: string): Promise<Record<string, QuestionBankAttemptEntry>> {
    const local = this.getQuestionBankProgress(studentId);
    const remote = await fetchQuestionBankProgressFromSupabase(studentId);
    if (remote) {
      const merged = { ...remote, ...local };
      setToStorage(`qb_progress_${studentId}`, merged);
      return merged;
    }
    return local;
  },

  // Authoritative Real-time Sync with Supabase across all 5 core tables + auxiliary tables
  async syncWithSupabase() {
    try {
      const [
        remoteCourses,
        remoteProfiles,
        remoteDocs,
        remoteExams,
        remoteSubmissions,
        remotePayments,
        remoteCodes,
        remoteSettings,
        remotePaymentMethods,
        remoteNotifications,
        remoteSecretaries,
        remoteHonorStudents,
        remoteSupportThreads,
        remoteFormsMap,
      ] = await Promise.all([
        fetchCoursesFromSupabase(),
        fetchProfilesFromSupabase(),
        fetchDocumentsFromSupabase(),
        fetchExamsFromSupabase(),
        fetchSubmissionsFromSupabase(),
        fetchPaymentsFromSupabase(),
        fetchRedeemCodesFromSupabase(),
        fetchSettingsFromSupabase(),
        fetchPaymentMethodsFromSupabase(),
        fetchNotificationsFromSupabase(),
        fetchSecretariesFromSupabase(),
        fetchHonorStudentsFromSupabase(),
        fetchSupportThreadsFromSupabase(),
        fetchAllAssessmentFormsMap(),
      ]);

      // 1. Courses (authoritative from Supabase; preserves local UI extras for matching IDs)
      if (remoteCourses !== null) {
        if (remoteCourses.length > 0) {
          const localCourses = this.getCourses();
          const syncedCourses = remoteCourses.map((rc) => {
            const existing = localCourses.find((lc) => lc.id === rc.id || toValidUuid(lc.id) === rc.id);
            return existing
              ? {
                  ...existing,
                  ...rc,
                  chapter: rc.chapter !== 'General Curriculum' && rc.chapter !== 'المنهج العام' ? rc.chapter : existing.chapter || rc.chapter,
                  coverUrl: rc.coverUrl || existing.coverUrl,
                  instructions: rc.instructions || existing.instructions,
                  scheduleText: rc.scheduleText || existing.scheduleText,
                  lessons: Array.isArray(rc.lessons) ? rc.lessons : existing.lessons,
                  draftLessons: Array.isArray(rc.draftLessons) ? rc.draftLessons : existing.draftLessons,
                  viewsCount: existing.viewsCount || rc.viewsCount,
                  attachedPdfUrl: rc.attachedPdfUrl || existing.attachedPdfUrl,
                  attachedExamId: rc.attachedExamId || existing.attachedExamId,
                }
              : rc;
          });
          setToStorage('courses', syncedCourses);
          setToStorage('synced_courses', true);
        } else if (getFromStorage<boolean>('synced_courses', false)) {
          setToStorage('courses', []);
        }
      }

      // 2. Profiles / Students (100% authoritative from Supabase + keeps currentUser synced)
      let authoritativeStudents = this.getStudents();
      if (remoteProfiles !== null) {
        if (remoteProfiles.length > 0) {
          const localStudents = this.getStudents();
          const syncedProfiles = remoteProfiles.map((rp) => {
            const existing = localStudents.find(
              (ls) =>
                ls.id === rp.id ||
                toValidUuid(ls.id) === rp.id ||
                ls.phone === rp.phone ||
                ls.studentCode === rp.studentCode
            );
            return {
              ...existing,
              ...rp,
              parentPhone: rp.parentPhone || existing?.parentPhone || '',
              completedLectures:
                rp.completedLectures && rp.completedLectures.length > 0
                  ? rp.completedLectures
                  : existing?.completedLectures || [],
              enrolledCourses:
                rp.enrolledCourses && rp.enrolledCourses.length > 0
                  ? rp.enrolledCourses
                  : existing?.enrolledCourses || [],
              grantedDocuments:
                rp.grantedDocuments && rp.grantedDocuments.length > 0
                  ? rp.grantedDocuments
                  : existing?.grantedDocuments || [],
            };
          });
          authoritativeStudents = syncedProfiles;
          setToStorage('students', syncedProfiles);
          setToStorage('synced_profiles', true);

          // Also refresh logged-in currentUser from Supabase so wallet balance & profile stay live across devices
          const currentUser = this.getCurrentUser();
          if (currentUser && currentUser.role === 'student') {
            const freshSelf = syncedProfiles.find(
              (sp) =>
                sp.id === currentUser.id ||
                sp.id === toValidUuid(currentUser.id) ||
                sp.phone === currentUser.phone ||
                sp.studentCode === currentUser.studentCode
            );
            if (freshSelf) {
              setToStorage('current_user', freshSelf);
            } else {
              const verifiedSelf = await findProfileInSupabase(
                currentUser.phone || currentUser.studentCode || currentUser.email || currentUser.id
              );
              if (verifiedSelf) {
                setToStorage('current_user', verifiedSelf);
              } else {
                // Local-only or deleted student session — clear so UI never persists an unsaved student
                setToStorage('current_user', null);
              }
            }
          }
        } else {
          // Live Supabase profiles table is empty: authoritative empty state
          authoritativeStudents = [];
          setToStorage('students', []);
          setToStorage('synced_profiles', true);
          const currentUser = this.getCurrentUser();
          if (currentUser && currentUser.role === 'student') {
            setToStorage('current_user', null);
          }
        }
      }

      // 3. Documents (authoritative from Supabase; preserves local UI extras for matching IDs)
      if (remoteDocs !== null) {
        if (remoteDocs.length > 0) {
          const localDocs = this.getDocuments();
          const syncedDocs = remoteDocs.map((rd) => {
            const existing = localDocs.find((ld) => ld.id === rd.id || toValidUuid(ld.id) === rd.id);
            return existing
              ? {
                  ...rd,
                  docType: existing.docType || rd.docType,
                  fileSize: existing.fileSize || rd.fileSize,
                  pagesCount: existing.pagesCount || rd.pagesCount,
                  downloadsCount: existing.downloadsCount || rd.downloadsCount,
                }
              : rd;
          });
          setToStorage('documents', syncedDocs);
          setToStorage('synced_documents', true);
        } else if (getFromStorage<boolean>('synced_documents', false)) {
          setToStorage('documents', []);
        }
      }

      // 4. Assignments / Exams / Sheets (authoritative from Supabase `assignments` table + exam_meta)
      let authoritativeExams = this.getExams();
      if (remoteExams !== null) {
        if (remoteExams.length > 0) {
          const localExams = this.getExams();
          const syncedExams = remoteExams.map((re) => {
            const existing = localExams.find((le) => le.id === re.id || toValidUuid(le.id) === re.id);
            const remoteForms =
              remoteFormsMap.get(re.id) || remoteFormsMap.get(toValidUuid(re.id)) || undefined;
            const resolvedForms =
              remoteForms && remoteForms.length > 0 ? remoteForms : existing?.forms;
            const merged = existing
              ? {
                  ...re,
                  durationMinutes: re.durationMinutes ?? existing.durationMinutes,
                  durationUnit: re.durationUnit || existing.durationUnit,
                  resumeWindowMinutes: re.resumeWindowMinutes ?? existing.resumeWindowMinutes,
                  resumeWindowUnit: re.resumeWindowUnit || existing.resumeWindowUnit,
                  maxAttempts: re.maxAttempts ?? existing.maxAttempts,
                  shuffleForStudents: re.shuffleForStudents ?? existing.shuffleForStudents,
                  totalPoints: re.totalPoints || existing.totalPoints,
                  deadline: re.deadline || existing.deadline,
                  lessonTitle: re.lessonTitle || existing.lessonTitle,
                  lessonNumber: re.lessonNumber ?? existing.lessonNumber,
                  maxCompletionHours: re.maxCompletionHours ?? existing.maxCompletionHours,
                  chapter: re.chapter || existing.chapter,
                  isCustomForStudentId: re.isCustomForStudentId || existing.isCustomForStudentId,
                  forms: resolvedForms,
                }
              : {
                  ...re,
                  forms: resolvedForms,
                };
            return merged;
          });
          authoritativeExams = syncedExams;
          setToStorage('exams', syncedExams);
          setToStorage('synced_assignments', true);
        } else if (getFromStorage<boolean>('synced_assignments', false)) {
          authoritativeExams = [];
          setToStorage('exams', []);
        }
      }

      // 4B. Active Student Exam Progress & Timer State from Supabase
      const activeUserForProgress = this.getCurrentUser();
      if (activeUserForProgress && activeUserForProgress.id) {
        const remoteProgressList = await fetchStudentExamProgressListFromSupabase(activeUserForProgress.id);
        if (remoteProgressList && remoteProgressList.length > 0) {
          const allProgress = getFromStorage<Record<string, ExamProgress>>('exam_progress', {});
          remoteProgressList.forEach((rp) => {
            const matchedExam = authoritativeExams.find(
              (ex) => ex.id === rp.examId || toValidUuid(ex.id) === toValidUuid(rp.examId)
            );
            const canonicalExamId = matchedExam?.id || rp.examId;
            const key = `${canonicalExamId}_${activeUserForProgress.id}`;
            const localItem = allProgress[key];
            const localTs = localItem?.lastUpdated ? new Date(localItem.lastUpdated).getTime() : 0;
            const remoteTs = rp.lastUpdated ? new Date(rp.lastUpdated).getTime() : 0;
            if (!localItem || remoteTs >= localTs) {
              allProgress[key] = {
                ...rp,
                examId: canonicalExamId,
                studentId: activeUserForProgress.id,
              };
            }
          });
          setToStorage('exam_progress', allProgress);
        }
      }

      // 5. Exam Results / Submissions (100% authoritative from Supabase `exam_results` table)
      if (remoteSubmissions !== null) {
        if (remoteSubmissions.length > 0) {
          const localSubs = this.getSubmissions();
          const syncedSubs = remoteSubmissions.map((rs) => {
            const existing = localSubs.find((ls) => ls.id === rs.id || toValidUuid(ls.id) === rs.id);
            const matchedStudent = authoritativeStudents.find(
              (st) => st.id === rs.studentId || toValidUuid(st.id) === rs.studentId
            );
            const matchedExam = authoritativeExams.find(
              (ex) => ex.id === rs.examId || toValidUuid(ex.id) === rs.examId
            );
            return {
              ...existing,
              ...rs,
              studentName:
                rs.studentName && rs.studentName !== 'English Student' && rs.studentName !== 'طالب كيمياء'
                  ? rs.studentName
                  : matchedStudent?.fullName || existing?.studentName || 'English Student',
              studentCode:
                rs.studentCode && rs.studentCode !== 'ENG' && rs.studentCode !== 'AMR'
                  ? rs.studentCode
                  : matchedStudent?.studentCode || existing?.studentCode || 'ENG',
              totalPoints: rs.totalPoints || matchedExam?.totalPoints || existing?.totalPoints || 0,
              answers: Object.keys(rs.answers || {}).length > 0 ? rs.answers : existing?.answers || {},
              questionGrades: rs.questionGrades ?? existing?.questionGrades,
              autoZeroedQuestions: rs.autoZeroedQuestions ?? existing?.autoZeroedQuestions,
              startedAt: rs.startedAt ?? existing?.startedAt,
              attemptNumber: rs.attemptNumber ?? existing?.attemptNumber,
              solvedCount: rs.solvedCount ?? existing?.solvedCount,
              correctCount: rs.correctCount ?? existing?.correctCount,
            };
          });
          setToStorage('submissions', syncedSubs);
          setToStorage('synced_exam_results', true);
        } else {
          setToStorage('submissions', []);
          setToStorage('synced_exam_results', true);
        }
      }

      if (remotePayments !== null) {
        setToStorage('payments', remotePayments);
        setToStorage('synced_payments', true);
      }
      if (remoteCodes !== null) {
        if (remoteCodes.length > 0) {
          setToStorage('redeem_codes', remoteCodes);
          setToStorage('synced_redeem_codes', true);
        } else if (getFromStorage<boolean>('synced_redeem_codes', false)) {
          setToStorage('redeem_codes', []);
        }
      }
      if (remotePaymentMethods !== null) {
        setToStorage('payment_methods', remotePaymentMethods);
        setToStorage('payment_methods_initialized', true);
      }
      if (remoteNotifications !== null && remoteNotifications.length > 0) {
        const localNotifs = this.getNotifications();
        const readMap = new Map(localNotifs.map((n) => [n.id, Boolean(n.isRead)]));
        const syncedNotifs = remoteNotifications.map((rn) => ({
          ...rn,
          isRead: readMap.get(rn.id) ?? false,
        }));
        setToStorage('notifications', syncedNotifs);
      }
      if (remoteSecretaries !== null && remoteSecretaries.length > 0) {
        setToStorage('secretaries', remoteSecretaries);
      }
      if (remoteHonorStudents !== null) {
        if (remoteHonorStudents.length > 0) {
          setToStorage('honor_students', remoteHonorStudents);
          setToStorage('synced_honor', true);
        } else if (getFromStorage<boolean>('synced_honor', false)) {
          setToStorage('honor_students', []);
        }
      }
      if (remoteSupportThreads !== null) {
        setToStorage('support_threads', remoteSupportThreads);
        setToStorage('synced_support_threads', true);
      }
      if (remoteSettings && Object.keys(remoteSettings).length > 0) {
        const currentSettings = this.getSettings();
        const mergedSettings: PlatformSettings = {
          ...currentSettings,
          academicYear: remoteSettings.academicYear || currentSettings.academicYear,
          platformName: remoteSettings.platformName || currentSettings.platformName,
          teacherName: remoteSettings.teacherName || currentSettings.teacherName,
          teacherPhone: remoteSettings.teacherPhone || currentSettings.teacherPhone,
          supportPhone: remoteSettings.supportPhone || currentSettings.supportPhone,
          colorTheme: (remoteSettings.colorTheme as PlatformSettings['colorTheme']) || currentSettings.colorTheme,
          pageLayout: (remoteSettings.pageLayout as PlatformSettings['pageLayout']) || currentSettings.pageLayout,
        };
        setToStorage('settings', mergedSettings);
      }
    } catch (e) {
      console.warn('Sync with Supabase skipped or failed:', e);
    }
  },
};
