/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  MessageCircle,
  Phone,
  Send,
  CheckCircle,
  Image as ImageIcon,
  Mic,
  Square,
  Upload,
  Trash2,
  X,
  Lock,
  Loader2,
  AlertCircle,
  RefreshCw,
  Reply,
  ZoomIn,
  Volume2,
} from 'lucide-react';
import {
  UserProfile,
  PlatformSettings,
  SupportThread,
  SupportMessage,
} from '../types';
import { platformDB } from '../lib/storage';
import { generateUuid } from '../lib/supabase';
import { uploadFileWithRealProgress, UploadProgressInfo } from '../lib/uploadManager';
import { useLanguage, formatTemplate } from '../lib/translations';
import { UploadProgressBar } from './UploadProgressBar';
import { BrandLogo } from './BrandLogo';

interface SupportSectionProps {
  currentUser: UserProfile | null;
  settings: PlatformSettings;
  supportThreads?: SupportThread[];
  onDataChanged?: () => void;
}

function pickSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

function extensionForAudioMime(mime: string): string {
  const lower = (mime || '').toLowerCase();
  if (lower.includes('mp4') || lower.includes('aac') || lower.includes('m4a')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('wav')) return 'wav';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  return 'webm';
}

export const SupportSection: React.FC<SupportSectionProps> = ({
  currentUser,
  settings,
  supportThreads,
  onDataChanged,
}) => {
  const { locale, t } = useLanguage();
  // New question composer state
  const [senderName, setSenderName] = useState(currentUser?.fullName || '');
  const [inquiryPhone, setInquiryPhone] = useState(currentUser?.phone || '');
  const [inquiryPage, setInquiryPage] = useState('');
  const [inquiryQuestionNumber, setInquiryQuestionNumber] = useState('');
  const [inquiryText, setInquiryText] = useState('');

  // Image attachment state (File held in memory for upload to Supabase Storage on submit)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string>('');

  // Voice recording / audio attachment state
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null);
  const [pendingAudioPreview, setPendingAudioPreview] = useState<string>('');
  const [pendingAudioDuration, setPendingAudioDuration] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef<number>(0);

  // Submission & Upload progress state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Private threads list & interactions
  const [localThreads, setLocalThreads] = useState<SupportThread[]>(() =>
    platformDB.getMySupportThreads(currentUser)
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Follow-up reply inside an existing thread
  const [replyOpenThreadId, setReplyOpenThreadId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState('');
  const [followUpImageFile, setFollowUpImageFile] = useState<File | null>(null);
  const [followUpImagePreview, setFollowUpImagePreview] = useState<string>('');
  const [followUpAudioFile, setFollowUpAudioFile] = useState<File | null>(null);
  const [followUpAudioPreview, setFollowUpAudioPreview] = useState<string>('');
  const [followUpAudioDuration, setFollowUpAudioDuration] = useState<number>(0);
  const [isRecordingFollowUp, setIsRecordingFollowUp] = useState(false);
  const [followUpRecSeconds, setFollowUpRecSeconds] = useState(0);
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const followUpRecorderRef = useRef<MediaRecorder | null>(null);
  const followUpStreamRef = useRef<MediaStream | null>(null);
  const followUpChunksRef = useRef<BlobPart[]>([]);
  const followUpTimerRef = useRef<number | null>(null);
  const followUpSecondsRef = useRef<number>(0);

  useEffect(() => {
    if (currentUser?.fullName) setSenderName(currentUser.fullName);
    if (currentUser?.phone) setInquiryPhone(currentUser.phone);
  }, [currentUser?.id, currentUser?.fullName, currentUser?.phone]);

  useEffect(() => {
    const ownerKey = platformDB.getSupportOwnerKey(currentUser);
    const deviceGuestKey = `guest:${platformDB.getSupportGuestId()}`;
    const targetStudentUuid = currentUser?.id ? currentUser.id.toLowerCase() : '';
    if (Array.isArray(supportThreads)) {
      const filtered = supportThreads.filter((t) => {
        if (!t) return false;
        if (t.ownerKey === ownerKey) return true;
        if (currentUser?.id) {
          if (t.studentId && t.studentId.toLowerCase() === targetStudentUuid) return true;
          if (t.ownerKey === deviceGuestKey && !t.studentId) return true;
        }
        return false;
      });
      setLocalThreads(filtered.length > 0 ? filtered : platformDB.getMySupportThreads(currentUser));
    } else {
      setLocalThreads(platformDB.getMySupportThreads(currentUser));
    }
  }, [supportThreads, currentUser]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (followUpTimerRef.current) window.clearInterval(followUpTimerRef.current);
      if (followUpStreamRef.current) followUpStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const clearPendingImage = () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImageFile(null);
    setPendingImagePreview('');
  };

  const clearPendingAudio = () => {
    if (pendingAudioPreview) URL.revokeObjectURL(pendingAudioPreview);
    setPendingAudioFile(null);
    setPendingAudioPreview('');
    setPendingAudioDuration(0);
    setRecordingSeconds(0);
  };

  const clearFollowUpAttachments = () => {
    if (followUpImagePreview) URL.revokeObjectURL(followUpImagePreview);
    if (followUpAudioPreview) URL.revokeObjectURL(followUpAudioPreview);
    setFollowUpImageFile(null);
    setFollowUpImagePreview('');
    setFollowUpAudioFile(null);
    setFollowUpAudioPreview('');
    setFollowUpAudioDuration(0);
    setFollowUpRecSeconds(0);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setSubmitError(t.support.errImageTooLarge);
      return;
    }
    setSubmitError(null);
    clearPendingImage();
    setPendingImageFile(file);
    setPendingImagePreview(URL.createObjectURL(file));
  };

  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setSubmitError(t.support.errAudioTooLarge);
      return;
    }
    setRecorderError(null);
    setSubmitError(null);
    clearPendingAudio();
    setPendingAudioFile(file);
    setPendingAudioPreview(URL.createObjectURL(file));
    setPendingAudioDuration(0);
  };

  const handleStartRecording = async () => {
    setRecorderError(null);
    setSubmitError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecorderError(t.support.errNoRecorderSupport);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const supportedMime = pickSupportedAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = supportedMime
          ? new MediaRecorder(stream, { mimeType: supportedMime, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const mime = recorder.mimeType || supportedMime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        const ext = extensionForAudioMime(mime);
        const audioFile = new File([blob], `student_voice_${Date.now()}.${ext}`, { type: mime });
        clearPendingAudio();
        setPendingAudioFile(audioFile);
        setPendingAudioPreview(URL.createObjectURL(blob));
        setPendingAudioDuration(secondsRef.current);

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
      };

      secondsRef.current = 0;
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start(250);

      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setRecordingSeconds(secondsRef.current);
        if (secondsRef.current >= 180) {
          handleStopRecording();
        }
      }, 1000);
    } catch {
      setRecorderError(t.support.errMicAccess);
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecording(false);
  };

  // Follow-up voice recording inside an existing thread
  const handleStartFollowUpRecording = async () => {
    setRecorderError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecorderError(t.support.errNoRecorderSupport);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      followUpStreamRef.current = stream;
      followUpChunksRef.current = [];
      const supportedMime = pickSupportedAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = supportedMime
          ? new MediaRecorder(stream, { mimeType: supportedMime, audioBitsPerSecond: 32000 })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      followUpRecorderRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) followUpChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || supportedMime || 'audio/webm';
        const blob = new Blob(followUpChunksRef.current, { type: mime });
        const ext = extensionForAudioMime(mime);
        const file = new File([blob], `followup_voice_${Date.now()}.${ext}`, { type: mime });
        if (followUpAudioPreview) URL.revokeObjectURL(followUpAudioPreview);
        setFollowUpAudioFile(file);
        setFollowUpAudioPreview(URL.createObjectURL(blob));
        setFollowUpAudioDuration(followUpSecondsRef.current);
        if (followUpStreamRef.current) {
          followUpStreamRef.current.getTracks().forEach((t) => t.stop());
          followUpStreamRef.current = null;
        }
      };
      followUpSecondsRef.current = 0;
      setFollowUpRecSeconds(0);
      setIsRecordingFollowUp(true);
      recorder.start(250);
      followUpTimerRef.current = window.setInterval(() => {
        followUpSecondsRef.current += 1;
        setFollowUpRecSeconds(followUpSecondsRef.current);
        if (followUpSecondsRef.current >= 180) handleStopFollowUpRecording();
      }, 1000);
    } catch {
      setRecorderError(t.support.errMicAccessShort);
      setIsRecordingFollowUp(false);
    }
  };

  const handleStopFollowUpRecording = () => {
    if (followUpTimerRef.current) {
      window.clearInterval(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
    if (followUpRecorderRef.current && followUpRecorderRef.current.state !== 'inactive') {
      try {
        followUpRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecordingFollowUp(false);
  };

  const handleSendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isRecording) return;

    const cleanText = inquiryText.trim();
    if (!cleanText && !pendingImageFile && !pendingAudioFile) {
      setSubmitError(t.support.errEmptyInquiry);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    setUploadProgress(null);

    try {
      let uploadedImageUrl: string | undefined;
      let uploadedAudioUrl: string | undefined;

      if (pendingImageFile) {
        const imgRes = await uploadFileWithRealProgress(
          pendingImageFile,
          'Files',
          (info) => setUploadProgress(info),
          'support_media'
        );
        if (!imgRes.success || !imgRes.url) {
          setSubmitError(formatTemplate(t.support.errImgUpload, { err: imgRes.error || t.common.unknown }));
          return;
        }
        uploadedImageUrl = imgRes.url;
      }

      if (pendingAudioFile) {
        const audRes = await uploadFileWithRealProgress(
          pendingAudioFile,
          'Files',
          (info) => setUploadProgress(info),
          'support_media'
        );
        if (!audRes.success || !audRes.url) {
          setSubmitError(formatTemplate(t.support.errAudioUpload, { err: audRes.error || t.common.unknown }));
          return;
        }
        uploadedAudioUrl = audRes.url;
      }

      const now = new Date().toISOString();
      const ownerKey = platformDB.getSupportOwnerKey(currentUser);
      const displayName =
        senderName.trim() ||
        currentUser?.fullName ||
        (inquiryPhone.trim() ? formatTemplate(t.support.userPhoneLabel, { phone: inquiryPhone.trim() }) : t.support.guestLabel);

      const firstMessage: SupportMessage = {
        id: generateUuid(),
        senderRole: 'student',
        senderName: displayName,
        text: cleanText || undefined,
        imageUrl: uploadedImageUrl,
        audioUrl: uploadedAudioUrl,
        audioDurationSeconds: pendingAudioDuration > 0 ? pendingAudioDuration : undefined,
        createdAt: now,
      };

      const thread: SupportThread = {
        id: generateUuid(),
        ownerKey,
        studentId: currentUser?.id || undefined,
        studentName: displayName,
        studentCode: currentUser?.studentCode || undefined,
        studentPhone: inquiryPhone.trim() || currentUser?.phone || undefined,
        studentGrade: currentUser?.grade || undefined,
        pageNumber: inquiryPage.trim() || undefined,
        questionNumber: inquiryQuestionNumber.trim() || undefined,
        status: 'open',
        messages: [firstMessage],
        createdAt: now,
        updatedAt: now,
      };

      const { supabaseResult } = await platformDB.saveSupportThreadAsync(thread);
      if (!supabaseResult.success) {
        setSubmitError(
          supabaseResult.error || t.support.errSaveQuestion
        );
        return;
      }

      setInquiryText('');
      setInquiryPage('');
      setInquiryQuestionNumber('');
      clearPendingImage();
      clearPendingAudio();
      setUploadProgress(null);
      setLocalThreads(platformDB.getMySupportThreads(currentUser));
      onDataChanged?.();
      setSubmitSuccess(t.support.successQuestionSent);
      window.setTimeout(() => setSubmitSuccess(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendFollowUp = async (threadId: string) => {
    if (isSendingFollowUp || isRecordingFollowUp) return;
    const cleanText = followUpText.trim();
    if (!cleanText && !followUpImageFile && !followUpAudioFile) return;

    setIsSendingFollowUp(true);
    setSubmitError(null);

    try {
      let uploadedImageUrl: string | undefined;
      let uploadedAudioUrl: string | undefined;

      if (followUpImageFile) {
        const res = await uploadFileWithRealProgress(followUpImageFile, 'Files', undefined, 'support_media');
        if (!res.success || !res.url) {
          setSubmitError(formatTemplate(t.support.errImgUpload, { err: res.error || t.common.unknown }));
          return;
        }
        uploadedImageUrl = res.url;
      }

      if (followUpAudioFile) {
        const res = await uploadFileWithRealProgress(followUpAudioFile, 'Files', undefined, 'support_media');
        if (!res.success || !res.url) {
          setSubmitError(formatTemplate(t.support.errAudioUpload, { err: res.error || t.common.unknown }));
          return;
        }
        uploadedAudioUrl = res.url;
      }

      const msg: SupportMessage = {
        id: generateUuid(),
        senderRole: 'student',
        senderName: currentUser?.fullName || senderName.trim() || t.common.student,
        text: cleanText || undefined,
        imageUrl: uploadedImageUrl,
        audioUrl: uploadedAudioUrl,
        audioDurationSeconds: followUpAudioDuration > 0 ? followUpAudioDuration : undefined,
        createdAt: new Date().toISOString(),
      };

      const { supabaseResult } = await platformDB.appendSupportMessageAsync(threadId, msg, 'open');
      if (!supabaseResult.success) {
        setSubmitError(supabaseResult.error || t.support.errSaveFollowUp);
        return;
      }

      setFollowUpText('');
      clearFollowUpAttachments();
      setReplyOpenThreadId(null);
      setLocalThreads(platformDB.getMySupportThreads(currentUser));
      onDataChanged?.();
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  const handleDeleteMyThread = async (threadId: string) => {
    if (deletingThreadId) return;
    setDeletingThreadId(threadId);
    setSubmitError(null);
    try {
      const { supabaseResult } = await platformDB.deleteSupportThreadAsync(threadId);
      if (!supabaseResult.success) {
        setSubmitError(supabaseResult.error || t.support.errDeleteThread);
        return;
      }
      setLocalThreads(platformDB.getMySupportThreads(currentUser));
      onDataChanged?.();
      setSubmitSuccess(t.support.successThreadDeleted);
      window.setTimeout(() => setSubmitSuccess(null), 3500);
    } finally {
      setDeletingThreadId(null);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await platformDB.syncWithSupabase();
      setLocalThreads(platformDB.getMySupportThreads(currentUser));
      onDataChanged?.();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* 1. Official Communication Header */}
      <div className="bg-white dark:bg-[#0F172A] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 text-start">
          <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 to-blue-500 shadow-xl shrink-0">
            <BrandLogo className="w-full h-full rounded-full" />
          </div>
          <div>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {t.support.officialContactBadge}
            </span>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {t.support.mainHeaderTitle}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t.support.mainHeaderDesc}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <a
            href={`https://wa.me/2${settings.supportPhone || '01069780486'}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 min-h-[44px] px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-emerald-600/30 transition-all whitespace-nowrap shrink-0"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{t.support.directWhatsappBtn}</span>
          </a>

          <a
            href={`tel:${settings.supportPhone || '01069780486'}`}
            className="flex items-center gap-2 min-h-[44px] px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-blue-600/30 transition-all whitespace-nowrap shrink-0"
          >
            <Phone className="w-4 h-4" />
            <span dir="ltr">{settings.supportPhone || '01069780486'}</span>
          </a>
        </div>
      </div>

      {/* 2. Private Inquiry & Question Composer (Text + Image + Voice) */}
      <div className="bg-white dark:bg-[#0F172A] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {t.support.composerTitle}
            </h3>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t.support.privacyNote}</span>
          </span>
        </div>

        {submitError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/35 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {submitSuccess && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{submitSuccess}</span>
          </div>
        )}

        <form onSubmit={handleSendInquiry} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.support.nameFieldLabel}
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder={t.support.nameFieldPlaceholder}
                className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.support.phoneOptLabel}
              </label>
              <input
                type="text"
                dir="ltr"
                value={inquiryPhone}
                onChange={(e) => setInquiryPhone(e.target.value)}
                placeholder="010XXXXXXXX"
                className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.support.pageNumOptLabel}
              </label>
              <input
                type="text"
                value={inquiryPage}
                onChange={(e) => setInquiryPage(e.target.value)}
                placeholder={t.support.pageNumPlaceholder}
                className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.support.questionNumOptLabel}
              </label>
              <input
                type="text"
                value={inquiryQuestionNumber}
                onChange={(e) => setInquiryQuestionNumber(e.target.value)}
                placeholder={t.support.questionNumPlaceholder}
                className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t.support.inquiryTextLabel}
            </label>
            <textarea
              rows={3}
              value={inquiryText}
              onChange={(e) => setInquiryText(e.target.value)}
              placeholder={t.support.inquiryTextPlaceholder}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          {/* Rich Media Attachments: Image + Voice Recording */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-xs font-bold cursor-pointer">
                <ImageIcon className="w-4 h-4" />
                <span>{t.support.attachImageBtn}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </label>

              {!isRecording ? (
                <button
                  type="button"
                  onClick={() => void handleStartRecording()}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>{t.support.recordVoiceBtn}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-bold shadow cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {formatTemplate(t.support.stopRecordingBtn, {
                      time: `${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')}`,
                    })}
                  </span>
                </button>
              )}

              <label className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{t.support.uploadAudioBtn}</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioFileSelect}
                  className="hidden"
                />
              </label>
            </div>

            {recorderError && (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{recorderError}</p>
            )}

            {pendingImagePreview && (
              <div className="relative inline-block rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-1.5">
                <img
                  src={pendingImagePreview}
                  alt={t.support.attachImageBtn}
                  className="max-h-44 rounded-xl object-contain"
                />
                <button
                  type="button"
                  onClick={clearPendingImage}
                  className="absolute top-2.5 end-2.5 w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center shadow cursor-pointer"
                  title={t.support.removeImageTitle}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {pendingAudioPreview && (
              <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <Volume2 className="w-4 h-4 text-blue-500 shrink-0" />
                <audio controls src={pendingAudioPreview} className="flex-1 min-w-[200px] h-9" />
                <button
                  type="button"
                  onClick={clearPendingAudio}
                  className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                  title={t.support.deleteVoiceTitle}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {uploadProgress && <UploadProgressBar info={uploadProgress} />}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isRecording}
            className="w-full min-h-[46px] py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{isSubmitting ? t.support.sendingSupabaseBtn : t.support.sendAutoSaveBtn}</span>
          </button>
        </form>
      </div>

      {/* 3. Private Support Conversations & Teacher Replies (Strictly Scoped to This Student/User) */}
      <div className="bg-white dark:bg-[#0F172A] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-amber-500" />
              <span>{formatTemplate(t.support.inboxTitle, { count: localThreads.length })}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t.support.inboxSubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={isRefreshing}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{t.support.refreshRepliesBtn}</span>
          </button>
        </div>

        {localThreads.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 space-y-2">
            <MessageCircle className="w-9 h-9 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {t.support.emptyInboxTitle}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.support.emptyInboxDesc}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {localThreads.map((thread) => {
              const isDeleting = deletingThreadId === thread.id;
              const isReplyOpen = replyOpenThreadId === thread.id;
              return (
                <div
                  key={thread.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-4 sm:p-5 space-y-3"
                >
                  {/* Clean Metadata Row */}
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {thread.status === 'answered' ? t.support.answeredByTeacher : t.support.awaitingTeacher}
                      </span>
                      {thread.pageNumber && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatTemplate(t.support.pageMeta, { page: thread.pageNumber })}</span>
                        </>
                      )}
                      {thread.questionNumber && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatTemplate(t.support.questionMeta, { num: thread.questionNumber })}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums" dir="ltr">
                        {new Date(thread.updatedAt || thread.createdAt).toLocaleDateString(locale)}
                      </span>
                    </div>

                    {/* Very small discrete dismiss/delete mark */}
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => void handleDeleteMyThread(thread.id)}
                      title={t.support.deleteMessagesTitle}
                      aria-label={t.support.deleteMessagesTitle}
                      className="w-5 h-5 rounded-full text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </button>
                  </div>

                  {/* Conversation Messages */}
                  <div className="space-y-2.5">
                    {thread.messages.map((msg) => {
                      const isAdminMsg = msg.senderRole === 'admin';
                      return (
                        <div
                          key={msg.id}
                          className={`p-3.5 rounded-2xl border ${
                            isAdminMsg
                              ? 'bg-emerald-50/90 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-500/30'
                              : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 text-xs">
                              <span
                                className={`font-black ${
                                  isAdminMsg
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                {isAdminMsg ? t.support.teacherReplyAuthor : msg.senderName || t.support.yourQuestionAuthor}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono tabular-nums" dir="ltr">
                                {new Date(msg.createdAt).toLocaleTimeString(locale, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            {/* Tiny delete mark directly next to the teacher's answer / audio / image */}
                            {isAdminMsg && (
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => void handleDeleteMyThread(thread.id)}
                                title={t.support.deleteMessagesTitle}
                                aria-label={t.support.deleteMessagesTitle}
                                className="w-4 h-4 rounded-full text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/15 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              >
                                {isDeleting ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <X className="w-2.5 h-2.5" />
                                )}
                              </button>
                            )}
                          </div>

                          {msg.text && (
                            <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                              {msg.text}
                            </p>
                          )}

                          {msg.imageUrl && (
                            <div className="mt-2.5 flex items-start gap-1.5">
                              <button
                                type="button"
                                onClick={() => setLightboxImageUrl(msg.imageUrl!)}
                                className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 cursor-pointer"
                              >
                                <img
                                  src={msg.imageUrl}
                                  alt={t.support.imageShort}
                                  referrerPolicy="no-referrer"
                                  className="max-h-56 w-auto object-contain"
                                />
                                <span className="absolute bottom-1.5 end-1.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold flex items-center gap-1 opacity-90 group-hover:opacity-100">
                                  <ZoomIn className="w-3 h-3" />
                                  <span>{t.support.zoomBtn}</span>
                                </span>
                              </button>
                              {isAdminMsg && (
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => void handleDeleteMyThread(thread.id)}
                                  title={t.support.deleteMessagesTitle}
                                  aria-label={t.support.deleteMessagesTitle}
                                  className="w-4 h-4 mt-1 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-500/15 flex items-center justify-center cursor-pointer shrink-0"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          )}

                          {msg.audioUrl && (
                            <div className="mt-2.5 flex items-center gap-1.5">
                              <audio
                                controls
                                preload="metadata"
                                src={msg.audioUrl}
                                className="flex-1 max-w-md h-9"
                              />
                              {isAdminMsg && (
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => void handleDeleteMyThread(thread.id)}
                                  title={t.support.deleteMessagesTitle}
                                  aria-label={t.support.deleteMessagesTitle}
                                  className="w-4 h-4 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-500/15 flex items-center justify-center cursor-pointer shrink-0"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Follow-up button & inline composer */}
                  <div className="pt-1 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (isReplyOpen) {
                          setReplyOpenThreadId(null);
                          clearFollowUpAttachments();
                        } else {
                          setReplyOpenThreadId(thread.id);
                          setFollowUpText('');
                          clearFollowUpAttachments();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>{isReplyOpen ? t.support.cancelFollowUp : t.support.sendFollowUpPrompt}</span>
                    </button>
                  </div>

                  {isReplyOpen && (
                    <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <textarea
                        rows={2}
                        value={followUpText}
                        onChange={(e) => setFollowUpText(e.target.value)}
                        placeholder={t.support.followUpPlaceholder}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/10 text-blue-700 dark:text-blue-300 text-[11px] font-bold cursor-pointer">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>{t.support.imageShort}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) {
                                if (followUpImagePreview) URL.revokeObjectURL(followUpImagePreview);
                                setFollowUpImageFile(f);
                                setFollowUpImagePreview(URL.createObjectURL(f));
                              }
                            }}
                          />
                        </label>

                        {!isRecordingFollowUp ? (
                          <button
                            type="button"
                            onClick={() => void handleStartFollowUpRecording()}
                            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            <span>{t.support.recordVoiceShort}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleStopFollowUpRecording}
                            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold cursor-pointer"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            <span>
                              {formatTemplate(t.support.stopShort, {
                                time: `${Math.floor(followUpRecSeconds / 60)}:${(followUpRecSeconds % 60).toString().padStart(2, '0')}`,
                              })}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={
                            isSendingFollowUp ||
                            isRecordingFollowUp ||
                            (!followUpText.trim() && !followUpImageFile && !followUpAudioFile)
                          }
                          onClick={() => void handleSendFollowUp(thread.id)}
                          className="ms-auto min-h-[36px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                        >
                          {isSendingFollowUp ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>{t.support.sendFollowUpBtn}</span>
                        </button>
                      </div>

                      {followUpImagePreview && (
                        <img
                          src={followUpImagePreview}
                          alt={t.support.imageShort}
                          className="max-h-32 rounded-xl border border-slate-200 dark:border-slate-800"
                        />
                      )}
                      {followUpAudioPreview && (
                        <audio controls src={followUpAudioPreview} className="w-full max-w-sm h-9" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Image Lightbox Modal */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImageUrl(null)}
            className="fixed top-4 end-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
            aria-label={t.support.closeImageAria}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImageUrl}
            alt={t.support.imageShort}
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90dvh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
