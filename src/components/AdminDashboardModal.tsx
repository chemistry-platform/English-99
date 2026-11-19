/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Video,
  FileText,
  GraduationCap,
  CheckSquare,
  Users,
  CreditCard,
  Bell,
  Trophy,
  UserCheck,
  Zap,
  Sliders,
  Plus,
  Trash2,
  Camera,
  Upload,
  CheckCircle,
  Copy,
  Download,
  Search,
  ExternalLink,
  Bot,
  Sparkles,
  Loader2,
  Database,
  Calendar,
  Lock,
  Printer,
  Edit3,
  Play,
  Eye,
  BookOpen,
  Film,
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Gift,
  Wallet,
  Check,
  Mic,
  Square,
  Volume2,
  Smartphone,
  Building,
  ToggleLeft,
  ToggleRight,
  MessageCircle,
  Image as ImageIcon,
  ZoomIn,
  Send,
  Reply,
} from 'lucide-react';
import {
  CourseLecture,
  ChemistryDocument,
  ExamOrAssignment,
  ExamQuestion,
  ExamSubmission,
  RedeemCode,
  PaymentMethodItem,
  PaymentRequest,
  PlatformNotification,
  HonorStudent,
  SecretaryMember,
  PlatformSettings,
  UserProfile,
  CourseLesson,
  SupportThread,
  SupportMessage,
} from '../types';
import { platformDB } from '../lib/storage';
import { saveSupabaseCredentials, testSupabaseConnection, generateUuid } from '../lib/supabase';
import { COURSE_COVER_IMAGES, getCourseLessons, getLessonPublishDestinationLabel, makeLessonId } from '../lib/courseHelpers';
import { UploadProgressBar } from './UploadProgressBar';
import { GeminiChatPanel } from './GeminiChatPanel';
import { VideoPlayerModal } from './VideoPlayerModal';
import { DocumentViewerModal } from './DocumentViewerModal';
import { StudentsDataSection } from './StudentsDataSection';
import { AdminCourseHierarchyEditor } from './AdminCourseHierarchyEditor';
import { AssessmentQuestionEditor } from './AssessmentQuestionEditor';
import { fetchUnreadGrievancesCount, markAllGrievancesSeen } from '../lib/supabaseAssessments';
import { Modal } from './Modal';
import { BrandLogo } from './BrandLogo';
import {
  uploadFileWithRealProgress,
  validateLinkWithProgress,
  validateDocumentLinkWithProgress,
  UploadProgressInfo,
} from '../lib/uploadManager';
import { detectVideoDuration, detectPdfPages, formatBytes } from '../lib/mediaDetector';
import { formatCourseDurationHHMMSS } from '../lib/formatDuration';
import {
  parseAndCleanMediaUrl,
  validateExternalVideoLink,
  validateExternalDocumentLink,
} from '../lib/urlParser';

export type AdminTabId =
  | 'courses'
  | 'documents'
  | 'exams'
  | 'assignments'
  | 'gemini'
  | 'students'
  | 'students-data'
  | 'payments'
  | 'notifications'
  | 'support'
  | 'honor'
  | 'secretaries'
  | 'codes'
  | 'settings';

interface AdminDashboardModalProps {
  isOpen: boolean;
  initialEditCourseId?: string | null;
  initialAdminTab?: AdminTabId;
  onAdminTabChange?: (tab: AdminTabId) => void;
  onClose: () => void;
  settings: PlatformSettings;
  onSettingsUpdated: (settings: PlatformSettings) => void;
  onDataChanged: () => void;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  isOpen,
  initialEditCourseId,
  initialAdminTab,
  onAdminTabChange,
  onClose,
  settings,
  onSettingsUpdated,
  onDataChanged,
}) => {
  const [activeTab, setActiveTabState] = useState<AdminTabId>(initialAdminTab || 'courses');
  const [unreadGrievancesCount, setUnreadGrievancesCount] = useState<number>(0);

  const setActiveTab = (tab: AdminTabId) => {
    setActiveTabState(tab);
    onAdminTabChange?.(tab);
    if (tab === 'students-data' && unreadGrievancesCount > 0) {
      setUnreadGrievancesCount(0);
      void markAllGrievancesSeen();
    }
  };

  useEffect(() => {
    if (isOpen && initialAdminTab && initialAdminTab !== activeTab) {
      setActiveTabState(initialAdminTab);
      if (initialAdminTab === 'students-data') {
        setUnreadGrievancesCount(0);
        void markAllGrievancesSeen();
      }
    }
  }, [isOpen, initialAdminTab]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void fetchUnreadGrievancesCount().then((cnt) => {
      if (active) setUnreadGrievancesCount(cnt);
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Courses form state
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseChapter, setNewCourseChapter] = useState('Unit 1: Present & Past Tenses');
  const [newCourseDesc, setNewCourseDesc] = useState('');
  const [newCourseUrl, setNewCourseUrl] = useState('');
  const [originalCourseUrl, setOriginalCourseUrl] = useState('');
  const [newCoursePrice, setNewCoursePrice] = useState('50');
  const [newCourseIsFree, setNewCourseIsFree] = useState(false);
  const [newCourseGrade, setNewCourseGrade] = useState('3rd Secondary');
  const [newCourseDuration, setNewCourseDuration] = useState('');
  const [newCourseDurationSeconds, setNewCourseDurationSeconds] = useState<number>(0);
  const [courseUploadFileName, setCourseUploadFileName] = useState('');
  const [courseVideoMode, setCourseVideoMode] = useState<'link' | 'upload'>('link');
  const [newCourseAttachedPdf, setNewCourseAttachedPdf] = useState<string>('');
  const [newCourseAttachedExam, setNewCourseAttachedExam] = useState<string>('');
  const [newCourseCoverUrl, setNewCourseCoverUrl] = useState<string>(COURSE_COVER_IMAGES[0]);
  const [newCourseScheduleText, setNewCourseScheduleText] = useState<string>('');
  const [newCourseInstructions, setNewCourseInstructions] = useState<string>('');
  const [newCourseLessons, setNewCourseLessons] = useState<CourseLesson[]>([]);
  const [isCourseEditorOpen, setIsCourseEditorOpen] = useState<boolean>(false);
  const [pendingDeleteCourse, setPendingDeleteCourse] = useState<CourseLecture | null>(null);
  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [selectedPublishLessonIds, setSelectedPublishLessonIds] = useState<Record<string, boolean>>({});
  const [publishNewLessonTitle, setPublishNewLessonTitle] = useState<string>('');
  const [isSavingCourseAction, setIsSavingCourseAction] = useState<boolean>(false);

  // Documents form state
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState<ChemistryDocument['docType']>('Study Notes');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [newDocGrade, setNewDocGrade] = useState('3rd Secondary');
  const [newDocPages, setNewDocPages] = useState('30');
  const [newDocFileSize, setNewDocFileSize] = useState('12 MB');
  const [docUploadFileName, setDocUploadFileName] = useState('');
  const [docFileMode, setDocFileMode] = useState<'link' | 'upload'>('link');

  // Courses & Documents edit state
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [courseUploadProgress, setCourseUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [docUploadProgress, setDocUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [coverUploadProgress, setCoverUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [isCourseUploading, setIsCourseUploading] = useState(false);
  const [isDocUploading, setIsDocUploading] = useState(false);
  const [detectedVideoDurationText, setDetectedVideoDurationText] = useState<string>('');
  const [detectedDocInfoText, setDetectedDocInfoText] = useState<string>('');
  const [isValidatingCourseLink, setIsValidatingCourseLink] = useState(false);
  const [isValidatingDocLink, setIsValidatingDocLink] = useState(false);
  const [linkValidationProgress, setLinkValidationProgress] = useState<{ percent: number; status: string } | null>(null);
  const [docLinkValidationProgress, setDocLinkValidationProgress] = useState<{ percent: number; status: string } | null>(null);
  const probedCourseUrlRef = useRef<string>('');
  const probedDocUrlRef = useRef<string>('');
  const courseProbeSeqRef = useRef<number>(0);
  const docProbeSeqRef = useRef<number>(0);
  const [previewCourseModal, setPreviewCourseModal] = useState<CourseLecture | null>(null);
  const [previewDocModal, setPreviewDocModal] = useState<ChemistryDocument | null>(null);

  // Gemini AI Analysis & Emergency Reset state
  const [geminiStudentPrompt, setGeminiStudentPrompt] = useState('Who logged in or registered today?');
  const [geminiStudentAnswer, setGeminiStudentAnswer] = useState<string | null>(null);
  const [isAnalyzingStudents, setIsAnalyzingStudents] = useState(false);
  const [isResettingAi, setIsResettingAi] = useState(false);
  const [aiResetMessage, setAiResetMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Students & Gemini Scanner state
  const [studentSearch, setStudentSearch] = useState('');
  const [newStdName, setNewStdName] = useState('');
  const [newStdPhone, setNewStdPhone] = useState('');
  const [newStdPassword, setNewStdPassword] = useState('');
  const [newStdParentPhone, setNewStdParentPhone] = useState('');
  const [newStdGov, setNewStdGov] = useState('Cairo');
  const [newStdGrade, setNewStdGrade] = useState('3rd Secondary');
  const [isScanningStudents, setIsScanningStudents] = useState(false);

  // Gift Free Content & Manual Wallet Balance modals
  const [giftModalStudent, setGiftModalStudent] = useState<UserProfile | null>(null);
  const [giftSelectedCourseIds, setGiftSelectedCourseIds] = useState<string[]>([]);
  const [giftSelectedDocIds, setGiftSelectedDocIds] = useState<string[]>([]);
  const [giftSearchQuery, setGiftSearchQuery] = useState('');
  const [isSavingGift, setIsSavingGift] = useState(false);

  const [balanceModalStudent, setBalanceModalStudent] = useState<UserProfile | null>(null);
  const [balanceActionMode, setBalanceActionMode] = useState<'add' | 'set'>('add');
  const [balanceAmountInput, setBalanceAmountInput] = useState('100');
  const [isSavingBalance, setIsSavingBalance] = useState(false);
  const [reviewingPaymentId, setReviewingPaymentId] = useState<string | null>(null);

  // Payment Methods CRUD State (Admin & Secretary only)
  const [paymentMethodsList, setPaymentMethodsList] = useState<PaymentMethodItem[]>(() =>
    platformDB.getPaymentMethods()
  );
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [methodNameInput, setMethodNameInput] = useState('');
  const [methodAccountInput, setMethodAccountInput] = useState('');
  const [methodInstructionsInput, setMethodInstructionsInput] = useState('');
  const [methodIconType, setMethodIconType] = useState<NonNullable<PaymentMethodItem['iconType']>>('phone');
  const [methodAccentColor, setMethodAccentColor] = useState<NonNullable<PaymentMethodItem['accentColor']>>('amber');
  const [methodIsActive, setMethodIsActive] = useState(true);
  const [isSavingMethod, setIsSavingMethod] = useState(false);
  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null);

  // Direct Charge Any Student Inside Platform State
  const [directChargeSearch, setDirectChargeSearch] = useState('');
  const [directChargeStudentId, setDirectChargeStudentId] = useState('');
  const [directChargeMode, setDirectChargeMode] = useState<'add' | 'set'>('add');
  const [directChargeAmount, setDirectChargeAmount] = useState('100');
  const [isSavingDirectCharge, setIsSavingDirectCharge] = useState(false);

  // Bulk & Custom Redeem Codes generator
  const [codePrefix, setCodePrefix] = useState('AMR');
  const [codeCount, setCodeCount] = useState<number>(50);
  const [codeAmount, setCodeAmount] = useState('50');
  const [codeMaxUses, setCodeMaxUses] = useState('1');
  const [codeType, setCodeType] = useState<'balance' | 'course'>('balance');
  const [selectedCourseForCode, setSelectedCourseForCode] = useState<string>('');
  const [codePaymentMethodId, setCodePaymentMethodId] = useState<string>('');
  const [customCodeString, setCustomCodeString] = useState('');
  const [customCodeType, setCustomCodeType] = useState<'balance' | 'course'>('balance');
  const [customCodeCourseId, setCustomCodeCourseId] = useState<string>('');
  const [customCodeAmount, setCustomCodeAmount] = useState('100');
  const [customCodeMaxUses, setCustomCodeMaxUses] = useState('1');
  const [customCodePaymentMethodId, setCustomCodePaymentMethodId] = useState<string>('');
  const [showPrintCardsModal, setShowPrintCardsModal] = useState(false);
  const [generatedBatchCodes, setGeneratedBatchCodes] = useState<string[]>([]);
  const [codeSearch, setCodeSearch] = useState('');
  const [copiedCodesSuccess, setCopiedCodesSuccess] = useState(false);

  // Broadcast Notification + Voice Recording
  const [notifTitle, setNotifTitle] = useState('');
  const [notifContent, setNotifContent] = useState('');
  const [notifTargetGrade, setNotifTargetGrade] = useState('All');
  const [notifIsUrgent, setNotifIsUrgent] = useState(false);
  const [notifAudioUrl, setNotifAudioUrl] = useState('');
  const [notifAudioDuration, setNotifAudioDuration] = useState(0);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceRecorderError, setVoiceRecorderError] = useState<string | null>(null);
  const [isUploadingNotifAudio, setIsUploadingNotifAudio] = useState(false);
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingSecondsRef = useRef<number>(0);

  // Support Inbox & Reply Composer state (Admin/Secretary Q&A)
  const [supportFilter, setSupportFilter] = useState<'all' | 'open' | 'answered'>('all');
  const [supportSearch, setSupportSearch] = useState('');
  const [isRefreshingSupport, setIsRefreshingSupport] = useState(false);
  const [activeSupportThreadId, setActiveSupportThreadId] = useState<string | null>(null);
  const [supportReplyText, setSupportReplyText] = useState('');
  const [supportReplyImageFile, setSupportReplyImageFile] = useState<File | null>(null);
  const [supportReplyImagePreview, setSupportReplyImagePreview] = useState('');
  const [supportReplyAudioFile, setSupportReplyAudioFile] = useState<File | null>(null);
  const [supportReplyAudioPreview, setSupportReplyAudioPreview] = useState('');
  const [supportReplyAudioDuration, setSupportReplyAudioDuration] = useState(0);
  const [isRecordingSupportVoice, setIsRecordingSupportVoice] = useState(false);
  const [supportRecSeconds, setSupportRecSeconds] = useState(0);
  const [supportVoiceError, setSupportVoiceError] = useState<string | null>(null);
  const [supportUploadProgress, setSupportUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [isSendingSupportReply, setIsSendingSupportReply] = useState(false);
  const [deletingSupportId, setDeletingSupportId] = useState<string | null>(null);
  const [supportLightboxUrl, setSupportLightboxUrl] = useState<string | null>(null);
  const supportMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const supportMediaStreamRef = useRef<MediaStream | null>(null);
  const supportChunksRef = useRef<BlobPart[]>([]);
  const supportTimerRef = useRef<number | null>(null);
  const supportSecondsRef = useRef<number>(0);
  const lastAutoSavedLessonsSigRef = useRef<string>('');

  // Honor student form
  const [honorName, setHonorName] = useState('');
  const [honorGov, setHonorGov] = useState('Cairo');
  const [honorScore, setHonorScore] = useState('60');
  const [honorRank, setHonorRank] = useState('1');
  const [honorTitle, setHonorTitle] = useState('1st Place Nationwide 🥇');

  // Secretary form
  const [secName, setSecName] = useState('');
  const [secPhone, setSecPhone] = useState('');
  const [secNotes, setSecNotes] = useState('Following up on assignments and payment receipts');

  // Gemini AI Payment Analyzer state
  const [geminiPaymentPrompt, setGeminiPaymentPrompt] = useState('Who paid today?');
  const [geminiPaymentAnswer, setGeminiPaymentAnswer] = useState<string | null>(null);
  const [isAnalyzingPayments, setIsAnalyzingPayments] = useState(false);

  // Settings, Appearance & Dynamic Year
  const [tempYear, setTempYear] = useState(settings.academicYear);
  const [tempPlatformName, setTempPlatformName] = useState(settings.platformName);
  const [tempColorTheme, setTempColorTheme] = useState<'amber' | 'blue' | 'emerald' | 'purple' | 'rose' | 'cyan'>(
    settings.colorTheme || 'amber'
  );
  const [tempPageLayout, setTempPageLayout] = useState<'comfortable' | 'compact' | 'modern'>(
    settings.pageLayout || 'comfortable'
  );
  const [tempSupabaseUrl, setTempSupabaseUrl] = useState(settings.supabaseUrl || '');
  const [tempSupabaseKey, setTempSupabaseKey] = useState(settings.supabaseAnonKey || '');
  const [supabaseTestMsg, setSupabaseTestMsg] = useState<{ success?: boolean; text?: string } | null>(null);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false);
  const [saveSuccessToast, setSaveSuccessToast] = useState<string | null>(null);
  const [saveErrorToast, setSaveErrorToast] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialEditCourseId) {
      const targetCourse = platformDB.getCourses().find((c) => c.id === initialEditCourseId);
      if (targetCourse) {
        setEditingCourseId(targetCourse.id);
        setNewCourseTitle(targetCourse.title);
        setNewCourseChapter(targetCourse.chapter);
        setNewCourseDesc(targetCourse.description || '');
        setNewCourseUrl(targetCourse.videoUrl || '');
        setOriginalCourseUrl(targetCourse.original_url || targetCourse.videoUrl || '');
        probedCourseUrlRef.current = targetCourse.videoUrl || '';
        setNewCourseGrade(targetCourse.grade);
        setNewCourseDuration(targetCourse.durationMinutes ? String(targetCourse.durationMinutes) : '');
        setNewCourseDurationSeconds(
          targetCourse.durationSeconds && targetCourse.durationSeconds > 0
            ? targetCourse.durationSeconds
            : targetCourse.durationMinutes > 0
            ? targetCourse.durationMinutes * 60
            : 0
        );
        setNewCourseIsFree(targetCourse.isFree);
        setNewCoursePrice(String(targetCourse.price || 0));
        setNewCourseAttachedPdf(targetCourse.attachedPdfUrl || '');
        setNewCourseAttachedExam(targetCourse.attachedExamId || '');
        setNewCourseCoverUrl(targetCourse.coverUrl || COURSE_COVER_IMAGES[0]);
        setNewCourseScheduleText(targetCourse.scheduleText || '');
        setNewCourseInstructions(targetCourse.instructions || '');
        const initialDraftOrLive =
          Array.isArray(targetCourse.draftLessons) && targetCourse.draftLessons.length > 0
            ? targetCourse.draftLessons
            : getCourseLessons(targetCourse);
        lastAutoSavedLessonsSigRef.current = JSON.stringify(initialDraftOrLive);
        setNewCourseLessons(initialDraftOrLive);
        setCourseVideoMode(targetCourse.videoUrl?.startsWith('blob:') ? 'upload' : 'link');
        setIsCourseEditorOpen(true);
        setActiveTab('courses');
      }
    }
  }, [isOpen, initialEditCourseId]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';

    let closedViaPopState = false;
    let pushedHistory = false;
    try {
      window.history.pushState(
        { ...(window.history.state || {}), modal: 'amr-admin-fullscreen' },
        ''
      );
      pushedHistory = true;
    } catch {
      pushedHistory = false;
    }

    const handlePopState = () => {
      closedViaPopState = true;
      pushedHistory = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.document.body.style.overflow = prevOverflow;
      if (!closedViaPopState && pushedHistory && window.history.state?.modal === 'amr-admin-fullscreen') {
        try {
          window.history.back();
        } catch {
          // Ignore
        }
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethodsList(platformDB.getPaymentMethods());
    } else {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      setIsRecordingVoice(false);

      if (supportTimerRef.current) {
        window.clearInterval(supportTimerRef.current);
        supportTimerRef.current = null;
      }
      if (supportMediaRecorderRef.current && supportMediaRecorderRef.current.state !== 'inactive') {
        try {
          supportMediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (supportMediaStreamRef.current) {
        supportMediaStreamRef.current.getTracks().forEach((t) => t.stop());
        supportMediaStreamRef.current = null;
      }
      setIsRecordingSupportVoice(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (supportTimerRef.current) window.clearInterval(supportTimerRef.current);
      if (supportMediaStreamRef.current) supportMediaStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Debounced auto-save to Supabase when editing lessons/content inside an existing course
  useEffect(() => {
    if (
      !isOpen ||
      !isCourseEditorOpen ||
      !editingCourseId ||
      !newCourseTitle.trim() ||
      isCourseUploading ||
      isSavingCourseAction ||
      isValidatingCourseLink
    ) {
      return;
    }
    const lessonsSig = JSON.stringify(newCourseLessons);
    if (lessonsSig === lastAutoSavedLessonsSigRef.current) {
      return;
    }
    const hasTempMedia = newCourseLessons.some((l) =>
      (l.sections || []).some((s) =>
        (s.items && s.items.length > 0 ? s.items : [s]).some(
          (it) =>
            (it.videoUrl || '').trim().startsWith('blob:') ||
            (it.videoUrl || '').trim().startsWith('data:') ||
            (it.fileUrl || '').trim().startsWith('blob:') ||
            (it.fileUrl || '').trim().startsWith('data:')
        )
      )
    );
    if (hasTempMedia) return;

    const timer = window.setTimeout(async () => {
      const existingCourse = platformDB.getCourses().find((c) => c.id === editingCourseId);
      if (!existingCourse) return;
      try {
        const syncedDraftLessons = await syncInlineItemExams(
          newCourseLessons.map((l, idx) => ({ ...l, order: idx + 1 })),
          newCourseTitle.trim(),
          newCourseGrade
        );
        const draftPayload: CourseLecture = {
          ...existingCourse,
          title: newCourseTitle.trim(),
          chapter: newCourseChapter.trim() || existingCourse.chapter || 'General Curriculum',
          description: newCourseDesc.trim() || '',
          coverUrl: newCourseCoverUrl.trim() || existingCourse.coverUrl || COURSE_COVER_IMAGES[0],
          scheduleText: newCourseScheduleText.trim() || undefined,
          instructions: newCourseInstructions.trim() || undefined,
          grade: newCourseGrade,
          price: newCourseIsFree ? 0 : parseFloat(newCoursePrice) || existingCourse.price || 50,
          isFree: newCourseIsFree,
          lessons: existingCourse.lessons || [],
          draftLessons: syncedDraftLessons,
        };
        const { supabaseResult } = await platformDB.saveCourseWithProbe(draftPayload);
        if (supabaseResult.success) {
          lastAutoSavedLessonsSigRef.current = JSON.stringify(newCourseLessons);
          onDataChanged();
        }
      } catch {
        // Silent background auto-save retry on next explicit save
      }
    }, 1200);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isCourseEditorOpen, editingCourseId, newCourseLessons, isCourseUploading, isSavingCourseAction]);

  const activeStaffUser = platformDB.getCurrentUser();
  const isStaffAuthorized =
    activeStaffUser?.role === 'admin' || activeStaffUser?.role === 'secretary';

  if (!isOpen || !isStaffAuthorized) return null;

  // Sync any inline questions authored directly inside lesson section items to ExamOrAssignment storage
  const syncInlineItemExams = async (
    lessonsToSync: CourseLesson[],
    courseTitle: string,
    grade: string
  ): Promise<CourseLesson[]> => {
    const existingExams = platformDB.getExams();
    const outLessons: CourseLesson[] = [];

    for (const lesson of lessonsToSync) {
      const nextSections = [];
      for (const sec of lesson.sections || []) {
        const nextItems = [];
        for (const item of sec.items || []) {
          if (
            (item.contentType === 'assignment' || item.contentType === 'exam') &&
            Array.isArray(item.inlineQuestions) &&
            item.inlineQuestions.length > 0
          ) {
            const generatedExamId = item.examId && item.examId.startsWith('inline-')
              ? item.examId
              : `inline-${item.id}`;
            const existingEx = existingExams.find((ex) => ex.id === generatedExamId);
            const totalPts = item.inlineQuestions.reduce((acc, q) => acc + (Number(q.points) || 2), 0);
            const examObj: ExamOrAssignment = {
              id: generatedExamId,
              title: item.title || sec.title || `${courseTitle} - ${lesson.title}`,
              category: item.contentType === 'assignment' ? 'assignment' : 'exam',
              grade: grade || '3rd Secondary',
              durationMinutes: 45,
              totalPoints: totalPts || item.inlineQuestions.length * 2,
              deadline: 'Available Immediately',
              questions: item.inlineQuestions,
              createdAt: existingEx?.createdAt || new Date().toISOString(),
            };
            await platformDB.saveExamAsync(examObj);
            nextItems.push({ ...item, examId: generatedExamId });
          } else {
            nextItems.push(item);
          }
        }
        const primary = nextItems[0];
        nextSections.push({
          ...sec,
          items: nextItems,
          examId: primary?.examId ?? sec.examId,
        });
      }
      outLessons.push({ ...lesson, sections: nextSections });
    }
    return outLessons;
  };

  const buildCoursePayloadFromForm = async (options: {
    mode: 'draft' | 'publish';
    selectedLessonIds?: Record<string, boolean>;
  }): Promise<CourseLecture | null> => {
    if (isCourseUploading) {
      setSaveErrorToast('Uploading and processing video file, please wait until upload reaches 100%.');
      setTimeout(() => setSaveErrorToast(null), 5000);
      return null;
    }

    const courseTitle = newCourseTitle.trim();
    if (!courseTitle) {
      setSaveErrorToast('Please enter the course name first.');
      setTimeout(() => setSaveErrorToast(null), 5000);
      return null;
    }

    const firstLessonVideoUrl =
      newCourseLessons
        .flatMap((l) => l.sections || [])
        .flatMap((s) => (s.items && s.items.length > 0 ? s.items : [s]))
        .find((it) => it.contentType === 'video' && (it.videoUrl || '').trim())
        ?.videoUrl?.trim() || '';

    const trimmedUrl = (newCourseUrl || originalCourseUrl || firstLessonVideoUrl).trim();
    const hasInvalidLocalMedia =
      trimmedUrl.startsWith('blob:') ||
      trimmedUrl.startsWith('data:') ||
      newCourseLessons.some((l) =>
        (l.sections || []).some((s) =>
          (s.items && s.items.length > 0 ? s.items : [s]).some(
            (it) =>
              (it.videoUrl || '').trim().startsWith('blob:') ||
              (it.videoUrl || '').trim().startsWith('data:') ||
              (it.fileUrl || '').trim().startsWith('blob:') ||
              (it.fileUrl || '').trim().startsWith('data:')
          )
        )
      );
    if (hasInvalidLocalMedia) {
      setSaveErrorToast('There is a temporary local (blob) file not yet uploaded to Supabase Storage. Please re-upload and ensure it succeeds before saving.');
      setTimeout(() => setSaveErrorToast(null), 7000);
      return null;
    }

    let cleanVideoUrl = '';
    let resolvedProvider = 'direct';
    let resolvedExternalId: string | undefined;
    let resolvedDurationMinutes = Math.max(0, parseInt(newCourseDuration, 10) || 0);
    let resolvedDurationSeconds =
      newCourseDurationSeconds > 0
        ? newCourseDurationSeconds
        : resolvedDurationMinutes > 0
        ? resolvedDurationMinutes * 60
        : 0;

    if (trimmedUrl) {
      const check = validateExternalVideoLink(trimmedUrl);
      if (!check.valid) {
        setSaveErrorToast(check.error || 'Invalid video link format');
        setTimeout(() => setSaveErrorToast(null), 6000);
        return null;
      }
      cleanVideoUrl = check.cleanUrl;
      resolvedProvider = check.provider;
      resolvedExternalId = check.external_id;

      if (
        courseVideoMode === 'link' &&
        probedCourseUrlRef.current !== check.cleanUrl &&
        probedCourseUrlRef.current !== trimmedUrl
      ) {
        const probe = await validateLinkWithProgress(trimmedUrl, (percent, status) => {
          setLinkValidationProgress({ percent, status });
        });
        probedCourseUrlRef.current = check.cleanUrl;
        if (probe.accurate && probe.totalSeconds && probe.totalSeconds > 0) {
          resolvedDurationSeconds = Math.round(probe.totalSeconds);
          resolvedDurationMinutes = probe.detectedMinutes;
          setNewCourseDuration(String(probe.detectedMinutes));
          setNewCourseDurationSeconds(resolvedDurationSeconds);
          setDetectedVideoDurationText(probe.formattedDuration);
        }
      }
    }

    const existingCourse = editingCourseId
      ? platformDB.getCourses().find((c) => c.id === editingCourseId)
      : undefined;
    const courseId = editingCourseId || generateUuid();

    const syncedDraftLessons = await syncInlineItemExams(
      newCourseLessons.map((l, idx) => ({ ...l, order: idx + 1 })),
      courseTitle,
      newCourseGrade
    );

    let finalPublishedLessons: CourseLesson[] = existingCourse?.lessons || [];
    let finalDraftLessons: CourseLesson[] | undefined = syncedDraftLessons;

    if (options.mode === 'publish') {
      const selectedMap = options.selectedLessonIds || {};
      const existingLiveMap = new Map<string, CourseLesson>(
        (existingCourse?.lessons || []).map((l) => [l.id, l])
      );

      const nextPublished: CourseLesson[] = [];
      let hasUnpublishedRemaining = false;

      syncedDraftLessons.forEach((draftLesson) => {
        if (selectedMap[draftLesson.id]) {
          nextPublished.push(draftLesson);
        } else {
          hasUnpublishedRemaining = true;
          const prevLive = existingLiveMap.get(draftLesson.id);
          if (prevLive) {
            nextPublished.push(prevLive);
          }
        }
      });

      finalPublishedLessons = nextPublished.map((l, idx) => ({ ...l, order: idx + 1 }));
      finalDraftLessons = hasUnpublishedRemaining ? syncedDraftLessons : undefined;
    }

    return {
      id: courseId,
      title: courseTitle,
      chapter: newCourseChapter.trim() || 'General Curriculum',
      description: newCourseDesc.trim() || '',
      coverUrl: newCourseCoverUrl.trim() || COURSE_COVER_IMAGES[0],
      scheduleText: newCourseScheduleText.trim() || undefined,
      instructions: newCourseInstructions.trim() || undefined,
      lessons: finalPublishedLessons,
      draftLessons: finalDraftLessons,
      videoUrl: cleanVideoUrl,
      videoSource:
        resolvedProvider === 'drive'
          ? 'drive'
          : resolvedProvider === 'direct'
          ? 'direct'
          : 'youtube',
      provider: resolvedProvider,
      external_id: resolvedExternalId,
      original_url: (originalCourseUrl || trimmedUrl).trim(),
      price: newCourseIsFree ? 0 : parseFloat(newCoursePrice) || 50,
      isFree: newCourseIsFree,
      grade: newCourseGrade,
      durationMinutes: resolvedDurationMinutes,
      durationSeconds: resolvedDurationSeconds > 0 ? resolvedDurationSeconds : undefined,
      viewsCount: existingCourse?.viewsCount ?? 0,
      attachedPdfUrl: newCourseAttachedPdf || undefined,
      attachedExamId: newCourseAttachedExam || undefined,
      createdAt: existingCourse?.createdAt || new Date().toISOString(),
    };
  };

  const handleSaveCourseAsDraft = async () => {
    setIsSavingCourseAction(true);
    try {
      const draftCourse = await buildCoursePayloadFromForm({ mode: 'draft' });
      if (!draftCourse) return;

      const { supabaseResult } = await platformDB.saveCourseWithProbe(draftCourse);
      if (!supabaseResult.success) {
        setSaveErrorToast(`Failed to save course to Supabase: ${supabaseResult.error || 'Unknown error'}`);
        setTimeout(() => setSaveErrorToast(null), 6500);
        return;
      }
      setEditingCourseId(draftCourse.id);
      if (draftCourse.draftLessons) {
        lastAutoSavedLessonsSigRef.current = JSON.stringify(draftCourse.draftLessons);
        setNewCourseLessons(draftCourse.draftLessons);
      }
      onDataChanged();
      setSaveSuccessToast('Course and changes saved as draft in Supabase successfully ✓');
      setTimeout(() => setSaveSuccessToast(null), 3500);
    } catch (err: any) {
      setSaveErrorToast(`Failed to save draft: ${err?.message || err}`);
      setTimeout(() => setSaveErrorToast(null), 5000);
    } finally {
      setIsSavingCourseAction(false);
    }
  };

  const handleOpenPublishDestinationPicker = () => {
    if (!newCourseTitle.trim()) {
      setSaveErrorToast('Please enter the course name first before publishing');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }
    const defaultChecks: Record<string, boolean> = {};
    newCourseLessons.forEach((l) => {
      defaultChecks[l.id] = true;
    });
    setSelectedPublishLessonIds(defaultChecks);
    setPublishNewLessonTitle('');
    setShowPublishModal(true);
  };

  const handleAddLessonFromPublishModal = () => {
    const nextOrder = newCourseLessons.length + 1;
    const title = publishNewLessonTitle.trim() || `Lesson ${nextOrder}`;
    const newLesson: CourseLesson = {
      id: makeLessonId(),
      title,
      description: '',
      order: nextOrder,
      sections: [],
    };
    setNewCourseLessons((prev) => [...prev, newLesson]);
    setSelectedPublishLessonIds((prev) => ({ ...prev, [newLesson.id]: true }));
    setPublishNewLessonTitle('');
  };

  const handleConfirmPublishCourse = async () => {
    setIsSavingCourseAction(true);
    try {
      const courseToPublish = await buildCoursePayloadFromForm({
        mode: 'publish',
        selectedLessonIds: selectedPublishLessonIds,
      });
      if (!courseToPublish) return;

      const { supabaseResult } = await platformDB.saveCourseWithProbe(courseToPublish);
      if (!supabaseResult.success) {
        setSaveErrorToast(`Failed to publish course to Supabase: ${supabaseResult.error || 'Unknown error'}`);
        setTimeout(() => setSaveErrorToast(null), 6500);
        return;
      }
      setShowPublishModal(false);
      handleCancelEditCourse();
      onDataChanged();
      setSaveSuccessToast('Selected content saved and published to Supabase successfully! ✨');
      setTimeout(() => setSaveSuccessToast(null), 3500);
    } catch (err: any) {
      setSaveErrorToast(`Error while publishing: ${err?.message || err}`);
      setTimeout(() => setSaveErrorToast(null), 5000);
    } finally {
      setIsSavingCourseAction(false);
    }
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    handleOpenPublishDestinationPicker();
  };

  const handleOpenNewCourseEditor = () => {
    handleCancelEditCourse();
    setNewCourseLessons([]);
    setIsCourseEditorOpen(true);
    setActiveTab('courses');
  };

  const handleEditCourse = (course: CourseLecture) => {
    setEditingCourseId(course.id);
    setNewCourseTitle(course.title);
    setNewCourseChapter(course.chapter);
    setNewCourseDesc(course.description || '');
    setNewCourseUrl(course.videoUrl || '');
    setOriginalCourseUrl(course.original_url || course.videoUrl || '');
    probedCourseUrlRef.current = course.videoUrl || '';
    setNewCourseGrade(course.grade);
    setNewCourseDuration(course.durationMinutes ? String(course.durationMinutes) : '');
    setNewCourseDurationSeconds(
      course.durationSeconds && course.durationSeconds > 0
        ? course.durationSeconds
        : course.durationMinutes > 0
        ? course.durationMinutes * 60
        : 0
    );
    setNewCourseIsFree(course.isFree);
    setNewCoursePrice(String(course.price || 0));
    setNewCourseAttachedPdf(course.attachedPdfUrl || '');
    setNewCourseAttachedExam(course.attachedExamId || '');
    setNewCourseCoverUrl(course.coverUrl || COURSE_COVER_IMAGES[0]);
    setNewCourseScheduleText(course.scheduleText || '');
    setNewCourseInstructions(course.instructions || '');
    const draftOrLive =
      Array.isArray(course.draftLessons) && course.draftLessons.length > 0
        ? course.draftLessons
        : getCourseLessons(course);
    lastAutoSavedLessonsSigRef.current = JSON.stringify(draftOrLive);
    setNewCourseLessons(draftOrLive);
    setCourseVideoMode(course.videoUrl?.includes('/storage/v1/object/') ? 'upload' : 'link');
    setCoverUploadProgress(null);
    setIsCourseEditorOpen(true);
    setActiveTab('courses');
  };

  const handleCancelEditCourse = () => {
    setEditingCourseId(null);
    setIsCourseEditorOpen(false);
    setShowPublishModal(false);
    setNewCourseTitle('');
    setNewCourseChapter('General Curriculum');
    setNewCourseDesc('');
    setNewCourseUrl('');
    setOriginalCourseUrl('');
    probedCourseUrlRef.current = '';
    setCourseUploadFileName('');
    setNewCourseAttachedPdf('');
    setNewCourseAttachedExam('');
    setNewCourseCoverUrl(COURSE_COVER_IMAGES[0]);
    setNewCourseScheduleText('');
    setNewCourseInstructions('');
    setNewCourseLessons([]);
    setNewCourseDuration('');
    setNewCourseDurationSeconds(0);
    setCourseUploadProgress(null);
    setCoverUploadProgress(null);
    setDetectedVideoDurationText('');
    setLinkValidationProgress(null);
  };

  const handleDeleteCourse = (id: string) => {
    platformDB.deleteCourse(id);
    if (editingCourseId === id) handleCancelEditCourse();
    setPendingDeleteCourse(null);
    onDataChanged();
    setSaveSuccessToast('Course permanently deleted from the platform ✓');
    setTimeout(() => setSaveSuccessToast(null), 3000);
  };

  // Video File Upload & Detection (Max 50MB)
  const handleCourseFileUpload = async (file: File) => {
    if (!file) return;
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB limit
    if (file.size > maxSizeBytes) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setSaveErrorToast(
        `File exceeds 50 MB (${sizeMB} MB). Please use the "Paste External Link" (YouTube) option to preserve storage space and streaming speed.`
      );
      setTimeout(() => setSaveErrorToast(null), 8000);
      return;
    }

    setIsCourseUploading(true);
    setCourseUploadFileName(file.name);
    if (!newCourseTitle) {
      setNewCourseTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    try {
      const durationInfo = await detectVideoDuration(file);
      if (durationInfo.accurate && durationInfo.totalSeconds > 0) {
        setNewCourseDuration(String(durationInfo.minutes));
        setNewCourseDurationSeconds(Math.round(durationInfo.totalSeconds));
        setDetectedVideoDurationText(durationInfo.formattedText);
      } else {
        setNewCourseDuration('');
        setNewCourseDurationSeconds(0);
        setDetectedVideoDurationText('');
      }

      const res = await uploadFileWithRealProgress(file, 'Lectures', (info) => {
        setCourseUploadProgress(info);
      });

      if (res.success && res.url) {
        setNewCourseUrl(res.url);
        setOriginalCourseUrl(res.url);
        setSaveSuccessToast(`Uploaded to ${res.bucket}/${res.path}`);
        setTimeout(() => setSaveSuccessToast(null), 5000);
      } else {
        setNewCourseUrl('');
        setOriginalCourseUrl('');
        setSaveErrorToast(`Failed to upload video to Lectures: ${res.error || 'Unknown error'}`);
        setTimeout(() => setSaveErrorToast(null), 8000);
      }
    } finally {
      setIsCourseUploading(false);
    }
  };

  // Course Link Verification & High-Accuracy Duration Detection
  const handleValidateCourseLink = async (overrideUrl?: string) => {
    const rawTarget = (overrideUrl ?? newCourseUrl).trim();
    if (!rawTarget) {
      setSaveErrorToast('Please enter or paste the video link (YouTube or Google Drive) first');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }
    const check = validateExternalVideoLink(rawTarget);
    if (!check.valid) {
      setSaveErrorToast(check.error || 'Invalid video link format');
      setTimeout(() => setSaveErrorToast(null), 5000);
      return;
    }

    if (!originalCourseUrl.trim() || !rawTarget.includes('drive.usercontent.google.com')) {
      setOriginalCourseUrl(rawTarget);
    }
    setNewCourseUrl(check.cleanUrl);

    const seq = ++courseProbeSeqRef.current;
    setIsValidatingCourseLink(true);
    setDetectedVideoDurationText('');

    try {
      const probe = await validateLinkWithProgress(rawTarget, (percent, status) => {
        if (courseProbeSeqRef.current === seq) {
          setLinkValidationProgress({ percent, status });
        }
      });

      if (courseProbeSeqRef.current !== seq) return;
      probedCourseUrlRef.current = check.cleanUrl;

      if (
        !newCourseTitle.trim() &&
        probe.title &&
        probe.title !== 'English Lecture' &&
        probe.title !== 'Google Drive Lecture' &&
        probe.title !== 'Direct Video'
      ) {
        setNewCourseTitle(probe.title);
      }

      if (probe.accurate && probe.totalSeconds && probe.totalSeconds > 0) {
        setNewCourseDuration(String(probe.detectedMinutes));
        setNewCourseDurationSeconds(Math.round(probe.totalSeconds));
        setDetectedVideoDurationText(probe.formattedDuration);
        setSaveSuccessToast(`Video duration detected accurately: ${probe.formattedDuration} ✓`);
      } else {
        setNewCourseDurationSeconds(0);
        setSaveSuccessToast(
          check.provider === 'drive'
            ? 'Google Drive link verified and converted for direct streaming! ✓'
            : 'Video link verified successfully! ✓'
        );
      }
      setTimeout(() => setSaveSuccessToast(null), 4000);
    } finally {
      if (courseProbeSeqRef.current === seq) {
        setIsValidatingCourseLink(false);
      }
    }
  };

  // Document Link Verification & High-Accuracy Page Count Detection
  const handleValidateDocLink = async (overrideUrl?: string) => {
    const rawTarget = (overrideUrl ?? newDocUrl).trim();
    if (!rawTarget) {
      setSaveErrorToast('Please enter or paste the file or Google Drive link first');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }
    const check = validateExternalDocumentLink(rawTarget);
    if (!check.valid) {
      setSaveErrorToast(check.error || 'Invalid Google Drive link format');
      setTimeout(() => setSaveErrorToast(null), 5000);
      return;
    }

    setNewDocUrl(check.cleanUrl);

    const seq = ++docProbeSeqRef.current;
    setIsValidatingDocLink(true);
    setDetectedDocInfoText('');

    try {
      const probe = await validateDocumentLinkWithProgress(rawTarget, (percent, status) => {
        if (docProbeSeqRef.current === seq) {
          setDocLinkValidationProgress({ percent, status });
        }
      });

      if (docProbeSeqRef.current !== seq) return;
      probedDocUrlRef.current = check.cleanUrl;

      if (
        !newDocTitle.trim() &&
        probe.title &&
        probe.title !== 'Google Drive File' &&
        probe.title !== 'Official English Study Notes'
      ) {
        setNewDocTitle(probe.title);
      }

      if (probe.detectedFileSize && probe.detectedFileSize !== '12 MB') {
        setNewDocFileSize(probe.detectedFileSize);
      }

      if (probe.accurate && probe.detectedPages > 0) {
        setNewDocPages(String(probe.detectedPages));
        setDetectedDocInfoText(`${probe.detectedPages} pages • Size: ${probe.detectedFileSize}`);
        setSaveSuccessToast(`Page count detected accurately: ${probe.detectedPages} pages ✓`);
      } else {
        setSaveSuccessToast('Document link verified successfully! ✓');
      }
      setTimeout(() => setSaveSuccessToast(null), 4000);
    } finally {
      if (docProbeSeqRef.current === seq) {
        setIsValidatingDocLink(false);
      }
    }
  };

  // --- CRUD: Documents ---
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isDocUploading) {
        setSaveErrorToast('Uploading and processing file, please wait until upload reaches 100%');
        setTimeout(() => setSaveErrorToast(null), 5000);
        return;
      }

      const trimmedUrl = newDocUrl.trim();
      if (!trimmedUrl) {
        setSaveErrorToast(
          docFileMode === 'upload'
            ? 'Please upload the file first and verify Supabase upload success before saving.'
            : 'Please enter the file or notes link first.'
        );
        setTimeout(() => setSaveErrorToast(null), 6000);
        return;
      }
      if (trimmedUrl.startsWith('blob:') || trimmedUrl.startsWith('data:')) {
        setSaveErrorToast('Cannot save a temporary local (blob) URL. Please re-upload the file to Supabase Storage.');
        setTimeout(() => setSaveErrorToast(null), 7000);
        return;
      }

      const check = validateExternalDocumentLink(trimmedUrl);
      if (!check.valid) {
        setSaveErrorToast(check.error || 'Invalid Google Drive link format');
        setTimeout(() => setSaveErrorToast(null), 6000);
        return;
      }

      let resolvedPages = parseInt(newDocPages, 10) || 30;
      let resolvedFileSize = newDocFileSize || '12 MB';

      if (
        docFileMode === 'link' &&
        probedDocUrlRef.current !== check.cleanUrl &&
        probedDocUrlRef.current !== trimmedUrl
      ) {
        const probe = await validateDocumentLinkWithProgress(trimmedUrl, (percent, status) => {
          setDocLinkValidationProgress({ percent, status });
        });
        probedDocUrlRef.current = check.cleanUrl;
        if (probe.accurate && probe.detectedPages > 0) {
          resolvedPages = probe.detectedPages;
          setNewDocPages(String(probe.detectedPages));
          setDetectedDocInfoText(`${probe.detectedPages} pages • Size: ${probe.detectedFileSize}`);
        }
        if (probe.detectedFileSize && probe.detectedFileSize !== '12 MB') {
          resolvedFileSize = probe.detectedFileSize;
          setNewDocFileSize(probe.detectedFileSize);
        }
      }

      const docTitle = newDocTitle.trim() || `${newDocType} - ${newDocGrade}`;
      const existingDoc = editingDocId ? platformDB.getDocuments().find((d) => d.id === editingDocId) : undefined;
      const docId = editingDocId || generateUuid();

      const newDoc: ChemistryDocument = {
        id: docId,
        title: docTitle,
        docType: newDocType,
        grade: newDocGrade,
        fileUrl: check.cleanUrl,
        fileSize: resolvedFileSize,
        pagesCount: resolvedPages,
        downloadsCount: existingDoc?.downloadsCount ?? 0,
        provider: check.provider,
        external_id: check.external_id,
        original_url: trimmedUrl,
        createdAt: existingDoc?.createdAt || new Date().toISOString(),
      };

      const { supabaseResult } = await platformDB.saveDocumentWithProbe(newDoc);
      if (supabaseResult && !supabaseResult.success) {
        setSaveErrorToast(`Failed to save document to Supabase: ${supabaseResult.error || 'Unknown error'}`);
        setTimeout(() => setSaveErrorToast(null), 6500);
        return;
      }
      setSaveSuccessToast(
        editingDocId
          ? 'Document updates saved and synced automatically to Supabase! ✨'
          : 'New document added and saved automatically to Supabase! ✨'
      );
      setTimeout(() => setSaveSuccessToast(null), 3500);

      handleCancelEditDocument();
      onDataChanged();
    } catch (err: any) {
      console.error('handleAddDocument uncaught exception:', err);
      setSaveErrorToast(`Error while adding document: ${err?.message || err}`);
      setTimeout(() => setSaveErrorToast(null), 6000);
    }
  };

  const handleEditDocument = (doc: ChemistryDocument) => {
    setEditingDocId(doc.id);
    setNewDocTitle(doc.title);
    setNewDocType(doc.docType);
    setNewDocUrl(doc.fileUrl);
    probedDocUrlRef.current = doc.fileUrl;
    setNewDocGrade(doc.grade);
    setNewDocPages(String(doc.pagesCount || 30));
    setNewDocFileSize(doc.fileSize || '12 MB');
    setDocFileMode(doc.fileUrl.includes('/storage/v1/object/') ? 'upload' : 'link');
    setActiveTab('documents');
  };

  const handleCancelEditDocument = () => {
    setEditingDocId(null);
    setNewDocTitle('');
    setNewDocUrl('');
    probedDocUrlRef.current = '';
    setDocUploadFileName('');
    setDocUploadProgress(null);
    setDetectedDocInfoText('');
    setDocLinkValidationProgress(null);
  };

  const handleDeleteDocument = (id: string) => {
    platformDB.deleteDocument(id);
    if (editingDocId === id) handleCancelEditDocument();
    onDataChanged();
    setSaveSuccessToast('Document deleted successfully from the platform ✓');
    setTimeout(() => setSaveSuccessToast(null), 3000);
  };

  // Document File Upload & PDF Detection (Max 50MB)
  const handleDocFileUpload = async (file: File) => {
    if (!file) return;
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB limit
    if (file.size > maxSizeBytes) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setSaveErrorToast(
        `File exceeds 50 MB (${sizeMB} MB). Please use a Google Drive link instead of direct upload to save platform storage.`
      );
      setTimeout(() => setSaveErrorToast(null), 8000);
      return;
    }

    setIsDocUploading(true);
    setDocUploadFileName(file.name);
    setNewDocUrl('');
    if (!newDocTitle) {
      setNewDocTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    try {
      const pages = await detectPdfPages(file);
      const formattedSize = formatBytes(file.size);
      setNewDocPages(String(pages));
      setNewDocFileSize(formattedSize);
      setDetectedDocInfoText(`${pages} pages • Size: ${formattedSize}`);

      const res = await uploadFileWithRealProgress(file, 'Files', (info) => {
        setDocUploadProgress(info);
      });

      if (res.success && res.url) {
        setNewDocUrl(res.url);
        setSaveSuccessToast(`Uploaded to ${res.bucket}/${res.path}`);
        setTimeout(() => setSaveSuccessToast(null), 5000);
      } else {
        setNewDocUrl('');
        setSaveErrorToast(`Failed to upload file to Files: ${res.error || 'Unknown error'}`);
        setTimeout(() => setSaveErrorToast(null), 8000);
      }
    } finally {
      setIsDocUploading(false);
    }
  };

  // --- Emergency AI Reset ---
  const handleEmergencyResetAI = async () => {
    if (isResettingAi) return;
    setIsResettingAi(true);
    setAiResetMessage(null);
    setSaveErrorToast(null);
    setGeminiStudentAnswer(null);
    setGeminiPaymentAnswer(null);

    try {
      const res = await fetch('/api/gemini/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const msg = data.message || `Emergency reset complete! Reconnected to ${data.model || 'Gemini 4 Hydrogen'} successfully! ✅`;
        setAiResetMessage({ success: true, text: msg });
        setSaveSuccessToast(msg);
        setTimeout(() => setSaveSuccessToast(null), 4000);
      } else {
        const errMsg = data?.error || 'Unable to reactivate AI connection. Check your API key in Settings (Secrets).';
        setAiResetMessage({ success: false, text: errMsg });
        setSaveErrorToast(errMsg);
        setTimeout(() => setSaveErrorToast(null), 6000);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'A network error occurred while resetting the AI.';
      setAiResetMessage({ success: false, text: errMsg });
      setSaveErrorToast(errMsg);
      setTimeout(() => setSaveErrorToast(null), 6000);
    } finally {
      setIsResettingAi(false);
    }
  };

  const handleAnalyzeStudents = async (customQ?: string) => {
    const q = customQ || geminiStudentPrompt;
    if (!q.trim()) return;

    setIsAnalyzingStudents(true);
    setGeminiStudentAnswer(null);

    try {
      const callAnalyze = async () => {
        const res = await fetch('/api/gemini/analyze-students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q,
            students: allStudents,
          }),
        });
        const data = await res.json();
        return { res, data };
      };

      let { res, data } = await callAnalyze();
      if ((!res.ok || !data.success) && data?.retryable) {
        await new Promise((r) => setTimeout(r, 2000));
        ({ res, data } = await callAnalyze());
      }

      if (res.ok && data.success && data.answer) {
        setGeminiStudentAnswer(data.answer);
      } else {
        setGeminiStudentAnswer(data?.error || 'Could not retrieve student analytics right now.');
      }
    } catch (err: any) {
      setGeminiStudentAnswer(err?.message || 'An error occurred while communicating with the AI model.');
    } finally {
      setIsAnalyzingStudents(false);
    }
  };

  const handleAnalyzePayments = async (questionToAsk?: string) => {
    const q = questionToAsk || geminiPaymentPrompt;
    if (!q.trim()) return;

    setIsAnalyzingPayments(true);
    setGeminiPaymentAnswer(null);

    try {
      const callPayments = async () => {
        const res = await fetch('/api/gemini/analyze-payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q,
            payments: allPayments,
          }),
        });
        const data = await res.json();
        return { res, data };
      };

      let { res, data } = await callPayments();
      if ((!res.ok || !data.success) && data?.retryable) {
        await new Promise((r) => setTimeout(r, 2000));
        ({ res, data } = await callPayments());
      }

      if (res.ok && data.success && data.answer) {
        setGeminiPaymentAnswer(data.answer);
      } else {
        setGeminiPaymentAnswer(data?.error || 'Could not analyze payment data right now, please try again.');
      }
    } catch (err: any) {
      setGeminiPaymentAnswer(err?.message || 'An error occurred while communicating with the AI model.');
    } finally {
      setIsAnalyzingPayments(false);
    }
  };

  // --- CRUD: Students & Camera Scanner ---
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStdName.trim() || !newStdPhone.trim() || !newStdPassword.trim()) {
      setSaveErrorToast('Please enter student name, phone number, and required password.');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }

    const newCode = `AMR-${100 + platformDB.getStudents().length + 1}`;
    const newStudent: UserProfile = {
      id: generateUuid(),
      studentCode: newCode,
      fullName: newStdName.trim(),
      phone: newStdPhone.trim(),
      password: newStdPassword.trim(),
      parentPhone: newStdParentPhone.trim() || undefined,
      governorate: newStdGov,
      grade: newStdGrade,
      role: 'student',
      balance: 0,
      completedLectures: [],
      createdAt: new Date().toISOString(),
    };

    const { supabaseResult } = await platformDB.saveStudentAsync(newStudent);
    if (!supabaseResult.success) {
      setSaveErrorToast(`Failed to save student to Supabase: ${supabaseResult.error || 'Please try again'}`);
      setTimeout(() => setSaveErrorToast(null), 5000);
      return;
    }
    setNewStdName('');
    setNewStdPhone('');
    setNewStdPassword('');
    setNewStdParentPhone('');
    onDataChanged();
    setSaveSuccessToast('Student registered and saved automatically to Supabase! ✓');
    setTimeout(() => setSaveSuccessToast(null), 3000);
  };

  const handleScanRosterWithGemini = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setIsScanningStudents(true);
      try {
        const callScan = async () => {
          const res = await fetch('/api/gemini/scan-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 }),
          });
          const data = await res.json();
          return { res, data };
        };

        let { res, data } = await callScan();
        if ((!res.ok || !data.success) && data?.retryable) {
          await new Promise((r) => setTimeout(r, 2000));
          ({ res, data } = await callScan());
        }

        if (res.ok && data.success && Array.isArray(data.students)) {
          const baseCount = platformDB.getStudents().length;
          await Promise.all(
            data.students.map((st: any, i: number) => {
              const code = `AMR-${100 + baseCount + 1 + i}`;
              return platformDB.saveStudentAsync({
                id: generateUuid(),
                studentCode: code,
                fullName: st.name || 'New Student',
                phone: st.phone || `010${Math.floor(10000000 + Math.random() * 90000000)}`,
                parentPhone: st.parentPhone || undefined,
                governorate: st.governorate || 'Cairo',
                grade: st.grade || newStdGrade,
                role: 'student',
                balance: 0,
                completedLectures: [],
                createdAt: new Date().toISOString(),
              });
            })
          );
          onDataChanged();
          setSaveSuccessToast('Student roster saved to Supabase database successfully! ✓');
          setTimeout(() => setSaveSuccessToast(null), 3500);
        } else {
          setSaveErrorToast(data?.error || 'Could not scan student roster with AI, please try again.');
          setTimeout(() => setSaveErrorToast(null), 6000);
        }
      } catch (err: any) {
        setSaveErrorToast(err?.message || 'An error occurred while scanning the student roster.');
        setTimeout(() => setSaveErrorToast(null), 6000);
      } finally {
        setIsScanningStudents(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteStudent = (id: string) => {
    platformDB.deleteStudent(id);
    onDataChanged();
  };

  const handleOpenGiftModal = (student: UserProfile) => {
    setGiftModalStudent(student);
    setGiftSelectedCourseIds([...(student.enrolledCourses || [])]);
    setGiftSelectedDocIds([...(student.grantedDocuments || [])]);
    setGiftSearchQuery('');
  };

  const handleConfirmGiftContent = async () => {
    if (!giftModalStudent) return;
    setIsSavingGift(true);
    try {
      const { supabaseResult } = await platformDB.grantContentToStudentAsync(
        giftModalStudent.id,
        giftSelectedCourseIds,
        giftSelectedDocIds
      );
      if (!supabaseResult.success) {
        setSaveErrorToast(supabaseResult.error || 'Failed to save access grants in Supabase.');
        setTimeout(() => setSaveErrorToast(null), 5000);
        return;
      }
      onDataChanged();
      setSaveSuccessToast(
        `Selected content granted to (${giftModalStudent.fullName}) for free and saved to Supabase ✓`
      );
      setTimeout(() => setSaveSuccessToast(null), 4000);
      setGiftModalStudent(null);
    } finally {
      setIsSavingGift(false);
    }
  };

  const handleOpenBalanceModal = (student: UserProfile) => {
    setBalanceModalStudent(student);
    setBalanceActionMode('add');
    setBalanceAmountInput('100');
  };

  const handleConfirmManualBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceModalStudent) return;
    const rawNum = parseFloat(balanceAmountInput);
    if (isNaN(rawNum) || rawNum < 0) {
      setSaveErrorToast('Please enter a valid amount');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }
    const nextBalance =
      balanceActionMode === 'add'
        ? (balanceModalStudent.balance || 0) + rawNum
        : rawNum;

    setIsSavingBalance(true);
    try {
      const { supabaseResult } = await platformDB.updateStudentBalanceAsync(
        balanceModalStudent.id,
        nextBalance
      );
      if (!supabaseResult.success) {
        setSaveErrorToast(supabaseResult.error || 'Failed to update balance in Supabase.');
        setTimeout(() => setSaveErrorToast(null), 5000);
        return;
      }
      onDataChanged();
      setSaveSuccessToast(
        `Student (${balanceModalStudent.fullName}) balance updated to ${nextBalance} EGP and saved to Supabase ✓`
      );
      setTimeout(() => setSaveSuccessToast(null), 4000);
      setBalanceModalStudent(null);
    } finally {
      setIsSavingBalance(false);
    }
  };

  const handleReviewPaymentAction = async (paymentId: string, status: 'approved' | 'rejected') => {
    setReviewingPaymentId(paymentId);
    try {
      const { supabaseResult } = await platformDB.reviewPaymentAsync(paymentId, status);
      onDataChanged();
      if (supabaseResult.success) {
        setSaveSuccessToast(
          status === 'approved'
            ? 'Receipt approved and student balance credited in Supabase successfully ✓'
            : 'Payment request rejected and status updated in Supabase ✓'
        );
        setTimeout(() => setSaveSuccessToast(null), 4000);
      } else {
        setSaveErrorToast(supabaseResult.error || 'Failed to update payment status in Supabase.');
        setTimeout(() => setSaveErrorToast(null), 5000);
      }
    } finally {
      setReviewingPaymentId(null);
    }
  };

  // --- Payment Methods CRUD (Admin & Secretary Only) ---
  const handleResetPaymentMethodForm = () => {
    setEditingMethodId(null);
    setMethodNameInput('');
    setMethodAccountInput('');
    setMethodInstructionsInput('');
    setMethodIconType('phone');
    setMethodAccentColor('amber');
    setMethodIsActive(true);
  };

  const handleEditPaymentMethod = (method: PaymentMethodItem) => {
    setEditingMethodId(method.id);
    setMethodNameInput(method.name);
    setMethodAccountInput(method.accountValue);
    setMethodInstructionsInput(method.instructions || '');
    setMethodIconType(method.iconType || 'phone');
    setMethodAccentColor(method.accentColor || 'amber');
    setMethodIsActive(method.isActive);
  };

  const handleSavePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!methodNameInput.trim() || !methodAccountInput.trim()) {
      setSaveErrorToast('Please enter the payment method name and transfer number/details');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }
    setIsSavingMethod(true);
    try {
      const existing = editingMethodId
        ? paymentMethodsList.find((m) => m.id === editingMethodId)
        : null;
      const item: PaymentMethodItem = {
        id: editingMethodId || `pm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: methodNameInput.trim(),
        accountValue: methodAccountInput.trim(),
        instructions: methodInstructionsInput.trim() || undefined,
        iconType: methodIconType,
        accentColor: methodAccentColor,
        isActive: methodIsActive,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      const { list, supabaseResult } = await platformDB.savePaymentMethodAsync(item);
      setPaymentMethodsList(list);
      onDataChanged();
      handleResetPaymentMethodForm();
      setSaveSuccessToast(
        supabaseResult.success
          ? `Payment method "${item.name}" ${editingMethodId ? 'updated' : 'added'} and saved to Supabase ✓`
          : `Payment method "${item.name}" ${editingMethodId ? 'updated' : 'added'} locally`
      );
      setTimeout(() => setSaveSuccessToast(null), 4000);
    } finally {
      setIsSavingMethod(false);
    }
  };

  const handleTogglePaymentMethodActive = async (method: PaymentMethodItem) => {
    const updated: PaymentMethodItem = { ...method, isActive: !method.isActive };
    const { list } = await platformDB.savePaymentMethodAsync(updated);
    setPaymentMethodsList(list);
    onDataChanged();
  };

  const handleDeletePaymentMethod = async (id: string) => {
    setDeletingMethodId(id);
    try {
      const { list } = await platformDB.deletePaymentMethodAsync(id);
      setPaymentMethodsList([...list]);
      if (editingMethodId === id) {
        handleResetPaymentMethodForm();
      }
      onDataChanged();
      setSaveSuccessToast('Payment method permanently deleted from platform and Supabase ✓');
      setTimeout(() => setSaveSuccessToast(null), 4000);
    } finally {
      setDeletingMethodId(null);
    }
  };

  // --- Direct Charge Any Student on Platform ---
  const handleDirectChargeStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawStudents = platformDB.getStudents();
    const targetStudent = rawStudents.find((s) => s.id === directChargeStudentId);
    if (!targetStudent) {
      setSaveErrorToast('Please select the target student first');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }
    const rawNum = parseFloat(directChargeAmount);
    if (isNaN(rawNum) || rawNum < 0) {
      setSaveErrorToast('Please enter a valid amount');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }
    const nextBalance =
      directChargeMode === 'add' ? (targetStudent.balance || 0) + rawNum : rawNum;

    setIsSavingDirectCharge(true);
    try {
      const { supabaseResult } = await platformDB.updateStudentBalanceAsync(
        targetStudent.id,
        nextBalance
      );
      if (!supabaseResult.success) {
        setSaveErrorToast(supabaseResult.error || 'Failed to recharge student balance in Supabase.');
        setTimeout(() => setSaveErrorToast(null), 5000);
        return;
      }
      onDataChanged();
      setSaveSuccessToast(
        `Student (${targetStudent.fullName}) wallet updated to ${nextBalance} EGP and saved to Supabase ✓`
      );
      setTimeout(() => setSaveSuccessToast(null), 4000);
    } finally {
      setIsSavingDirectCharge(false);
    }
  };

  // --- Bulk & Custom Redeem Codes Generator ---
  const handleGenerateBulkCodes = (e: React.FormEvent) => {
    e.preventDefault();
    const count = Math.min(1000000, Math.max(1, codeCount));
    const amountVal = parseFloat(codeAmount) || 50;
    const maxUsesVal = parseInt(codeMaxUses) || 1;
    const prefixClean = (codePrefix.trim() || 'AMR').toUpperCase();

    const targetCourse = allCourses.find((c) => c.id === selectedCourseForCode);
    const linkedMethod = paymentMethodsList.find((m) => m.id === codePaymentMethodId);

    const newCodes: RedeemCode[] = [];
    const codeStrings: string[] = [];

    for (let i = 0; i < count; i++) {
      const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
      const numPart = Math.floor(1000 + Math.random() * 9000);
      const code = `${prefixClean}-${randomStr}-${numPart}`;
      newCodes.push({
        code,
        amount: codeType === 'course' && targetCourse ? targetCourse.price : amountVal,
        maxUses: maxUsesVal,
        usedCount: 0,
        codeType,
        courseId: codeType === 'course' ? selectedCourseForCode : undefined,
        targetCourseTitle: codeType === 'course' && targetCourse ? targetCourse.title : undefined,
        paymentMethodId: linkedMethod?.id,
        paymentMethodName: linkedMethod?.name,
        createdAt: new Date().toISOString(),
      });
      codeStrings.push(code);
    }

    platformDB.saveRedeemCodes(newCodes);
    setGeneratedBatchCodes(codeStrings);
    onDataChanged();
    setSaveSuccessToast(`Generated ${newCodes.length} real codes and activated them immediately ✓`);
    setTimeout(() => setSaveSuccessToast(null), 4000);
  };

  const handleCreateCustomCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = customCodeString.trim().toUpperCase().replace(/\s+/g, '-');
    if (!cleanCode) {
      setSaveErrorToast('Please enter the custom code first');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }
    const targetCourse = allCourses.find((c) => c.id === customCodeCourseId);
    const linkedMethod = paymentMethodsList.find((m) => m.id === customCodePaymentMethodId);
    const amountVal = parseFloat(customCodeAmount) || 50;
    const maxUsesVal = Math.max(1, parseInt(customCodeMaxUses) || 1);

    const customCode: RedeemCode = {
      code: cleanCode,
      amount: customCodeType === 'course' && targetCourse ? targetCourse.price : amountVal,
      maxUses: maxUsesVal,
      usedCount: 0,
      codeType: customCodeType,
      courseId: customCodeType === 'course' ? customCodeCourseId : undefined,
      targetCourseTitle: customCodeType === 'course' && targetCourse ? targetCourse.title : undefined,
      paymentMethodId: linkedMethod?.id,
      paymentMethodName: linkedMethod?.name,
      createdAt: new Date().toISOString(),
    };

    platformDB.saveRedeemCodes([customCode]);
    setGeneratedBatchCodes([cleanCode]);
    setCustomCodeString('');
    onDataChanged();
    setSaveSuccessToast(`Custom code "${cleanCode}" created and activated on platform & Supabase ✓`);
    setTimeout(() => setSaveSuccessToast(null), 4000);
  };

  const handleCopyGeneratedCodes = () => {
    if (generatedBatchCodes.length === 0) return;
    navigator.clipboard.writeText(generatedBatchCodes.join('\n'));
    setCopiedCodesSuccess(true);
    setTimeout(() => setCopiedCodesSuccess(false), 2000);
  };

  // --- Voice Recording & Audio Upload for Notifications (Uploaded directly to Supabase Storage 'Files') ---
  const pickSupportedNotifAudioMime = (): string | undefined => {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return undefined;
    }
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return list.find((m) => MediaRecorder.isTypeSupported(m));
  };

  const handleStartVoiceRecording = async () => {
    setVoiceRecorderError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setVoiceRecorderError('Your browser does not support direct voice recording. You can upload an audio file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];

      const mimeCandidate = pickSupportedNotifAudioMime();
      let recorder: MediaRecorder;
      try {
        recorder = mimeCandidate
          ? new MediaRecorder(stream, { mimeType: mimeCandidate, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordingChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }

        if (blob.size === 0) return;
        const audioFile = new File([blob], `notif_voice_${Date.now()}.${ext}`, { type: mimeType });
        setIsUploadingNotifAudio(true);
        try {
          const uploadRes = await uploadFileWithRealProgress(audioFile, 'Files', undefined, 'audio_messages');
          if (uploadRes.success && uploadRes.url) {
            setNotifAudioUrl(uploadRes.url);
            setNotifAudioDuration(recordingSecondsRef.current);
          } else {
            setVoiceRecorderError(`Failed to upload voice recording to Supabase: ${uploadRes.error || 'Unknown error'}`);
          }
        } finally {
          setIsUploadingNotifAudio(false);
        }
      };

      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
      setIsRecordingVoice(true);
      recorder.start(250);

      recordingTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
        if (recordingSecondsRef.current >= 120) {
          handleStopVoiceRecording();
        }
      }, 1000);
    } catch {
      setVoiceRecorderError('Could not access microphone. Please allow microphone permission or upload an audio file.');
      setIsRecordingVoice(false);
    }
  };

  const handleStopVoiceRecording = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecordingVoice(false);
  };

  const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setVoiceRecorderError(null);
    if (file.size > 15 * 1024 * 1024) {
      setVoiceRecorderError('Audio file is too large (max 15 MB).');
      return;
    }
    setIsUploadingNotifAudio(true);
    try {
      const uploadRes = await uploadFileWithRealProgress(file, 'Files', undefined, 'audio_messages');
      if (uploadRes.success && uploadRes.url) {
        setNotifAudioUrl(uploadRes.url);
        setNotifAudioDuration(0);
      } else {
        setVoiceRecorderError(`Failed to upload audio file to Supabase: ${uploadRes.error || 'Unknown error'}`);
      }
    } finally {
      setIsUploadingNotifAudio(false);
    }
  };

  const handleClearNotifAudio = () => {
    setNotifAudioUrl('');
    setNotifAudioDuration(0);
    setRecordingSeconds(0);
    setVoiceRecorderError(null);
  };

  // --- Broadcast Notification (Text + Optional/Standalone Voice Message) ---
  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim()) return;
    if (!notifContent.trim() && !notifAudioUrl) {
      setSaveErrorToast('Please write a message or record a voice note before sending');
      setTimeout(() => setSaveErrorToast(null), 4000);
      return;
    }

    setIsSendingNotif(true);
    try {
      const { supabaseResult } = await platformDB.addNotificationAsync({
        id: generateUuid(),
        title: notifTitle.trim(),
        content: notifContent.trim() || 'Recorded voice message from Miss Asmaa 🎙️',
        targetGrade: notifTargetGrade,
        isUrgent: notifIsUrgent,
        audioUrl: notifAudioUrl || undefined,
        audioDurationSeconds: notifAudioDuration || undefined,
        createdAt: new Date().toISOString(),
        isRead: false,
      });

      if (!supabaseResult.success) {
        setSaveErrorToast(`Failed to save notification to Supabase: ${supabaseResult.error || 'Unknown error'}`);
        setTimeout(() => setSaveErrorToast(null), 6500);
        return;
      }

      setNotifTitle('');
      setNotifContent('');
      handleClearNotifAudio();
      onDataChanged();
      setSaveSuccessToast('Notification broadcasted to students and saved to Supabase ✓');
      setTimeout(() => setSaveSuccessToast(null), 4000);
    } finally {
      setIsSendingNotif(false);
    }
  };

  // --- Support Inbox & Q&A Reply Composer Handlers ---
  const clearSupportReplyDraft = () => {
    if (supportReplyImagePreview && supportReplyImagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(supportReplyImagePreview);
    }
    if (supportReplyAudioPreview && supportReplyAudioPreview.startsWith('blob:')) {
      URL.revokeObjectURL(supportReplyAudioPreview);
    }
    setSupportReplyText('');
    setSupportReplyImageFile(null);
    setSupportReplyImagePreview('');
    setSupportReplyAudioFile(null);
    setSupportReplyAudioPreview('');
    setSupportReplyAudioDuration(0);
    setSupportRecSeconds(0);
    setSupportVoiceError(null);
    setSupportUploadProgress(null);
  };

  const handleOpenSupportReply = (threadId: string) => {
    if (activeSupportThreadId === threadId) {
      clearSupportReplyDraft();
      setActiveSupportThreadId(null);
      return;
    }
    clearSupportReplyDraft();
    setActiveSupportThreadId(threadId);
  };

  const handleSelectSupportImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSupportVoiceError(null);
    if (!file.type.startsWith('image/')) {
      setSupportVoiceError('Please select a valid image file (PNG / JPG / WEBP).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setSupportVoiceError('Image size exceeds 15 MB.');
      return;
    }
    if (supportReplyImagePreview && supportReplyImagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(supportReplyImagePreview);
    }
    setSupportReplyImageFile(file);
    setSupportReplyImagePreview(URL.createObjectURL(file));
  };

  const handleSelectSupportAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSupportVoiceError(null);
    if (file.size > 15 * 1024 * 1024) {
      setSupportVoiceError('Audio file exceeds 15 MB.');
      return;
    }
    if (supportReplyAudioPreview && supportReplyAudioPreview.startsWith('blob:')) {
      URL.revokeObjectURL(supportReplyAudioPreview);
    }
    setSupportReplyAudioFile(file);
    setSupportReplyAudioPreview(URL.createObjectURL(file));
    setSupportReplyAudioDuration(0);
  };

  const handleStartSupportVoiceRecording = async () => {
    setSupportVoiceError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setSupportVoiceError('Your browser does not support direct recording; you can upload an audio file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      supportMediaStreamRef.current = stream;
      supportChunksRef.current = [];
      const mimeCandidate = pickSupportedNotifAudioMime();
      let recorder: MediaRecorder;
      try {
        recorder = mimeCandidate
          ? new MediaRecorder(stream, { mimeType: mimeCandidate, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      supportMediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          supportChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(supportChunksRef.current, { type: mimeType });
        if (supportMediaStreamRef.current) {
          supportMediaStreamRef.current.getTracks().forEach((t) => t.stop());
          supportMediaStreamRef.current = null;
        }
        if (blob.size === 0) return;
        const file = new File([blob], `teacher_reply_${Date.now()}.${ext}`, { type: mimeType });
        setSupportReplyAudioFile(file);
        setSupportReplyAudioPreview((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return URL.createObjectURL(file);
        });
        setSupportReplyAudioDuration(supportSecondsRef.current);
      };

      supportSecondsRef.current = 0;
      setSupportRecSeconds(0);
      setIsRecordingSupportVoice(true);
      recorder.start(250);

      supportTimerRef.current = window.setInterval(() => {
        supportSecondsRef.current += 1;
        setSupportRecSeconds(supportSecondsRef.current);
        if (supportSecondsRef.current >= 180) {
          handleStopSupportVoiceRecording();
        }
      }, 1000);
    } catch {
      setSupportVoiceError('Could not access microphone. Please allow microphone permission or upload an audio file.');
      setIsRecordingSupportVoice(false);
    }
  };

  const handleStopSupportVoiceRecording = () => {
    if (supportTimerRef.current) {
      window.clearInterval(supportTimerRef.current);
      supportTimerRef.current = null;
    }
    if (supportMediaRecorderRef.current && supportMediaRecorderRef.current.state !== 'inactive') {
      try {
        supportMediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecordingSupportVoice(false);
  };

  const handleSendSupportReply = async (e: React.FormEvent, thread: SupportThread) => {
    e.preventDefault();
    setSupportVoiceError(null);
    if (isRecordingSupportVoice) {
      setSupportVoiceError('Stop voice recording first before sending your reply.');
      return;
    }
    if (!supportReplyText.trim() && !supportReplyImageFile && !supportReplyAudioFile) {
      setSupportVoiceError('Please write a text reply, attach an image, or record a voice message.');
      return;
    }

    setIsSendingSupportReply(true);
    setSupportUploadProgress(null);

    try {
      let uploadedImageUrl: string | undefined;
      let uploadedAudioUrl: string | undefined;

      if (supportReplyImageFile) {
        const imgRes = await uploadFileWithRealProgress(
          supportReplyImageFile,
          'Files',
          (info) => setSupportUploadProgress(info),
          'support_media'
        );
        if (!imgRes.success || !imgRes.url) {
          setSaveErrorToast(`Failed to upload reply image to Supabase: ${imgRes.error || 'Unknown error'}`);
          setTimeout(() => setSaveErrorToast(null), 6500);
          return;
        }
        uploadedImageUrl = imgRes.url;
      }

      if (supportReplyAudioFile) {
        const audioRes = await uploadFileWithRealProgress(
          supportReplyAudioFile,
          'Files',
          (info) => setSupportUploadProgress(info),
          'support_media'
        );
        if (!audioRes.success || !audioRes.url) {
          setSaveErrorToast(`Failed to upload voice reply to Supabase: ${audioRes.error || 'Unknown error'}`);
          setTimeout(() => setSaveErrorToast(null), 6500);
          return;
        }
        uploadedAudioUrl = audioRes.url;
      }

      const staffUser = platformDB.getCurrentUser();
      const replyMsg: SupportMessage = {
        id: generateUuid(),
        senderRole: 'admin',
        senderName: staffUser?.fullName || settings.teacherName || 'Miss Asmaa',
        text: supportReplyText.trim() || undefined,
        imageUrl: uploadedImageUrl,
        audioUrl: uploadedAudioUrl,
        audioDurationSeconds: supportReplyAudioDuration || undefined,
        createdAt: new Date().toISOString(),
      };

      const { supabaseResult } = await platformDB.appendSupportMessageAsync(
        thread.id,
        replyMsg,
        'answered'
      );

      if (!supabaseResult.success) {
        setSaveErrorToast(`Failed to save reply in Supabase: ${supabaseResult.error || 'Unknown error'}`);
        setTimeout(() => setSaveErrorToast(null), 6500);
        return;
      }

      clearSupportReplyDraft();
      setActiveSupportThreadId(null);
      onDataChanged();
      setSaveSuccessToast(`Reply sent to ${thread.studentName} and saved to Supabase ✓`);
      setTimeout(() => setSaveSuccessToast(null), 4000);
    } catch (err: any) {
      setSaveErrorToast(`Error while sending reply: ${err?.message || err}`);
      setTimeout(() => setSaveErrorToast(null), 6000);
    } finally {
      setIsSendingSupportReply(false);
      setSupportUploadProgress(null);
    }
  };

  const handleRefreshSupportInbox = async () => {
    setIsRefreshingSupport(true);
    try {
      await platformDB.syncWithSupabase();
      onDataChanged();
      setSaveSuccessToast('Support inbox refreshed from Supabase ✓');
      setTimeout(() => setSaveSuccessToast(null), 2500);
    } finally {
      setIsRefreshingSupport(false);
    }
  };

  const handleDeleteSupportThreadAdmin = async (threadId: string) => {
    setDeletingSupportId(threadId);
    try {
      const { supabaseResult } = await platformDB.deleteSupportThreadAsync(threadId);
      if (!supabaseResult.success) {
        setSaveErrorToast(`Failed to delete thread from Supabase: ${supabaseResult.error || 'Unknown error'}`);
        setTimeout(() => setSaveErrorToast(null), 6000);
        return;
      }
      if (activeSupportThreadId === threadId) {
        clearSupportReplyDraft();
        setActiveSupportThreadId(null);
      }
      onDataChanged();
      setSaveSuccessToast('Conversation and attachments deleted from Supabase ✓');
      setTimeout(() => setSaveSuccessToast(null), 3000);
    } finally {
      setDeletingSupportId(null);
    }
  };

  // --- Honor Students CRUD ---
  const handleAddHonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!honorName.trim()) return;

    const { supabaseResult } = await platformDB.saveHonorStudentAsync({
      id: generateUuid(),
      studentName: honorName.trim(),
      governorate: honorGov,
      score: parseInt(honorScore) || 60,
      maxScore: 60,
      rank: parseInt(honorRank) || 1,
      titleBadge: honorTitle.trim(),
      createdAt: new Date().toISOString(),
    });

    if (!supabaseResult.success) {
      setSaveErrorToast(`Failed to save honor student in Supabase: ${supabaseResult.error || 'Unknown error'}`);
      setTimeout(() => setSaveErrorToast(null), 6000);
      return;
    }

    setHonorName('');
    onDataChanged();
    setSaveSuccessToast('Student added to the Honor Board and saved to Supabase 🏆');
    setTimeout(() => setSaveSuccessToast(null), 3500);
  };

  // --- Secretary CRUD ---
  const handleAddSecretary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!secName.trim() || !secPhone.trim()) return;

    platformDB.saveSecretary({
      id: generateUuid(),
      name: secName.trim(),
      phone: secPhone.trim(),
      role: 'Certified Secretary',
      notes: secNotes.trim(),
      permissions: {
        manageStudents: true,
        manageExams: true,
        managePayments: true,
        manageCourses: true,
      },
      createdAt: new Date().toISOString(),
    });

    setSecName('');
    setSecPhone('');
    onDataChanged();
  };

  // --- Settings & Dynamic Academic Year ---
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const { settings: updated, supabaseResult } = await platformDB.updateSettingsAsync({
      academicYear: tempYear.trim() || '2026',
      platformName: tempPlatformName.trim() || 'English with Miss Asmaa',
      colorTheme: tempColorTheme,
      pageLayout: tempPageLayout,
      supabaseUrl: tempSupabaseUrl.trim(),
      supabaseAnonKey: tempSupabaseKey.trim(),
    });
    if (tempSupabaseUrl && tempSupabaseKey) {
      saveSupabaseCredentials(tempSupabaseUrl.trim(), tempSupabaseKey.trim());
    }
    onSettingsUpdated(updated);
    onDataChanged();
    if (!supabaseResult.success) {
      setSaveErrorToast(`Updated locally, but failed to sync with Supabase: ${supabaseResult.error || 'Check connection'}`);
      setTimeout(() => setSaveErrorToast(null), 6000);
    } else {
      setSettingsSavedSuccess(true);
      setSaveSuccessToast('Settings saved and synced with Supabase successfully ✓');
      setTimeout(() => setSaveSuccessToast(null), 3500);
      setTimeout(() => setSettingsSavedSuccess(false), 4000);
    }
  };

  const handleTestSupabase = async () => {
    if (!tempSupabaseUrl || !tempSupabaseKey) {
      setSupabaseTestMsg({ success: false, text: 'Please enter the URL and Anon Key first' });
      return;
    }
    setSupabaseTestMsg({ success: true, text: 'Testing connection to Supabase database...' });
    const res = await testSupabaseConnection(tempSupabaseUrl, tempSupabaseKey);
    setSupabaseTestMsg({ success: res.success, text: res.message });
  };

  const allCourses = platformDB.getCourses();
  const allDocuments = platformDB.getDocuments();
  const allExams = platformDB.getExams();
  const allSubmissions = platformDB.getSubmissions();
  const allStudents = platformDB.getStudents().filter((s) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase();
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.phone.includes(q) ||
      s.studentCode.toLowerCase().includes(q)
    );
  });
  const allPayments = platformDB.getPayments();
  const allCodes = platformDB.getRedeemCodes().filter((c) => {
    if (!codeSearch.trim()) return true;
    return c.code.toLowerCase().includes(codeSearch.toLowerCase());
  });
  const allHonor = platformDB.getHonorStudents();
  const allSecretaries = platformDB.getSecretaries();
  const allNotifications = platformDB.getNotifications();
  const allSupportThreads = platformDB.getSupportThreads();
  const openSupportCount = allSupportThreads.filter((t) => t.status === 'open').length;
  const filteredSupportThreads = allSupportThreads.filter((t) => {
    if (supportFilter === 'open' && t.status !== 'open') return false;
    if (supportFilter === 'answered' && t.status !== 'answered') return false;
    if (!supportSearch.trim()) return true;
    const q = supportSearch.toLowerCase();
    return (
      (t.studentName || '').toLowerCase().includes(q) ||
      (t.studentPhone || '').toLowerCase().includes(q) ||
      (t.studentCode || '').toLowerCase().includes(q) ||
      (t.messages || []).some((m) => (m.text || '').toLowerCase().includes(q))
    );
  });

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        isFullscreen={true}
        closeOnBackdropClick={false}
        overlayClassName="z-[55] bg-white dark:bg-[#0B1120]"
        panelClassName="bg-white dark:bg-[#0B1120]"
        headerClassName="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
        bodyClassName="p-4 sm:p-6 space-y-6"
        closeButtonClassName="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-red-500/10 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white border border-red-500/30"
        closeButtonAriaLabel="Close Admin Dashboard"
        closeButtonTitle="Close Admin Dashboard and return to home (Esc)"
        floatingContent={
          <>
            {/* Floating Action Success Toast */}
            {saveSuccessToast && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-xs shadow-2xl flex items-center gap-2 border border-emerald-400 animate-in fade-in slide-in-from-top-3">
                <CheckCircle className="w-4 h-4 text-white" />
                <span>{saveSuccessToast}</span>
              </div>
            )}

            {/* Floating Action Error Toast */}
            {saveErrorToast && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-rose-600 text-white font-bold text-xs shadow-2xl flex items-center gap-2.5 border border-rose-400 animate-in fade-in slide-in-from-top-3 max-w-xl text-center">
                <AlertCircle className="w-5 h-5 text-white shrink-0" />
                <span>{saveErrorToast}</span>
              </div>
            )}
          </>
        }
        headerContent={
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold">
                  Full Admin
                </span>
                <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-bold">
                  Auto-Saved ✓
                </span>
                <span className="hidden sm:inline text-xs text-slate-600 dark:text-slate-400">
                  Current Academic Year: <strong className="text-amber-600 dark:text-amber-400">{settings.academicYear}</strong>
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                Admin Dashboard - English with Miss Asmaa
              </h2>
            </div>
          </div>
        }
        tabs={
          <div className="bg-slate-100/80 dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs font-semibold">
            {[
              { id: 'courses', label: 'Videos & Courses', icon: Video },
              { id: 'documents', label: 'Files & Study Notes', icon: FileText },
              { id: 'exams', label: 'Smart Exams', icon: GraduationCap },
              { id: 'assignments', label: 'Assignments & Sheets', icon: CheckSquare },
              { id: 'gemini', label: 'Real Gemini AI Panel', icon: Bot },
              { id: 'students', label: 'Students & Permissions', icon: Users },
              { id: 'students-data', label: 'Student Data Hub', icon: Users },
              {
                id: 'payments',
                label: `Payments & Receipts${
                  allPayments.filter((p) => p.status === 'pending').length > 0
                    ? ` (${allPayments.filter((p) => p.status === 'pending').length})`
                    : ''
                }`,
                icon: CreditCard,
              },
              { id: 'notifications', label: 'Broadcast Notifications', icon: Bell },
              {
                id: 'support',
                label: `Support & Student Q&A${openSupportCount > 0 ? ` (${openSupportCount})` : ''}`,
                icon: MessageCircle,
              },
              { id: 'honor', label: 'Honor Board', icon: Trophy },
              { id: 'secretaries', label: 'Secretaries & Assistants', icon: UserCheck },
              { id: 'codes', label: 'Recharge Codes (up to 10,000)', icon: Zap },
              { id: 'settings', label: 'Theme, Layout & Year', icon: Sliders },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const showGrievanceBadge = tab.id === 'students-data' && unreadGrievancesCount > 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as AdminTabId)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {showGrievanceBadge && (
                    <span
                      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-mono font-black"
                      title={`${unreadGrievancesCount} new appeals`}
                    >
                      {unreadGrievancesCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        }
      >
          {/* TAB 1: COURSES & VIDEOS */}
          {activeTab === 'courses' && (
            <div className="space-y-6">
              {/* Top Action Header with "Add New Course" button */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    <span>Manage Courses & Educational Content ({allCourses.length})</span>
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Add new courses, build custom lessons and sections freely, save drafts, and choose publish destinations when ready.
                  </p>
                </div>

                {!isCourseEditorOpen && (
                  <button
                    type="button"
                    onClick={handleOpenNewCourseEditor}
                    className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg flex items-center gap-2 transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add New Course</span>
                  </button>
                )}
              </div>

              {/* Add / Edit Course Screen */}
              {isCourseEditorOpen && (
                <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-amber-500/40 dark:border-amber-500/30 shadow-xl space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Plus className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                      <span>
                        {editingCourseId
                          ? 'Edit Course, Drafts & Sections'
                          : 'Add New Course'}
                      </span>
                    </h3>
                    <button
                      type="button"
                      onClick={handleCancelEditCourse}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                    >
                      Close Editor
                    </button>
                  </div>

                  <form onSubmit={handleAddCourse} noValidate className="space-y-4">
                    {/* Core Course Fields: Course Name, Grade, Unit */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Course Name: <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newCourseTitle}
                          onChange={(e) => setNewCourseTitle(e.target.value)}
                          placeholder="e.g., Unit 1 — Present & Past Tenses Mastery"
                          className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Academic Grade:
                        </label>
                        <select
                          value={newCourseGrade}
                          onChange={(e) => setNewCourseGrade(e.target.value)}
                          className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                        >
                          <option value="3rd Secondary">{`3rd Secondary (${settings.academicYear})`}</option>
                          <option value="2nd Secondary">2nd Secondary</option>
                          <option value="1st Secondary">1st Secondary</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Unit / Module Name (Optional):
                        </label>
                        <input
                          type="text"
                          value={newCourseChapter}
                          onChange={(e) => setNewCourseChapter(e.target.value)}
                          placeholder="e.g., Unit 1"
                          className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Description & Instructions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Description:
                        </label>
                        <textarea
                          rows={3}
                          value={newCourseDesc}
                          onChange={(e) => setNewCourseDesc(e.target.value)}
                          placeholder="Write course overview and what students will learn..."
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Student Instructions (Optional):
                        </label>
                        <textarea
                          rows={3}
                          value={newCourseInstructions}
                          onChange={(e) => setNewCourseInstructions(e.target.value)}
                          placeholder="Notes or instructions shown inside the course page..."
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Cover Image & Optional Schedule/Pricing */}
                    <div className="p-4 bg-white dark:bg-slate-950/70 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Course Cover Image:
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={newCourseCoverUrl}
                              onChange={(e) => setNewCourseCoverUrl(e.target.value)}
                              placeholder="Course cover image URL"
                              className="flex-1 min-w-[160px] min-h-[40px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                            />
                            <label className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer inline-flex items-center shrink-0">
                              Upload Image
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file) return;
                                  const res = await uploadFileWithRealProgress(file, 'Files', (info) => {
                                    setCoverUploadProgress(info);
                                  });
                                  if (res.success && res.url) {
                                    setNewCourseCoverUrl(res.url);
                                    setSaveSuccessToast(`Uploaded to ${res.bucket}/${res.path}`);
                                    setTimeout(() => setSaveSuccessToast(null), 5000);
                                  } else {
                                    setSaveErrorToast(`Failed to upload cover image to Files: ${res.error || 'Unknown error'}`);
                                    setTimeout(() => setSaveErrorToast(null), 8000);
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <UploadProgressBar info={coverUploadProgress} className="mt-2" />
                          <div className="flex items-center gap-2 mt-2">
                            {COURSE_COVER_IMAGES.map((imgUrl, idx) => (
                              <button
                                key={imgUrl}
                                type="button"
                                onClick={() => setNewCourseCoverUrl(imgUrl)}
                                className={`relative w-16 h-10 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                                  newCourseCoverUrl === imgUrl
                                    ? 'border-amber-500 ring-2 ring-amber-500/40'
                                    : 'border-slate-300 dark:border-slate-700 opacity-75 hover:opacity-100'
                                }`}
                                title={`Course Cover ${idx + 1}`}
                              >
                                <img src={imgUrl} alt={`Cover ${idx + 1}`} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                              Schedule / Course Dates (Optional):
                            </label>
                            <input
                              type="text"
                              value={newCourseScheduleText}
                              onChange={(e) => setNewCourseScheduleText(e.target.value)}
                              placeholder="e.g., Sat & Tue • Available all year"
                              className="w-full min-h-[40px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Pricing:
                              </label>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setNewCourseIsFree(true)}
                                  className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                                    newCourseIsFree
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  Free
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setNewCourseIsFree(false)}
                                  className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                                    !newCourseIsFree
                                      ? 'bg-amber-500 text-slate-950'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  Paid
                                </button>
                              </div>
                            </div>

                            {!newCourseIsFree && (
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                  Price (EGP):
                                </label>
                                <input
                                  type="number"
                                  value={newCoursePrice}
                                  onChange={(e) => setNewCoursePrice(e.target.value)}
                                  className="w-full min-h-[38px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                            )}

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Duration (mins):
                              </label>
                              <input
                                type="number"
                                value={newCourseDuration}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNewCourseDuration(val);
                                  const mins = Math.max(0, parseInt(val, 10) || 0);
                                  setNewCourseDurationSeconds(mins > 0 ? mins * 60 : 0);
                                }}
                                placeholder="--:--:--"
                                className="w-full min-h-[38px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dynamic Lessons, Unlimited Custom Sections & Multi-Item Editor */}
                    <AdminCourseHierarchyEditor
                      lessons={newCourseLessons}
                      onChangeLessons={setNewCourseLessons}
                      allDocuments={allDocuments}
                      allExams={allExams}
                      onNotify={(type, msg) => {
                        if (type === 'error') {
                          setSaveErrorToast(msg);
                          setTimeout(() => setSaveErrorToast(null), 5000);
                        } else {
                          setSaveSuccessToast(msg);
                          setTimeout(() => setSaveSuccessToast(null), 3500);
                        }
                      }}
                    />

                    {/* Bottom Action Buttons: Cancel | Save as Draft | Save & Publish */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={handleCancelEditCourse}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          disabled={isSavingCourseAction || isCourseUploading}
                          onClick={() => void handleSaveCourseAsDraft()}
                          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          {isSavingCourseAction && <Loader2 className="w-4 h-4 animate-spin" />}
                          <span>Save as Draft</span>
                        </button>

                        <button
                          type="submit"
                          disabled={isSavingCourseAction || isCourseUploading}
                          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-60 text-slate-950 font-black text-xs shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                        >
                          {(isSavingCourseAction || isCourseUploading) && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                          <span>Save & Publish ✨</span>
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}

              {/* Courses List with Preview, Edit, and Confirmed Delete */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Current Courses ({allCourses.length})
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Edit any course, save as draft, publish lessons to students, or delete
                  </span>
                </div>

                {allCourses.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500 dark:text-slate-400">
                    No courses added yet. Click &quot;Add New Course&quot; to get started.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {allCourses.map((c) => {
                      const liveCount = getCourseLessons(c).length;
                      const hasDraft = Array.isArray(c.draftLessons) && c.draftLessons.length > 0;

                      return (
                        <div
                          key={c.id}
                          className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white text-sm">
                                {c.title}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 text-[10px]">
                                {c.chapter}
                              </span>
                              {c.isFree ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                                  Free
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                                  {c.price} EGP
                                </span>
                              )}
                              {hasDraft && (
                                <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                                  Saved Draft
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                              {c.grade} • {liveCount} published lessons • <span dir="ltr" className="font-mono">{formatCourseDurationHHMMSS(c)}</span>
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
                            <button
                              type="button"
                              onClick={() => setPreviewCourseModal(c)}
                              className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/15 dark:bg-blue-600/20 hover:bg-blue-600/25 text-blue-700 dark:text-blue-400 border border-blue-500/30 text-xs font-semibold transition-colors cursor-pointer"
                              title="Preview"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Preview</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleEditCourse(c)}
                              className="min-h-[38px] flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold transition-colors cursor-pointer"
                              title="Edit Course Details"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setPendingDeleteCourse(c)}
                              className="min-w-[38px] min-h-[38px] p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 transition-colors cursor-pointer flex items-center justify-center"
                              title="Delete Course Permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Publish Destination Picker Modal */}
              {showPublishModal && (
                <div
                  className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
                  onClick={() => setShowPublishModal(false)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]"
                  >
                    <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                          Select Publish Destination
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Choose the lessons whose contents and sections you want to publish to students now:
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPublishModal(false)}
                        className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-5 overflow-y-auto space-y-4">
                      {newCourseLessons.length === 0 ? (
                        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 text-center">
                          No lessons inside this course yet. You can add a new lesson below or publish the course page first and add lessons later.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Available Publish Destinations ({newCourseLessons.length}):
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const allSelected = newCourseLessons.every(
                                  (l) => selectedPublishLessonIds[l.id]
                                );
                                const nextMap: Record<string, boolean> = {};
                                newCourseLessons.forEach((l) => {
                                  nextMap[l.id] = !allSelected;
                                });
                                setSelectedPublishLessonIds(nextMap);
                              }}
                              className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                            >
                              {newCourseLessons.every((l) => selectedPublishLessonIds[l.id])
                                ? 'Deselect All'
                                : 'Select All Lessons'}
                            </button>
                          </div>

                          <div className="space-y-2">
                            {newCourseLessons.map((lesson, idx) => {
                              const checked = Boolean(selectedPublishLessonIds[lesson.id]);
                              return (
                                <label
                                  key={lesson.id}
                                  className={`flex items-center justify-between gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${
                                    checked
                                      ? 'bg-amber-500/10 border-amber-500 text-slate-900 dark:text-white'
                                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        setSelectedPublishLessonIds((prev) => ({
                                          ...prev,
                                          [lesson.id]: !prev[lesson.id],
                                        }))
                                      }
                                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold block truncate">
                                        {getLessonPublishDestinationLabel(idx, lesson.title)}
                                      </span>
                                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {(lesson.sections || []).length} sections inside this lesson
                                      </span>
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Inline Add New Lesson inside Publish Picker */}
                      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Add a new lesson directly:
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={publishNewLessonTitle}
                            onChange={(e) => setPublishNewLessonTitle(e.target.value)}
                            placeholder="New lesson name..."
                            className="flex-1 min-h-[42px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddLessonFromPublishModal}
                            className="min-h-[42px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Add New Lesson</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setShowPublishModal(false)}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                      >
                        Back to Editor
                      </button>
                      <button
                        type="button"
                        disabled={isSavingCourseAction}
                        onClick={() => void handleConfirmPublishCourse()}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-60 text-slate-950 font-black text-xs shadow-lg flex items-center gap-2 cursor-pointer"
                      >
                        {isSavingCourseAction && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>Confirm Save & Publish ✨</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete Course Confirmation Modal */}
              {pendingDeleteCourse && (
                <div
                  className="fixed inset-0 z-[115] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
                  onClick={() => setPendingDeleteCourse(null)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-2xl"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center justify-center shrink-0">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                          Confirm Course Deletion
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                          Are you sure you want to delete course{' '}
                          <strong className="text-red-600 dark:text-red-400">
                            &quot;{pendingDeleteCourse.title}&quot;
                          </strong>{' '}
                          including all its lessons and sections? This action cannot be undone.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDeleteCourse(null)}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCourse(pendingDeleteCourse.id)}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white shadow cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DOCUMENTS */}
          {activeTab === 'documents' && (
            <div className="space-y-6">
              {/* Add Document Form */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  <span>Add a Document or Study Notes (PDF / Word / Excel) directly from your device</span>
                </h3>

                <form onSubmit={handleAddDocument} noValidate className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Document or Notes Name:</label>
                      <input
                        type="text"
                        required
                        value={newDocTitle}
                        onChange={(e) => setNewDocTitle(e.target.value)}
                        placeholder="e.g., Unit 1 Grammar Notes & Tenses Summary"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Category:</label>
                      <select
                        value={newDocType}
                        onChange={(e: any) => setNewDocType(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                      >
                        <option value="Study Notes">Study Notes</option>
                        <option value="Question Sheet">Question Sheet</option>
                        <option value="Grammar & Rules Summary">Grammar & Rules Summary</option>
                        <option value="Final Revision">Final Revision</option>
                      </select>
                    </div>
                  </div>

                  {/* Hybrid Document Source Selector */}
                  <div className="p-3 bg-white dark:bg-slate-950/70 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        File Source (Dual Storage System):
                      </label>
                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setDocFileMode('link')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            docFileMode === 'link'
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          Paste Direct Link
                        </button>
                        <button
                          type="button"
                          onClick={() => setDocFileMode('upload')}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            docFileMode === 'upload'
                              ? 'bg-blue-600 text-white font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          Upload File from Device 📲
                        </button>
                      </div>
                    </div>

                    {docFileMode === 'link' ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newDocUrl}
                            onChange={(e) => setNewDocUrl(e.target.value)}
                            onPaste={(e) => {
                              const pasted = e.clipboardData?.getData('text')?.trim();
                              if (pasted && /^https?:\/\//i.test(pasted)) {
                                e.preventDefault();
                                setNewDocUrl(pasted);
                                void handleValidateDocLink(pasted);
                              }
                            }}
                            placeholder="https://... Direct PDF or Google Drive link"
                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                          />
                          <button
                            type="button"
                            disabled={isValidatingDocLink}
                            onClick={() => void handleValidateDocLink()}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 shadow"
                          >
                            {isValidatingDocLink ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            <span>{isValidatingDocLink ? 'Counting pages...' : 'Verify Document Link ⚡'}</span>
                          </button>
                        </div>

                        {docLinkValidationProgress && (
                          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/40 space-y-1.5 text-xs text-blue-700 dark:text-blue-300 animate-in fade-in">
                            <div className="flex items-center justify-between">
                              <span>{docLinkValidationProgress.status}</span>
                              <span className="font-mono font-bold">{docLinkValidationProgress.percent}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                style={{ width: `${docLinkValidationProgress.percent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {detectedDocInfoText && (
                          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/40 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>
                              Page count detected automatically from link: <strong>{detectedDocInfoText}</strong> accurately ✓
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) handleDocFileUpload(file);
                          }}
                          className="w-full text-xs text-slate-600 dark:text-slate-400 file:mr-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                        />

                        {/* Real Upload Progress Bar */}
                        <UploadProgressBar info={docUploadProgress} />

                        {detectedDocInfoText && (
                          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/40 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>
                              File pages counted automatically: <strong>{detectedDocInfoText}</strong> accurately ✓
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Academic Grade:</label>
                      <select
                        value={newDocGrade}
                        onChange={(e) => setNewDocGrade(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                      >
                        <option value="3rd Secondary">{`3rd Secondary (${settings.academicYear})`}</option>
                        <option value="2nd Secondary">2nd Secondary</option>
                        <option value="1st Secondary">1st Secondary</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Page Count (Auto):</label>
                      <input
                        type="number"
                        value={newDocPages}
                        onChange={(e) => setNewDocPages(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    {editingDocId ? (
                      <button
                        type="button"
                        onClick={handleCancelEditDocument}
                        className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
                      >
                        Cancel Edit
                      </button>
                    ) : <div />}

                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg transition-all"
                    >
                      {editingDocId ? 'Save Document Changes Now ✨' : 'Save & Add File to Platform ✨'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Documents List with Open in Built-in Player, Edit, and Delete */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Uploaded Documents & Notes ({allDocuments.length})</h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Preview any note in the built-in viewer, edit, or delete it</span>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {allDocuments.map((doc) => (
                    <div key={doc.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{doc.title}</span>
                          <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 text-[10px]">
                            {doc.docType}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                          {doc.grade} • {doc.pagesCount} pages • {doc.fileSize}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        {/* Open in Built-in Document Player */}
                        <button
                          type="button"
                          onClick={() => setPreviewDocModal(doc)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/15 dark:bg-blue-600/20 hover:bg-blue-600/25 text-blue-700 dark:text-blue-400 border border-blue-500/30 text-xs font-semibold transition-colors"
                          title="Open file in built-in platform viewer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Open in Built-in Viewer</span>
                        </button>

                        {/* Edit Document */}
                        <button
                          type="button"
                          onClick={() => handleEditDocument(doc)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold transition-colors"
                          title="Edit file details"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>

                        {/* Delete Document */}
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 transition-colors"
                          title="Delete file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3 & 4: SMART EXAMS, ASSIGNMENTS & SHEETS */}
          {(activeTab === 'exams' || activeTab === 'assignments') && (
            <AssessmentQuestionEditor
              mode={activeTab === 'assignments' ? 'assignments' : 'exams'}
              settings={settings}
              allExams={allExams}
              allSubmissions={allSubmissions}
              onDataChanged={onDataChanged}
              onSuccessToast={(msg) => {
                setSaveSuccessToast(msg);
                setTimeout(() => setSaveSuccessToast(null), 4000);
              }}
              onErrorToast={(msg) => {
                setSaveErrorToast(msg);
                setTimeout(() => setSaveErrorToast(null), 6000);
              }}
              onEmergencyResetAi={handleEmergencyResetAI}
              isResettingAi={isResettingAi}
              aiResetMessage={aiResetMessage}
            />
          )}

          {/* TAB 5: GEMINI AI DEDICATED TOOLS */}
          {activeTab === 'gemini' && (
            <div className="space-y-6">
              {/* Emergency AI Reset Banner */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">AI Engine Status (Gemini 4 Hydrogen)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    If the chat freezes or temporary errors appear, click Reset to reload the AI connection immediately.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleEmergencyResetAI}
                  disabled={isResettingAi}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-colors disabled:opacity-60 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResettingAi ? 'animate-spin' : ''}`} />
                  <span>{isResettingAi ? 'Resetting...' : 'Emergency AI Reset'}</span>
                </button>
              </div>

              {aiResetMessage && (
                <div
                  className={`p-3 rounded-2xl text-xs font-semibold border ${
                    aiResetMessage.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {aiResetMessage.text}
                </div>
              )}

              {/* Universal Super AI Chatroom */}
              <GeminiChatPanel />

              {/* Full Assessment Forms & Question Editor directly inside Gemini tab */}
              <AssessmentQuestionEditor
                mode="gemini"
                settings={settings}
                allExams={allExams}
                allSubmissions={allSubmissions}
                onDataChanged={onDataChanged}
                onSuccessToast={(msg) => {
                  setSaveSuccessToast(msg);
                  setTimeout(() => setSaveSuccessToast(null), 4000);
                }}
                onErrorToast={(msg) => {
                  setSaveErrorToast(msg);
                  setTimeout(() => setSaveErrorToast(null), 6000);
                }}
                onEmergencyResetAi={handleEmergencyResetAI}
                isResettingAi={isResettingAi}
                aiResetMessage={aiResetMessage}
              />
            </div>
          )}

          {/* TAB 6: STUDENTS DIRECTORY & SCANNER */}
          {activeTab === 'students' && (
            <div className="space-y-6">
              {/* Camera Scanner Banner */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 dark:from-blue-600/20 dark:via-indigo-600/20 dark:to-slate-900 border border-blue-200 dark:border-blue-500/40 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Camera className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Scan Student Rosters via Camera (Google Gemini AI)
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Snap a photo of your center&apos;s paper attendance sheet and names & phone numbers will be extracted and added automatically!
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg cursor-pointer transition-all">
                  <Upload className="w-4 h-4" />
                  <span>{isScanningStudents ? 'Scanning with camera...' : 'Upload Roster Photo Now 📸'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleScanRosterWithGemini}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Gemini AI Student Analytics Box */}
              <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-blue-50/70 via-white to-indigo-50/70 dark:from-blue-950/40 dark:via-slate-900 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-500/40 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Gemini Assistant for Student Records & Attendance (Who logged in today?)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full font-bold">
                      Gemini 4 Hydrogen
                    </span>
                    <button
                      type="button"
                      onClick={handleEmergencyResetAI}
                      disabled={isResettingAi}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3 h-3 ${isResettingAi ? 'animate-spin' : ''}`} />
                      <span>Reset AI</span>
                    </button>
                  </div>
                </div>

                {/* Quick suggestions */}
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  {[
                    'Who logged in or registered today?',
                    'How many 3rd Secondary students are registered?',
                    'Which students are in Cairo governorate?',
                    'Which students have wallet balance?',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setGeminiStudentPrompt(q);
                        handleAnalyzeStudents(q);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 hover:border-blue-500/50 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={geminiStudentPrompt}
                    onChange={(e) => setGeminiStudentPrompt(e.target.value)}
                    placeholder="Ask Gemini about students and their records (e.g., Who logged in today?)..."
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => handleAnalyzeStudents()}
                    disabled={isAnalyzingStudents}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all shrink-0"
                  >
                    {isAnalyzingStudents ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Scanning...</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4" />
                        <span>Analyze with Gemini 🤖</span>
                      </>
                    )}
                  </button>
                </div>

                {geminiStudentAnswer && (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-blue-200 dark:border-blue-500/40 text-xs text-slate-800 dark:text-slate-200 leading-relaxed space-y-2 animate-in fade-in">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold">
                      <Sparkles className="w-4 h-4" />
                      <span>AI Report (Gemini):</span>
                    </div>
                    <div className="whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-200">
                      {geminiStudentAnswer}
                    </div>
                  </div>
                )}
              </div>

              {/* Add Student Manually Form */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Add New Student Manually</h3>
                <form onSubmit={handleAddStudent} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={newStdName}
                    onChange={(e) => setNewStdName(e.target.value)}
                    placeholder="Student full name..."
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="tel"
                    required
                    value={newStdPhone}
                    onChange={(e) => setNewStdPhone(e.target.value)}
                    placeholder="Student phone (010...)"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                  <input
                    type="text"
                    required
                    value={newStdPassword}
                    onChange={(e) => setNewStdPassword(e.target.value)}
                    placeholder="Student password (required for login)"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="tel"
                    value={newStdParentPhone}
                    onChange={(e) => setNewStdParentPhone(e.target.value)}
                    placeholder="Parent phone"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                  <select
                    value={newStdGrade}
                    onChange={(e) => setNewStdGrade(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="3rd Secondary">{`3rd Secondary (${settings.academicYear})`}</option>
                    <option value="2nd Secondary">2nd Secondary</option>
                    <option value="1st Secondary">1st Secondary</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newStdGov}
                      onChange={(e) => setNewStdGov(e.target.value)}
                      placeholder="Governorate"
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0"
                    >
                      Save & Add Student
                    </button>
                  </div>
                </form>
              </div>

              {/* Student Directory Table with Search & Delete */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Registered Students Directory ({allStudents.length})</h3>
                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search by name, phone, or code..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 pl-8 text-xs text-slate-900 dark:text-white"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-3">Student Code</th>
                        <th className="py-2.5 px-3">Full Name</th>
                        <th className="py-2.5 px-3">Student Phone</th>
                        <th className="py-2.5 px-3">Parent Phone</th>
                        <th className="py-2.5 px-3">Governorate</th>
                        <th className="py-2.5 px-3">Balance</th>
                        <th className="py-2.5 px-3">Granted Content</th>
                        <th className="py-2.5 px-3">Actions & Grants</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {allStudents.map((st) => {
                        const grantedCount =
                          (st.enrolledCourses?.length || 0) + (st.grantedDocuments?.length || 0);
                        return (
                          <tr key={st.id} className="hover:bg-slate-100/70 dark:hover:bg-slate-900/50">
                            <td className="py-3 px-3 font-mono font-bold text-amber-600 dark:text-amber-400">{st.studentCode}</td>
                            <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{st.fullName}</td>
                            <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">{st.phone}</td>
                            <td className="py-3 px-3 font-mono text-slate-500 dark:text-slate-400">{st.parentPhone || '-'}</td>
                            <td className="py-3 px-3 text-slate-700 dark:text-slate-300">{st.governorate}</td>
                            <td className="py-3 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              <button
                                type="button"
                                onClick={() => handleOpenBalanceModal(st)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 transition-colors"
                                title="Edit or recharge student balance manually"
                              >
                                <span>{st.balance} EGP</span>
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                              {grantedCount > 0 ? `${grantedCount} unlocked item${grantedCount === 1 ? '' : 's'}` : '—'}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenGiftModal(st)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-700 dark:text-amber-300 hover:text-slate-950 border border-amber-500/30 font-bold text-[11px] transition-colors"
                                  title="Grant free courses or files to this student"
                                >
                                  <Gift className="w-3.5 h-3.5" />
                                  <span>Grant</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenBalanceModal(st)}
                                  className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white border border-blue-500/25 transition-colors"
                                  title="Recharge or edit balance manually"
                                >
                                  <Wallet className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStudent(st.id)}
                                  className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/10"
                                  title="Delete student"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6B: STANDALONE STUDENT DATA & PARENT REPORTS SECTION */}
          {activeTab === 'students-data' && (
            <StudentsDataSection
              students={platformDB.getStudents()}
              courses={allCourses}
              exams={allExams}
              submissions={allSubmissions}
              settings={settings}
              currentUser={platformDB.getCurrentUser()}
              onOpenAuth={() => {}}
              onDataChanged={onDataChanged}
              forceAuthorized={true}
              onGrievancesSeen={() => setUnreadGrievancesCount(0)}
            />
          )}

          {/* TAB 7: PAYMENT METHODS CRUD, DIRECT RECHARGE & PAYMENT REQUESTS */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              {/* 1. Payment Methods Manager (Admin & Secretary Only) */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                      <span>Payment Methods Manager ({paymentMethodsList.length}) — Teacher & Secretaries Only</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Add multiple payment methods, edit, enable/disable, or permanently delete any method at any time — changes update immediately for students.
                    </p>
                  </div>
                  {editingMethodId && (
                    <button
                      type="button"
                      onClick={handleResetPaymentMethodForm}
                      className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                    >
                      Cancel Edit Mode
                    </button>
                  )}
                </div>

                <form onSubmit={handleSavePaymentMethod} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Method Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={methodNameInput}
                      onChange={(e) => setMethodNameInput(e.target.value)}
                      placeholder="e.g., Vodafone Cash / Etisalat Cash / Bank Transfer..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Transfer Number / Address / Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={methodAccountInput}
                      onChange={(e) => setMethodAccountInput(e.target.value)}
                      placeholder="e.g., 010xxxxxxxx or user@instapay"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Icon
                    </label>
                    <select
                      value={methodIconType}
                      onChange={(e) => setMethodIconType(e.target.value as any)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="phone">Mobile Wallet</option>
                      <option value="zap">Instant Transfer (InstaPay)</option>
                      <option value="building">Bank / Service</option>
                      <option value="card">Card / Scratch Card</option>
                      <option value="wallet">E-Wallet</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Accent Color
                    </label>
                    <select
                      value={methodAccentColor}
                      onChange={(e) => setMethodAccentColor(e.target.value as any)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="amber">Gold</option>
                      <option value="red">Red</option>
                      <option value="purple">Purple</option>
                      <option value="blue">Blue</option>
                      <option value="emerald">Green</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Transfer Instructions or Notes (Optional)
                    </label>
                    <input
                      type="text"
                      value={methodInstructionsInput}
                      onChange={(e) => setMethodInstructionsInput(e.target.value)}
                      placeholder="e.g., Upload a receipt photo or transfer screenshot after sending..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-4">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={methodIsActive}
                        onChange={(e) => setMethodIsActive(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-700 text-amber-500"
                      />
                      <span>Active for Students</span>
                    </label>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={isSavingMethod}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isSavingMethod ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : editingMethodId ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span>{editingMethodId ? 'Save Changes' : 'Add Payment Method'}</span>
                    </button>
                  </div>
                </form>

                {/* Registered Payment Methods List */}
                {paymentMethodsList.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 dark:text-slate-400 py-4 bg-white dark:bg-slate-900/60 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                    No payment methods added yet. Add a new payment method using the form above.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {paymentMethodsList.map((m) => (
                      <div
                        key={m.id}
                        className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all ${
                          m.isActive
                            ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                            : 'bg-slate-100/70 dark:bg-slate-950/60 border-slate-200/70 dark:border-slate-800 opacity-75'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                              {m.name}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                m.isActive
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {m.isActive ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <div className="font-mono font-black text-xs text-amber-700 dark:text-amber-400 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 truncate" dir="ltr">
                            {m.accountValue}
                          </div>
                          {m.instructions && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                              {m.instructions}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleEditPaymentMethod(m)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white font-bold transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleTogglePaymentMethodActive(m)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition-colors cursor-pointer"
                          >
                            {m.isActive ? (
                              <ToggleRight className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <ToggleLeft className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span>{m.isActive ? 'Disable' : 'Enable'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={deletingMethodId === m.id}
                            onClick={() => void handleDeletePaymentMethod(m.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white font-bold transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {deletingMethodId === m.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Direct Balance Recharge for ANY User Inside Platform (Admin & Secretary Only) */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-emerald-500/30 shadow-xl space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-emerald-500" />
                    <span>Direct Student Wallet Recharge (Teacher & Secretaries Only)</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Search any student by name, phone, or code and recharge or adjust their balance instantly with automatic Supabase sync.
                  </p>
                </div>

                <form onSubmit={handleDirectChargeStudent} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Quick Student Search:
                    </label>
                    <input
                      type="text"
                      value={directChargeSearch}
                      onChange={(e) => setDirectChargeSearch(e.target.value)}
                      placeholder="Name, phone, or code..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Select Target Student *
                    </label>
                    <select
                      required
                      value={directChargeStudentId}
                      onChange={(e) => setDirectChargeStudentId(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="">-- Select student account from list --</option>
                      {platformDB
                        .getStudents()
                        .filter((st) => {
                          if (!directChargeSearch.trim()) return true;
                          const q = directChargeSearch.toLowerCase();
                          return (
                            st.fullName.toLowerCase().includes(q) ||
                            st.phone.includes(q) ||
                            (st.studentCode || '').toLowerCase().includes(q)
                          );
                        })
                        .map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.fullName} ({st.phone}) — Current Balance: {st.balance || 0} EGP
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Operation & Amount (EGP)
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={directChargeMode}
                        onChange={(e) => setDirectChargeMode(e.target.value as 'add' | 'set')}
                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      >
                        <option value="add">Add (+)</option>
                        <option value="set">Set (=)</option>
                      </select>
                      <input
                        type="number"
                        required
                        min="0"
                        step="any"
                        value={directChargeAmount}
                        onChange={(e) => setDirectChargeAmount(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={isSavingDirectCharge}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-black text-xs shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isSavingDirectCharge ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                      <span>Recharge Now</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Gemini AI Payment Assistant Box */}
              <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-amber-50/70 via-white to-blue-50/70 dark:from-amber-500/15 dark:via-[#1E293B] dark:to-blue-500/15 border border-amber-300 dark:border-amber-500/40 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Gemini AI Assistant for Payment & Receipt Analysis
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-full font-bold">
                      Gemini 4 Hydrogen
                    </span>
                    <button
                      type="button"
                      onClick={handleEmergencyResetAI}
                      disabled={isResettingAi}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3 h-3 ${isResettingAi ? 'animate-spin' : ''}`} />
                      <span>Reset AI</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Ask Gemini directly about anything related to payment requests, and it will inspect the receipts log and answer accurately:
                </p>

                {/* Quick Suggestion Pills */}
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  {[
                    'Who paid today?',
                    'What is the total approved amount in EGP?',
                    'Which students transferred via Vodafone Cash?',
                    'Which requests are still under review?',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setGeminiPaymentPrompt(q);
                        handleAnalyzePayments(q);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 hover:border-amber-500/50 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {/* Question Input & Trigger Button */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={geminiPaymentPrompt}
                    onChange={(e) => setGeminiPaymentPrompt(e.target.value)}
                    placeholder="Type your question for Gemini (e.g., Who paid today? or How many are pending?)..."
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => handleAnalyzePayments()}
                    disabled={isAnalyzingPayments}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all shrink-0"
                  >
                    {isAnalyzingPayments ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4" />
                        <span>Analyze with Gemini 🤖</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Gemini Answer Box */}
                {geminiPaymentAnswer && (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-amber-300 dark:border-amber-500/40 text-xs text-slate-800 dark:text-slate-200 leading-relaxed space-y-2 animate-in fade-in">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
                      <Sparkles className="w-4 h-4" />
                      <span>AI Report (Gemini):</span>
                    </div>
                    <div className="whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-200">
                      {geminiPaymentAnswer}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Requests Table with Live Delete */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                      <span>Payment Requests & Transfer Receipts Log ({allPayments.length})</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Approve and recharge the student's balance, reject a receipt, or permanently delete any record from the list.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-3">Student</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Reference</th>
                        <th className="py-2.5 px-3">Receipt</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Action</th>
                        <th className="py-2.5 px-3 text-center">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {allPayments.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center py-8 text-slate-500 text-xs">
                            No payment requests recorded yet
                          </td>
                        </tr>
                      ) : (
                        allPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-100/70 dark:hover:bg-slate-900/50">
                            <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{p.studentName}</td>
                            <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">{p.studentPhone}</td>
                            <td className="py-3 px-3 text-amber-600 dark:text-amber-400 font-semibold">
                              {p.methodLabel || platformDB.getPaymentMethodLabel(p.method)}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">{p.amount} EGP</td>
                            <td className="py-3 px-3 font-mono text-slate-500 dark:text-slate-400">{p.referenceNumber}</td>
                            <td className="py-3 px-3">
                              {p.receiptImage ? (
                                <a
                                  href={p.receiptImage}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                                >
                                  <span>View Image</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-slate-500">None</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {p.status === 'approved' ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold">
                                  Approved
                                </span>
                              ) : p.status === 'rejected' ? (
                                <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-700 dark:text-red-400 font-bold">
                                  Rejected
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold animate-pulse">
                                  Pending Review
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {p.status === 'pending' && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={reviewingPaymentId === p.id}
                                    onClick={() => void handleReviewPaymentAction(p.id, 'approved')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-[11px] flex items-center gap-1"
                                  >
                                    {reviewingPaymentId === p.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                    <span>Approve & Charge</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reviewingPaymentId === p.id}
                                    onClick={() => void handleReviewPaymentAction(p.id, 'rejected')}
                                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-bold text-[11px]"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() => {
                                  platformDB.deletePayment(p.id);
                                  onDataChanged();
                                }}
                                className="p-1.5 rounded-lg text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                title="Permanently delete this request"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: BROADCAST NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                  <span>Broadcast Instant Messages & Alerts to All Students (Red Bell Alert 🔔)</span>
                </h3>

                <form onSubmit={handleBroadcastNotification} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Alert Title:</label>
                      <input
                        type="text"
                        required
                        value={notifTitle}
                        onChange={(e) => setNotifTitle(e.target.value)}
                        placeholder="e.g., Next Lecture Schedule / Comprehensive Exam on Friday"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Grade:</label>
                      <select
                        value={notifTargetGrade}
                        onChange={(e) => setNotifTargetGrade(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                      >
                        <option value="All">All Grades (Public for All Students)</option>
                        <option value="3rd Secondary">{`3rd Secondary (${settings.academicYear})`}</option>
                        <option value="2nd Secondary">2nd Secondary</option>
                        <option value="1st Secondary">1st Secondary</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Message Content & Details (optional if attaching a voice note):
                    </label>
                    <textarea
                      rows={3}
                      value={notifContent}
                      onChange={(e) => setNotifContent(e.target.value)}
                      placeholder="Write your message and instructions for students in detail..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  {/* Voice Message Recorder / Audio Attachment */}
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Volume2 className="w-4 h-4 text-blue-500" />
                        <span>Attach Teacher Voice Note (Live Recording or Audio File)</span>
                      </span>

                      {isRecordingVoice && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 text-[11px] font-mono font-bold animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <span>
                            Recording {Math.floor(recordingSeconds / 60)}:
                            {(recordingSeconds % 60).toString().padStart(2, '0')}
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isRecordingVoice ? (
                        <button
                          type="button"
                          onClick={() => void handleStartVoiceRecording()}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow cursor-pointer"
                        >
                          <Mic className="w-4 h-4" />
                          <span>Start Recording Voice Note</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStopVoiceRecording}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-bold shadow cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>Stop & Save Recording</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isUploadingNotifAudio}
                        onClick={() => document.getElementById('notif-audio-file-input')?.click()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 disabled:opacity-50 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-xs font-bold cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingNotifAudio ? 'Uploading audio...' : 'Or Choose Audio File'}</span>
                      </button>
                      <input
                        id="notif-audio-file-input"
                        type="file"
                        accept="audio/*"
                        onChange={(ev) => void handleAudioFileSelect(ev)}
                        className="hidden"
                      />

                      {notifAudioUrl && (
                        <button
                          type="button"
                          onClick={handleClearNotifAudio}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove Audio</span>
                        </button>
                      )}
                    </div>

                    {isUploadingNotifAudio && (
                      <div className="flex items-center gap-2 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Uploading audio file to Supabase Storage...</span>
                      </div>
                    )}

                    {voiceRecorderError && (
                      <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                        {voiceRecorderError}
                      </p>
                    )}

                    {notifAudioUrl && (
                      <div className="pt-1">
                        <audio controls src={notifAudioUrl} className="w-full max-w-md h-10" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifIsUrgent}
                        onChange={(e) => setNotifIsUrgent(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Mark as Important & Urgent Alert (Red Banner)</span>
                    </label>

                    <button
                      type="submit"
                      disabled={isSendingNotif || isRecordingVoice || isUploadingNotifAudio}
                      className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs shadow-lg flex items-center gap-2 cursor-pointer"
                    >
                      {isSendingNotif && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>Send & Broadcast to Students Now 🚀</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* History */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Previously Sent Messages & Notifications ({allNotifications.length})</h3>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {allNotifications.map((n) => (
                    <div key={n.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{n.title}</span>
                          {n.audioUrl && (
                            <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                              🎙️ Voice Note
                            </span>
                          )}
                          {n.isUrgent && (
                            <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-bold">
                              Urgent
                            </span>
                          )}
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">({n.targetGrade})</span>
                        </div>
                        {n.content && (
                          <p className="text-slate-600 dark:text-slate-300 text-xs mt-1">{n.content}</p>
                        )}
                        {n.audioUrl && (
                          <audio controls src={n.audioUrl} className="mt-2 w-full max-w-md h-9" />
                        )}
                      </div>

                      <button
                        onClick={() => {
                          platformDB.deleteNotification(n.id);
                          onDataChanged();
                        }}
                        className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: SUPPORT INBOX & STUDENT Q&A */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              {/* Top Stats + Filter Bar */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                      <span>Technical Support Inbox & Private Student Q&A</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-mono">
                        {allSupportThreads.length}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Every question sent by a student or visitor arrives here with image, audio, or text. When you reply (text, image, or voice note), it appears exclusively on that person's support page.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isRefreshingSupport}
                    onClick={() => void handleRefreshSupportInbox()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSupport ? 'animate-spin' : ''}`} />
                    <span>Refresh Questions from Supabase</span>
                  </button>
                </div>

                {/* Filter + Search */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
                    {[
                      { id: 'all', label: `All (${allSupportThreads.length})` },
                      { id: 'open', label: `Awaiting Reply (${openSupportCount})` },
                      { id: 'answered', label: `Replied (${allSupportThreads.length - openSupportCount})` },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSupportFilter(f.id as any)}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          supportFilter === f.id
                            ? 'bg-amber-500 text-slate-950 shadow'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={supportSearch}
                      onChange={(e) => setSupportSearch(e.target.value)}
                      placeholder="Search by student name, phone, code, or question..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Threads List */}
              {filteredSupportThreads.length === 0 ? (
                <div className="bg-slate-50 dark:bg-[#0F172A] p-10 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-2">
                  <MessageCircle className="w-10 h-10 text-slate-400 mx-auto opacity-60" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    No matching questions or inquiries found
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    When any student sends a question, image, or voice recording from the Support section, it will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredSupportThreads.map((thread) => {
                    const isReplyingHere = activeSupportThreadId === thread.id;
                    return (
                      <div
                        key={thread.id}
                        className="bg-slate-50 dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-lg space-y-4"
                      >
                        {/* Student Info Header */}
                        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-sm text-slate-900 dark:text-white">
                                {thread.studentName}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                  thread.status === 'answered'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                                }`}
                              >
                                {thread.status === 'answered' ? 'Replied ✓' : 'New / Awaiting Reply'}
                              </span>
                              {thread.studentGrade && (
                                <span className="px-2 py-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300">
                                  {thread.studentGrade}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                              {thread.studentPhone && (
                                <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                                  📱 {thread.studentPhone}
                                </span>
                              )}
                              {thread.studentCode && (
                                <span className="font-mono">Code: {thread.studentCode}</span>
                              )}
                              {thread.pageNumber && <span>Page: {thread.pageNumber}</span>}
                              {thread.questionNumber && <span>Question #: {thread.questionNumber}</span>}
                              <span className="font-mono">
                                {new Date(thread.updatedAt || thread.createdAt).toLocaleString('en-US')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenSupportReply(thread.id)}
                              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                                isReplyingHere
                                  ? 'bg-slate-300 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow'
                              }`}
                            >
                              <Reply className="w-3.5 h-3.5" />
                              <span>{isReplyingHere ? 'Close Reply Box' : 'Reply to Student'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={deletingSupportId === thread.id}
                              onClick={() => void handleDeleteSupportThreadAdmin(thread.id)}
                              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold cursor-pointer"
                              title="Delete thread and attachments from Supabase"
                            >
                              {deletingSupportId === thread.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              <span className="hidden sm:inline">Delete</span>
                            </button>
                          </div>
                        </div>

                        {/* Conversation Messages */}
                        <div className="space-y-3">
                          {(thread.messages || []).map((msg) => {
                            const isTeacher = msg.senderRole === 'admin';
                            return (
                              <div
                                key={msg.id}
                                className={`rounded-2xl p-3.5 border text-xs space-y-2 ${
                                  isTeacher
                                    ? 'bg-emerald-50 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-500/30 ml-4 sm:ml-10'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 mr-4 sm:mr-10'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={`font-bold ${
                                      isTeacher
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-amber-600 dark:text-amber-400'
                                    }`}
                                  >
                                    {isTeacher ? `Teacher Reply (${msg.senderName})` : `Student Question (${msg.senderName})`}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {new Date(msg.createdAt).toLocaleString('en-US')}
                                  </span>
                                </div>

                                {msg.text && (
                                  <p className="text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                                    {msg.text}
                                  </p>
                                )}

                                {msg.imageUrl && (
                                  <div className="pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setSupportLightboxUrl(msg.imageUrl!)}
                                      className="group relative inline-block rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 cursor-zoom-in"
                                    >
                                      <img
                                        src={msg.imageUrl}
                                        alt="Question attachment"
                                        className="max-h-56 w-auto object-contain bg-slate-950/5"
                                      />
                                      <span className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-slate-950/75 text-white text-[10px] font-bold flex items-center gap-1 opacity-90 group-hover:opacity-100">
                                        <ZoomIn className="w-3 h-3" />
                                        <span>Zoom</span>
                                      </span>
                                    </button>
                                  </div>
                                )}

                                {msg.audioUrl && (
                                  <div className="pt-1 flex items-center gap-2">
                                    <Volume2 className="w-4 h-4 text-blue-500 shrink-0" />
                                    <audio controls src={msg.audioUrl} className="w-full max-w-md h-9" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Inline Teacher Reply Composer (Text + Image + Voice/Audio) */}
                        {isReplyingHere && (
                          <form
                            onSubmit={(e) => void handleSendSupportReply(e, thread)}
                            className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-500/40 p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                                Send Private Reply to: {thread.studentName}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                This reply will only appear on this student's account/device
                              </span>
                            </div>

                            <textarea
                              rows={3}
                              value={supportReplyText}
                              onChange={(e) => setSupportReplyText(e.target.value)}
                              placeholder="Write your answer or explanation here..."
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none"
                            />

                            {/* Image & Audio Controls */}
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => document.getElementById(`support-reply-img-${thread.id}`)?.click()}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer"
                              >
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>Attach Solution Image</span>
                              </button>
                              <input
                                id={`support-reply-img-${thread.id}`}
                                type="file"
                                accept="image/*"
                                onChange={handleSelectSupportImage}
                                className="hidden"
                              />

                              {!isRecordingSupportVoice ? (
                                <button
                                  type="button"
                                  onClick={() => void handleStartSupportVoiceRecording()}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer"
                                >
                                  <Mic className="w-3.5 h-3.5" />
                                  <span>Record Voice Reply</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleStopSupportVoiceRecording}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-bold cursor-pointer animate-pulse"
                                >
                                  <Square className="w-3.5 h-3.5 fill-current" />
                                  <span>
                                    Stop Recording ({Math.floor(supportRecSeconds / 60)}:
                                    {String(supportRecSeconds % 60).padStart(2, '0')})
                                  </span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => document.getElementById(`support-reply-aud-${thread.id}`)?.click()}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-xs font-bold cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Or Upload Audio File</span>
                              </button>
                              <input
                                id={`support-reply-aud-${thread.id}`}
                                type="file"
                                accept="audio/*"
                                onChange={handleSelectSupportAudio}
                                className="hidden"
                              />
                            </div>

                            {supportVoiceError && (
                              <p className="text-[11px] font-bold text-red-600 dark:text-red-400">
                                {supportVoiceError}
                              </p>
                            )}

                            {/* Previews before send */}
                            {supportReplyImagePreview && (
                              <div className="relative inline-block">
                                <img
                                  src={supportReplyImagePreview}
                                  alt="Reply image preview"
                                  className="max-h-40 rounded-xl border border-slate-300 dark:border-slate-700"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (supportReplyImagePreview.startsWith('blob:')) {
                                      URL.revokeObjectURL(supportReplyImagePreview);
                                    }
                                    setSupportReplyImageFile(null);
                                    setSupportReplyImagePreview('');
                                  }}
                                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow"
                                  title="Remove image"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {supportReplyAudioPreview && (
                              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                                <audio controls src={supportReplyAudioPreview} className="flex-1 h-9" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (supportReplyAudioPreview.startsWith('blob:')) {
                                      URL.revokeObjectURL(supportReplyAudioPreview);
                                    }
                                    setSupportReplyAudioFile(null);
                                    setSupportReplyAudioPreview('');
                                    setSupportReplyAudioDuration(0);
                                  }}
                                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10"
                                  title="Remove audio"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                            {supportUploadProgress && (
                              <UploadProgressBar info={supportUploadProgress} />
                            )}

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  clearSupportReplyDraft();
                                  setActiveSupportThreadId(null);
                                }}
                                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={isSendingSupportReply || isRecordingSupportVoice}
                                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-black shadow-lg flex items-center gap-1.5 cursor-pointer"
                              >
                                {isSendingSupportReply ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                <span>Send Reply & Save to Supabase</span>
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 9: HONOR BOARD */}
          {activeTab === 'honor' && (
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                  <span>Add Student to Honor Board & Award Top Achievers</span>
                </h3>

                <form onSubmit={handleAddHonor} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={honorName}
                    onChange={(e) => setHonorName(e.target.value)}
                    placeholder="Full student name..."
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={honorGov}
                    onChange={(e) => setHonorGov(e.target.value)}
                    placeholder="Governorate (Mansoura / Cairo...)"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    value={honorScore}
                    onChange={(e) => setHonorScore(e.target.value)}
                    placeholder="Score (e.g., 60)"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                  <input
                    type="number"
                    value={honorRank}
                    onChange={(e) => setHonorRank(e.target.value)}
                    placeholder="Rank (1, 2, or 3...)"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                  <input
                    type="text"
                    value={honorTitle}
                    onChange={(e) => setHonorTitle(e.target.value)}
                    placeholder="Honor Title (1st Place 🥇)"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white sm:col-span-2"
                  />
                  <div className="sm:col-span-3 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                    >
                      Add Student to Honor Board 🏆
                    </button>
                  </div>
                </form>
              </div>

              {/* Honor Table */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Honor Board Students ({allHonor.length})</h3>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {allHonor.map((h) => (
                    <div key={h.id} className="py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold flex items-center justify-center">
                          #{h.rank}
                        </span>
                        <div>
                          <strong className="text-slate-900 dark:text-white text-sm block">{h.studentName}</strong>
                          <span className="text-amber-600 dark:text-amber-400">{h.titleBadge}</span> • <span className="text-slate-500 dark:text-slate-400">{h.governorate}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{h.score} / {h.maxScore}</span>
                        <button
                          onClick={() => {
                            platformDB.deleteHonorStudent(h.id);
                            onDataChanged();
                          }}
                          className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: SECRETARIES & ASSISTANTS */}
          {activeTab === 'secretaries' && (
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                  <span>Add & Assign Secretaries and Assistants Permissions</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Any phone number added by Miss Asmaa to the secretaries list allows its owner to log in directly using their phone number and access the admin dashboard to add assignments, files, and grant student access.
                </p>

                <form onSubmit={handleAddSecretary} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={secName}
                    onChange={(e) => setSecName(e.target.value)}
                    placeholder="Secretary / Assistant name..."
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="tel"
                    required
                    value={secPhone}
                    onChange={(e) => setSecPhone(e.target.value)}
                    placeholder="Login phone number (010...)"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                  <input
                    type="text"
                    value={secNotes}
                    onChange={(e) => setSecNotes(e.target.value)}
                    placeholder="Notes / Responsibilities"
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <div className="sm:col-span-3 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
                    >
                      Save & Grant Access 🛡️
                    </button>
                  </div>
                </form>
              </div>

              {/* Secretary List */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Authorized Secretaries Team ({allSecretaries.length})</h3>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {allSecretaries.map((s) => (
                    <div key={s.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-slate-900 dark:text-white text-sm block">{s.name}</strong>
                        <span className="font-mono text-blue-600 dark:text-blue-400">{s.phone}</span> • <span className="text-slate-500 dark:text-slate-400">{s.notes}</span>
                      </div>
                      <button
                        onClick={() => {
                          platformDB.deleteSecretary(s.id);
                          onDataChanged();
                        }}
                        className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: BULK REDEEM CODES GENERATOR (UP TO 10,000) */}
          {activeTab === 'codes' && (
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                      <span>Bulk Recharge & Activation Codes Generator (Up to 10,000 Codes)</span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Generate recharge scratch card codes for your center or platform. Customize the code count, balance value, usage limit (1 or 2 uses max), and optionally link to a specific course or general wallet.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleGenerateBulkCodes} className="space-y-4">
                  {/* Code Type Selection: Balance vs Course */}
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <label className="text-xs font-bold text-amber-600 dark:text-amber-400 block">Code Type to Generate:</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <label
                        className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                          codeType === 'balance'
                            ? 'bg-amber-500/10 border-amber-500 text-slate-900 dark:text-white font-bold'
                            : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="codeType"
                          value="balance"
                          checked={codeType === 'balance'}
                          onChange={() => setCodeType('balance')}
                          className="text-amber-500 focus:ring-amber-500"
                        />
                        <div>
                          <span className="block">Wallet Balance Top-Up Code (EGP)</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Adds credit to the student's wallet to choose any course or lecture</span>
                        </div>
                      </label>

                      <label
                        className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                          codeType === 'course'
                            ? 'bg-blue-500/10 border-blue-500 text-slate-900 dark:text-white font-bold'
                            : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="codeType"
                          value="course"
                          checked={codeType === 'course'}
                          onChange={() => {
                            setCodeType('course');
                            if (!selectedCourseForCode && allCourses.length > 0) {
                              setSelectedCourseForCode(allCourses[0].id);
                              setCodeAmount(allCourses[0].price.toString());
                            }
                          }}
                          className="text-blue-500 focus:ring-blue-500"
                        />
                        <div>
                          <span className="block">Specific Course / Lecture Activation Code (Center Cards)</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Unlocks the target course immediately without requiring wallet credit</span>
                        </div>
                      </label>
                    </div>

                    {/* Course selector when codeType === 'course' */}
                    {codeType === 'course' && (
                      <div className="pt-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Select Course / Lecture Linked to These Codes:
                        </label>
                        <select
                          value={selectedCourseForCode}
                          onChange={(e) => {
                            setSelectedCourseForCode(e.target.value);
                            const found = allCourses.find((c) => c.id === e.target.value);
                            if (found) setCodeAmount(found.price.toString());
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-blue-500/50 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                        >
                          {allCourses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title} ({c.grade}) - {c.price} EGP
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Quick Count Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Quick Select Number of Codes (Up to 1,000,000):</label>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      {[10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000, 1000000].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCodeCount(c)}
                          className={`px-3 py-1.5 rounded-xl border transition-all ${
                            codeCount === c
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {c >= 1000000 ? '1,000,000 Codes ⚡' : `${c.toLocaleString('en-US')} Codes`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Exact Count (1 - 1,000,000) *</label>
                      <input
                        type="number"
                        min="1"
                        max="1000000"
                        value={codeCount}
                        onChange={(e) => setCodeCount(parseInt(e.target.value) || 10)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Code Prefix</label>
                      <input
                        type="text"
                        value={codePrefix}
                        onChange={(e) => setCodePrefix(e.target.value)}
                        placeholder="AMR or ENG"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {codeType === 'course' ? 'Reference Course Price' : 'Code Value (EGP) *'}
                      </label>
                      <input
                        type="number"
                        value={codeAmount}
                        onChange={(e) => setCodeAmount(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Max Uses Per Code *</label>
                      <select
                        value={codeMaxUses}
                        onChange={(e) => setCodeMaxUses(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                      >
                        <option value="1">Single use only (Default)</option>
                        <option value="2">Twice (for 2 devices)</option>
                        <option value="500">Shared public code (for entire center)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Link Payment Method (Optional)</label>
                      <select
                        value={codePaymentMethodId}
                        onChange={(e) => setCodePaymentMethodId(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                      >
                        <option value="">General Top-Up Code (Unassigned)</option>
                        {paymentMethodsList.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="submit"
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-xl shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
                    >
                      <Zap className="w-4 h-4 fill-slate-950" />
                      <span>Generate {codeCount} Top-Up Codes & Save to Platform & Supabase ⚡</span>
                    </button>
                  </div>
                </form>

                {/* Direct Custom Code Creation Form */}
                <form
                  onSubmit={handleCreateCustomCode}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-blue-500/30 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-black text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                      <Plus className="w-4 h-4" />
                      <span>Create Custom Named/Numbered Code (Active Immediately)</span>
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Custom Code String *
                      </label>
                      <input
                        type="text"
                        required
                        value={customCodeString}
                        onChange={(e) => setCustomCodeString(e.target.value.toUpperCase())}
                        placeholder="e.g., ENG-VIP-500"
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Code Type
                      </label>
                      <select
                        value={customCodeType}
                        onChange={(e) => {
                          const v = e.target.value as 'balance' | 'course';
                          setCustomCodeType(v);
                          if (v === 'course' && !customCodeCourseId && allCourses.length > 0) {
                            setCustomCodeCourseId(allCourses[0].id);
                          }
                        }}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                      >
                        <option value="balance">Wallet Balance (EGP)</option>
                        <option value="course">Unlock Specific Course</option>
                      </select>
                    </div>

                    {customCodeType === 'course' ? (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                          Target Course
                        </label>
                        <select
                          value={customCodeCourseId}
                          onChange={(e) => setCustomCodeCourseId(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                        >
                          {allCourses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                          Value (EGP)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={customCodeAmount}
                          onChange={(e) => setCustomCodeAmount(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Max Uses / Payment Method
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          min="1"
                          value={customCodeMaxUses}
                          onChange={(e) => setCustomCodeMaxUses(e.target.value)}
                          title="Max usage count"
                          className="w-16 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-mono text-slate-900 dark:text-white"
                        />
                        <select
                          value={customCodePaymentMethodId}
                          onChange={(e) => setCustomCodePaymentMethodId(e.target.value)}
                          className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-900 dark:text-white"
                        >
                          <option value="">General</option>
                          {paymentMethodsList.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow cursor-pointer"
                      >
                        Save & Activate Code
                      </button>
                    </div>
                  </div>
                </form>

                {/* Batch Generated Box */}
                {generatedBatchCodes.length > 0 && (
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-amber-500/40 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                        Successfully generated and saved {generatedBatchCodes.length} new codes!
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPrintCardsModal(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Preview & Print Center Cards 🖨️</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyGeneratedCodes}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedCodesSuccess ? 'Copied to Clipboard ✓' : 'Copy All Codes'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="max-h-36 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-3 rounded-xl font-mono text-[11px] text-slate-700 dark:text-slate-300 space-y-1 select-all">
                      {generatedBatchCodes.slice(0, 50).map((code, idx) => (
                        <div key={idx} className="flex justify-between items-center py-0.5">
                          <span>{code}</span>
                          <span className="text-amber-600 dark:text-amber-400 font-sans text-[10px]">
                            {codeType === 'course' ? 'Course Activation Card' : `[${codeAmount} EGP]`}
                          </span>
                        </div>
                      ))}
                      {generatedBatchCodes.length > 50 && (
                        <p className="text-center text-amber-600 dark:text-amber-400 pt-1">
                          ... and more ({generatedBatchCodes.length} total codes) - click Copy or Print above.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Codes Search & List */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Stored Codes Directory ({allCodes.length} codes)</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Available top-up and activation codes in database and student wallets</p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setGeneratedBatchCodes(allCodes.map((c) => c.code));
                        setShowPrintCardsModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-400 border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Scratch Cards</span>
                    </button>
                    <input
                      type="text"
                      value={codeSearch}
                      onChange={(e) => setCodeSearch(e.target.value)}
                      placeholder="Search for a code..."
                      className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono w-44"
                    />
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                  {allCodes.slice(0, 100).map((c) => (
                    <div key={c.code} className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-100/70 dark:hover:bg-slate-900/40 px-2 rounded-lg">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">{c.code}</span>
                          {c.codeType === 'course' ? (
                            <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 text-[10px] font-bold">
                              Course Card: {c.targetCourseTitle || 'Lecture'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold font-mono">
                              Balance: {c.amount} EGP
                            </span>
                          )}
                          {c.paymentMethodName && (
                            <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-400 text-[10px] font-bold">
                              {c.paymentMethodName}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                          Uses: {c.usedCount} of {c.maxUses} {c.usedCount >= c.maxUses && '• (Fully Redeemed)'}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          platformDB.deleteRedeemCode(c.code);
                          onDataChanged();
                        }}
                        className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1"
                        title="Delete code"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 12: SETTINGS, DYNAMIC ACADEMIC YEAR & SUPABASE CLOUD SETUP */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Dynamic Academic Year & Branding */}
              <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Academic Year & Dynamic Branding Settings
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Change the "Current Academic Year" (e.g., 2026, 2027, 2028...) and update it dynamically across the top Navbar, site footer, and welcome banner.
                </p>

                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                        Current Platform Academic Year (Dynamic):
                      </label>
                      <input
                        type="text"
                        required
                        value={tempYear}
                        onChange={(e) => setTempYear(e.target.value)}
                        placeholder="2026, 2027, or 2028"
                        className="w-full bg-white dark:bg-slate-900 border border-amber-500/50 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Official Platform Name:</label>
                      <input
                        type="text"
                        required
                        value={tempPlatformName}
                        onChange={(e) => setTempPlatformName(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Platform Appearance & Themes */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        Platform Colors & Page Layout Density:
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Theme Colors */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] text-slate-700 dark:text-slate-300 font-semibold">
                          Primary Brand Color (Theme Accent):
                        </label>
                        <div className="grid grid-cols-6 gap-2">
                          {[
                            { id: 'amber', name: 'Gold', hex: '#F59E0B', bg: 'bg-amber-500' },
                            { id: 'blue', name: 'Blue', hex: '#2563EB', bg: 'bg-blue-600' },
                            { id: 'emerald', name: 'Emerald', hex: '#10B981', bg: 'bg-emerald-600' },
                            { id: 'purple', name: 'Purple', hex: '#8B5CF6', bg: 'bg-purple-600' },
                            { id: 'rose', name: 'Rose', hex: '#F43F5E', bg: 'bg-rose-600' },
                            { id: 'cyan', name: 'Cyan', hex: '#06B6D4', bg: 'bg-cyan-500' },
                          ].map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setTempColorTheme(t.id as any);
                                const updated = platformDB.updateSettings({ colorTheme: t.id as any });
                                onSettingsUpdated(updated);
                              }}
                              className={`p-2 rounded-xl flex flex-col items-center gap-1 border transition-all ${
                                tempColorTheme === t.id
                                  ? 'border-amber-500 bg-amber-50 dark:bg-slate-800 ring-2 ring-amber-400 scale-105'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full ${t.bg} shadow-md`} />
                              <span className="text-[10px] text-slate-700 dark:text-slate-300 font-medium">{t.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Layout Density */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] text-slate-700 dark:text-slate-300 font-semibold">
                          Page & Card Layout Style (Instant Save & Apply):
                        </label>
                        <select
                          value={tempPageLayout}
                          onChange={(e: any) => {
                            const val = e.target.value;
                            setTempPageLayout(val);
                            const updated = platformDB.updateSettings({ pageLayout: val });
                            onSettingsUpdated(updated);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                        >
                          <option value="comfortable">Comfortable (Spacious Luxury Default)</option>
                          <option value="compact">Compact (Fast & Ideal for Mobile Screens)</option>
                          <option value="modern">Modern (With Glass Effects & Modern Gradients)</option>
                        </select>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Applies and saves immediately across all platform cards and sections.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* GitHub & Vercel Deployment Integration Box */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        GitHub Repository & Continuous Vercel Deployment:
                      </h4>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2">
                      <p className="leading-relaxed">
                        The platform is 100% ready to connect with Miss Asmaa's GitHub repository and includes <code className="text-amber-600 dark:text-amber-400 font-mono">vercel.json</code> for instant deployment:
                      </p>
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 select-all space-y-1">
                        <div># 1. Connect GitHub repository:</div>
                        <div className="text-blue-600 dark:text-blue-400">git remote add origin https://github.com/YourUsername/english-with-miss-asmaa.git</div>
                        <div className="text-blue-600 dark:text-blue-400">git branch -M main && git push -u origin main</div>
                        <div className="pt-1 text-slate-500 dark:text-slate-400"># 2. On Vercel: click Import and add environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).</div>
                      </div>
                    </div>
                  </div>

                  {/* Supabase Cloud Connection & Vercel Integration */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          Direct Supabase Cloud Database & Storage Connection:
                        </h4>
                      </div>

                      <a
                        href="/api/supabase-schema"
                        download="supabase_schema.sql"
                        className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400 border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download SQL Schema Script</span>
                      </a>
                    </div>

                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400/90 leading-relaxed bg-emerald-50 dark:bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-500/30">
                      💡 <strong>Note for Teacher:</strong> If you have a Supabase URL and Anon Key, enter them below and click "Test Connection" to link and verify!
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Supabase Project URL:</label>
                        <input
                          type="text"
                          value={tempSupabaseUrl}
                          onChange={(e) => setTempSupabaseUrl(e.target.value)}
                          placeholder="https://xyzcompany.supabase.co"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Supabase Anon Key:</label>
                        <input
                          type="password"
                          value={tempSupabaseKey}
                          onChange={(e) => setTempSupabaseKey(e.target.value)}
                          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleTestSupabase}
                        className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-slate-300 dark:border-slate-700"
                      >
                        Test Supabase Connection 🔌
                      </button>

                      {supabaseTestMsg && (
                        <span
                          className={`text-xs ${
                            supabaseTestMsg.success ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {supabaseTestMsg.text}
                        </span>
                      )}
                    </div>
                  </div>

                  {settingsSavedSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500 text-emerald-700 dark:text-emerald-300 text-xs font-bold text-center animate-in fade-in">
                      ✓ All settings saved and applied across the platform successfully! ✨
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      className="px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-xl shadow-amber-500/25"
                    >
                      Save & Apply All Settings Now ✨
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
      </Modal>

      {/* SCRATCH CARDS PRINT PREVIEW MODAL */}
      <Modal
        isOpen={showPrintCardsModal}
        onClose={() => setShowPrintCardsModal(false)}
        maxWidthClass="max-w-5xl"
        overlayClassName="z-[60] bg-slate-950/75 dark:bg-black/90 backdrop-blur-xl"
        panelClassName="bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700"
        headerClassName="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
        bodyClassName="p-4 sm:p-6 space-y-6 bg-slate-100 dark:bg-slate-950"
        headerContent={
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                Printable Center Scratch Cards Preview (Center Scratch Cards)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Official Miss Asmaa scratch cards ready for A4 or heavy cardstock printing for center students.
              </p>
            </div>
          </div>
        }
        headerActions={
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[40px] flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold text-xs shadow-lg cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print Cards Now (Print)</span>
            <span className="sm:hidden">Print</span>
          </button>
        }
      >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(generatedBatchCodes.length > 0 ? generatedBatchCodes : allCodes.slice(0, 18).map((c) => c.code)).map(
                  (code, idx) => (
                    <div
                      key={idx}
                      className="relative p-4 rounded-2xl bg-white dark:bg-[#0F172A] border-2 border-dashed border-amber-500/50 text-left flex flex-col justify-between shadow-xl space-y-3"
                    >
                      {/* Card Top Brand */}
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full overflow-hidden border border-amber-500">
                            <BrandLogo className="w-full h-full" />
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-900 dark:text-white block">Miss Asmaa</span>
                            <span className="text-[9px] text-amber-600 dark:text-amber-400">English for Secondary Stage</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {settings.academicYear}
                        </span>
                      </div>

                      {/* Card Title & Value */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          {codeType === 'course' ? 'Center Course Activation Card' : 'Wallet Top-Up Scratch Card'}
                        </span>
                        <div className="text-sm font-black text-amber-600 dark:text-amber-400">
                          {codeType === 'course'
                            ? (allCourses.find((c) => c.id === selectedCourseForCode)?.title || 'Selected Lecture')
                            : `Card Value: ${codeAmount} EGP`}
                        </div>
                      </div>

                      {/* Scratch Box / PIN */}
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                          <span>Scratch gently to reveal activation code:</span>
                          <span className="font-mono text-slate-500">SN #{idx + 1001}</span>
                        </span>
                        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-amber-500/50 text-center font-mono font-black text-base text-slate-900 dark:text-white tracking-widest shadow-inner select-all">
                          {code}
                        </div>
                      </div>

                      {/* Realistic Barcode Graphic & Instructions */}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400">
                        <div className="font-mono tracking-tighter text-slate-400 dark:text-slate-600 select-none text-[8px]">
                          |||||| |||| ||||||| ||| |||||||
                        </div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Support: 01069780486</span>
                      </div>
                    </div>
                  )
                )}
              </div>
      </Modal>

      {/* In-Platform Video Player Preview for Admin */}
      {previewCourseModal && (
        <VideoPlayerModal
          lecture={previewCourseModal}
          currentUser={platformDB.getCurrentUser()}
          onClose={() => setPreviewCourseModal(null)}
          onMarkCompleted={() => {}}
          isCompleted={false}
        />
      )}

      {/* In-Platform Document Viewer Preview for Admin */}
      {previewDocModal && (
        <DocumentViewerModal
          document={previewDocModal}
          currentUser={platformDB.getCurrentUser()}
          onClose={() => setPreviewDocModal(null)}
        />
      )}

      {/* Modal: Gift Free Courses, Videos & Files to Student */}
      <Modal
        isOpen={Boolean(giftModalStudent)}
        onClose={() => !isSavingGift && setGiftModalStudent(null)}
        closeDisabled={isSavingGift}
        maxWidthClass="max-w-2xl"
        overlayClassName="z-[70] bg-black/75 backdrop-blur-md"
        panelClassName="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700"
        headerClassName="px-4 sm:px-5 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
        bodyClassName="p-4 sm:p-5 space-y-5"
        footerClassName="px-4 sm:px-5 py-3.5 sm:py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
        headerContent={
          giftModalStudent ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Gift className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                  Grant Free Courses & Files
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Student: <strong className="text-amber-600 dark:text-amber-400">{giftModalStudent.fullName}</strong> ({giftModalStudent.studentCode})
                </p>
              </div>
            </div>
          ) : null
        }
        subHeader={
          <div className="px-4 sm:px-5 pt-4 pb-1">
            <div className="relative">
              <input
                type="text"
                value={giftSearchQuery}
                onChange={(e) => setGiftSearchQuery(e.target.value)}
                placeholder="Search for a paid course, video, or file..."
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 pl-9 text-xs text-slate-900 dark:text-white"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        }
        footer={
          <>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
              Content is unlocked for free without deducting from the student's wallet
            </span>
            <div className="flex items-center gap-2 ml-auto sm:ml-0">
              <button
                type="button"
                disabled={isSavingGift}
                onClick={() => setGiftModalStudent(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingGift}
                onClick={() => void handleConfirmGiftContent()}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-extrabold shadow-lg flex items-center gap-2 cursor-pointer"
              >
                {isSavingGift ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Confirm Grant</span>
              </button>
            </div>
          </>
        }
      >
        {giftModalStudent && (
          <>
              {/* Paid Courses & Videos */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-blue-500" />
                    <span>Paid Courses & Videos</span>
                  </h4>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    Selected: {giftSelectedCourseIds.length}
                  </span>
                </div>

                {allCourses.filter((c) => !c.isFree && (!giftSearchQuery.trim() || c.title.toLowerCase().includes(giftSearchQuery.toLowerCase()) || c.chapter.toLowerCase().includes(giftSearchQuery.toLowerCase()))).length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                    No matching paid courses found
                  </p>
                ) : (
                  <div className="space-y-2">
                    {allCourses
                      .filter(
                        (c) =>
                          !c.isFree &&
                          (!giftSearchQuery.trim() ||
                            c.title.toLowerCase().includes(giftSearchQuery.toLowerCase()) ||
                            c.chapter.toLowerCase().includes(giftSearchQuery.toLowerCase()))
                      )
                      .map((course) => {
                        const checked = giftSelectedCourseIds.includes(course.id);
                        const wasAlreadyGranted = (giftModalStudent.enrolledCourses || []).includes(course.id);
                        const lessonCount = getCourseLessons(course).length;
                        return (
                          <label
                            key={course.id}
                            className={`flex items-center justify-between gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                              checked
                                ? 'bg-amber-500/10 border-amber-500/50'
                                : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setGiftSelectedCourseIds((prev) => Array.from(new Set([...prev, course.id])));
                                  } else {
                                    setGiftSelectedCourseIds((prev) => prev.filter((id) => id !== course.id));
                                  }
                                }}
                                className="w-4 h-4 accent-amber-500 rounded shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                                  {course.title}
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                  {course.chapter} · {course.grade} · {lessonCount} lessons
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 block tabular-nums">
                                {course.price} EGP
                              </span>
                              {wasAlreadyGranted && (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  Already Granted ✓
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Files & Documents */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-500" />
                    <span>Platform Files & Study Notes</span>
                  </h4>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    Selected: {giftSelectedDocIds.length}
                  </span>
                </div>

                {allDocuments.filter((d) => !giftSearchQuery.trim() || d.title.toLowerCase().includes(giftSearchQuery.toLowerCase())).length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                    No matching files found
                  </p>
                ) : (
                  <div className="space-y-2">
                    {allDocuments
                      .filter(
                        (d) =>
                          !giftSearchQuery.trim() ||
                          d.title.toLowerCase().includes(giftSearchQuery.toLowerCase())
                      )
                      .map((doc) => {
                        const checked = giftSelectedDocIds.includes(doc.id);
                        const wasAlreadyGranted = (giftModalStudent.grantedDocuments || []).includes(doc.id);
                        return (
                          <label
                            key={doc.id}
                            className={`flex items-center justify-between gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                              checked
                                ? 'bg-emerald-500/10 border-emerald-500/50'
                                : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setGiftSelectedDocIds((prev) => Array.from(new Set([...prev, doc.id])));
                                  } else {
                                    setGiftSelectedDocIds((prev) => prev.filter((id) => id !== doc.id));
                                  }
                                }}
                                className="w-4 h-4 accent-emerald-500 rounded shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                                  {doc.title}
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                  {doc.docType} · {doc.grade} · {doc.pagesCount} pages
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                                {doc.price && doc.price > 0 ? `${doc.price} EGP` : 'File / Study Notes'}
                              </span>
                              {wasAlreadyGranted && (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  Already Granted ✓
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                  </div>
                )}
              </div>
          </>
        )}
      </Modal>

      {/* Modal: Manual Student Wallet Balance Adjustment */}
      <Modal
        isOpen={Boolean(balanceModalStudent)}
        onClose={() => !isSavingBalance && setBalanceModalStudent(null)}
        closeDisabled={isSavingBalance}
        maxWidthClass="max-w-md"
        overlayClassName="z-[70] bg-black/75 backdrop-blur-md"
        panelClassName="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700"
        headerClassName="px-4 sm:px-5 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
        bodyClassName="p-4 sm:p-5"
        headerContent={
          balanceModalStudent ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  Manual Balance Edit & Recharge
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {balanceModalStudent.fullName} ({balanceModalStudent.studentCode})
                </p>
              </div>
            </div>
          ) : null
        }
      >
        {balanceModalStudent && (
            <form onSubmit={handleConfirmManualBalance} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Current Wallet Balance:</span>
                <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {balanceModalStudent.balance} EGP
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setBalanceActionMode('add');
                    setBalanceAmountInput('100');
                  }}
                  className={`py-2 rounded-lg transition-colors ${
                    balanceActionMode === 'add'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Add to Balance (+)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBalanceActionMode('set');
                    setBalanceAmountInput(String(balanceModalStudent.balance || 0));
                  }}
                  className={`py-2 rounded-lg transition-colors ${
                    balanceActionMode === 'set'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Set Balance Directly (=)
                </button>
              </div>

              {balanceActionMode === 'add' && (
                <div className="flex items-center gap-2">
                  {[50, 100, 200, 500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBalanceAmountInput(String(preset))}
                      className="flex-1 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-xs tabular-nums"
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {balanceActionMode === 'add' ? 'Amount to Add (EGP):' : 'New Total Balance (EGP):'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={balanceAmountInput}
                  onChange={(e) => setBalanceAmountInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-800 dark:text-amber-300">Balance After Save:</span>
                <span className="font-mono font-black text-amber-700 dark:text-amber-400 text-sm tabular-nums">
                  {(balanceActionMode === 'add'
                    ? (balanceModalStudent.balance || 0) + (parseFloat(balanceAmountInput) || 0)
                    : parseFloat(balanceAmountInput) || 0
                  )}{' '}
                  EGP
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingBalance}
                  onClick={() => setBalanceModalStudent(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBalance}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-extrabold shadow-lg flex items-center gap-2"
                >
                  {isSavingBalance ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save New Balance</span>
                </button>
              </div>
            </form>
        )}
      </Modal>

      {/* Support Image Zoom Lightbox */}
      {supportLightboxUrl && (
        <div
          className="fixed inset-0 z-[75] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSupportLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setSupportLightboxUrl(null)}
            className="fixed top-4 right-4 w-11 h-11 rounded-full bg-white/15 hover:bg-red-600 text-white flex items-center justify-center shadow-xl border border-white/20 cursor-pointer"
            aria-label="Close image"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={supportLightboxUrl}
            alt="Image preview"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[88vh] rounded-2xl object-contain shadow-2xl border border-white/10"
          />
        </div>
      )}
    </>
  );
};
