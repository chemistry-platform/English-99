/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Play,
  FileText,
  CheckSquare,
  GraduationCap,
  ExternalLink,
  Upload,
  Sparkles,
  Loader2,
  Layers,
  Clock,
  ArrowUp,
  ArrowDown,
  AlignLeft,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';
import {
  CourseLesson,
  LessonSubSection,
  LessonSectionContentType,
  SectionContentItem,
  ExamQuestion,
  ChemistryDocument,
  ExamOrAssignment,
} from '../types';
import {
  LESSON_CONTENT_TYPE_OPTIONS,
  getSectionItems,
  makeItemId,
  makeLessonId,
  makeSectionId,
} from '../lib/courseHelpers';
import {
  uploadFileWithRealProgress,
  validateLinkWithProgress,
  validateDocumentLinkWithProgress,
  UploadProgressInfo,
} from '../lib/uploadManager';
import { UploadProgressBar } from './UploadProgressBar';
import { detectVideoDuration, detectPdfPages } from '../lib/mediaDetector';
import { formatCourseDurationHHMMSS } from '../lib/formatDuration';
import { validateExternalVideoLink, validateExternalDocumentLink } from '../lib/urlParser';

interface AdminCourseHierarchyEditorProps {
  lessons: CourseLesson[];
  onChangeLessons: (lessons: CourseLesson[]) => void;
  allDocuments: ChemistryDocument[];
  allExams: ExamOrAssignment[];
  onNotify?: (type: 'success' | 'error', message: string) => void;
}

type PendingDeleteAction =
  | { kind: 'lesson'; lessonId: string; label: string }
  | { kind: 'section'; lessonId: string; sectionId: string; label: string }
  | { kind: 'item'; lessonId: string; sectionId: string; itemId: string; label: string }
  | {
      kind: 'question';
      lessonId: string;
      sectionId: string;
      itemId: string;
      questionId: string;
      label: string;
    };

function syncSectionMirrors(
  section: LessonSubSection,
  nextItems: SectionContentItem[]
): LessonSubSection {
  const normalizedItems = nextItems.map((it, idx) => ({ ...it, order: idx + 1 }));
  const primary = normalizedItems[0];
  return {
    ...section,
    items: normalizedItems,
    videoUrl: primary?.videoUrl ?? '',
    fileUrl: primary?.fileUrl ?? '',
    documentId: primary?.documentId ?? '',
    examId: primary?.examId ?? '',
    textContent: primary?.textContent ?? '',
    durationMinutes: primary?.durationMinutes,
    durationSeconds: primary?.durationSeconds,
    pagesCount: primary?.pagesCount,
    inlineQuestions: primary?.inlineQuestions,
  };
}

function getContentIcon(type: LessonSectionContentType) {
  switch (type) {
    case 'video':
      return Play;
    case 'pdf':
      return FileText;
    case 'assignment':
      return CheckSquare;
    case 'exam':
      return GraduationCap;
    case 'text':
      return AlignLeft;
    default:
      return ExternalLink;
  }
}

function getContentTypeLabel(type: LessonSectionContentType): string {
  return LESSON_CONTENT_TYPE_OPTIONS.find((opt) => opt.value === type)?.label || 'Content';
}

export const AdminCourseHierarchyEditor: React.FC<AdminCourseHierarchyEditorProps> = ({
  lessons,
  onChangeLessons,
  allDocuments,
  allExams,
  onNotify,
}) => {
  const [expandedLessonIds, setExpandedLessonIds] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    if (lessons[0]) map[lessons[0].id] = true;
    return map;
  });

  // New lesson input
  const [newLessonTitleInput, setNewLessonTitleInput] = useState('');

  // Per-lesson new section composer
  const [customTitleByLesson, setCustomTitleByLesson] = useState<Record<string, string>>({});
  const [customTypeByLesson, setCustomTypeByLesson] = useState<
    Record<string, LessonSectionContentType>
  >({});

  // Async item busy & upload progress indicator
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyStatusText, setBusyStatusText] = useState<string>('');
  const [uploadProgressByItem, setUploadProgressByItem] = useState<Record<string, UploadProgressInfo>>({});

  // Inline question editor expansion state per itemId
  const [openQuestionEditorByItem, setOpenQuestionEditorByItem] = useState<
    Record<string, boolean>
  >({});
  const [draftQuestionByItem, setDraftQuestionByItem] = useState<
    Record<
      string,
      {
        type: 'mcq' | 'essay';
        question: string;
        optA: string;
        optB: string;
        optC: string;
        optD: string;
        correct: string;
        explanation: string;
        points: string;
      }
    >
  >({});

  // In-app delete confirmation state
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteAction | null>(null);

  const toggleLesson = (lessonId: string) => {
    setExpandedLessonIds((prev) => ({ ...prev, [lessonId]: !prev[lessonId] }));
  };

  // --- LESSON OPERATIONS ---
  const handleAddLesson = () => {
    const nextOrder = lessons.length + 1;
    const typedTitle = newLessonTitleInput.trim();
    const newLesson: CourseLesson = {
      id: makeLessonId(),
      title: typedTitle || `Lesson ${nextOrder}`,
      description: '',
      order: nextOrder,
      sections: [],
    };
    const updated = [...lessons, newLesson];
    onChangeLessons(updated);
    setNewLessonTitleInput('');
    setExpandedLessonIds((prev) => ({ ...prev, [newLesson.id]: true }));
    onNotify?.('success', `Added "${newLesson.title}" — you can now freely add its sections ✓`);
  };

  const handleMoveLesson = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const clone = [...lessons];
    const [moved] = clone.splice(index, 1);
    clone.splice(target, 0, moved);
    onChangeLessons(clone.map((l, idx) => ({ ...l, order: idx + 1 })));
  };

  const updateLessonField = (lessonId: string, patch: Partial<CourseLesson>) => {
    onChangeLessons(lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)));
  };

  // --- SECTION OPERATIONS (100% DYNAMIC, UNLIMITED) ---
  const handleAddCustomSection = (lessonId: string) => {
    const title = (customTitleByLesson[lessonId] || '').trim();
    if (!title) {
      onNotify?.('error', 'Please enter a section name first');
      return;
    }
    const contentType = customTypeByLesson[lessonId] || 'video';
    const currentLesson = lessons.find((l) => l.id === lessonId);
    const nextSectionOrder = (currentLesson?.sections?.length || 0) + 1;

    const newSection: LessonSubSection = {
      id: makeSectionId(contentType),
      title,
      contentType,
      order: nextSectionOrder,
      description: '',
      items: [
        {
          id: makeItemId(contentType),
          title,
          contentType,
          order: 1,
        },
      ],
    };

    onChangeLessons(
      lessons.map((l) =>
        l.id === lessonId
          ? { ...l, sections: [...(l.sections || []), newSection] }
          : l
      )
    );
    setCustomTitleByLesson((prev) => ({ ...prev, [lessonId]: '' }));
    onNotify?.('success', `Added section "${title}" ✓`);
  };

  const handleMoveSection = (lessonId: string, sectionIndex: number, direction: -1 | 1) => {
    onChangeLessons(
      lessons.map((l) => {
        if (l.id !== lessonId) return l;
        const list = [...(l.sections || [])];
        const target = sectionIndex + direction;
        if (target < 0 || target >= list.length) return l;
        const [moved] = list.splice(sectionIndex, 1);
        list.splice(target, 0, moved);
        return {
          ...l,
          sections: list.map((sec, idx) => ({ ...sec, order: idx + 1 })),
        };
      })
    );
  };

  const updateSection = (
    lessonId: string,
    sectionId: string,
    updater: (sec: LessonSubSection) => LessonSubSection
  ) => {
    onChangeLessons(
      lessons.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              sections: (l.sections || []).map((sec) =>
                sec.id === sectionId ? updater(sec) : sec
              ),
            }
          : l
      )
    );
  };

  // --- MULTI-ITEM OPERATIONS INSIDE A SECTION ---
  const ensureItems = (section: LessonSubSection): SectionContentItem[] => {
    if (Array.isArray(section.items) && section.items.length > 0) {
      return section.items;
    }
    const existing = getSectionItems(section);
    if (existing.length > 0) return existing;
    return [
      {
        id: makeItemId(section.contentType),
        title: section.title || 'Content 1',
        contentType: section.contentType,
        order: 1,
      },
    ];
  };

  const handleAddItemToSection = (lessonId: string, sectionId: string) => {
    updateSection(lessonId, sectionId, (sec) => {
      const currentItems = ensureItems(sec);
      const nextItem: SectionContentItem = {
        id: makeItemId(sec.contentType),
        title: `${sec.title} (${currentItems.length + 1})`,
        contentType: sec.contentType,
        order: currentItems.length + 1,
      };
      return syncSectionMirrors(sec, [...currentItems, nextItem]);
    });
  };

  const handleMoveItem = (
    lessonId: string,
    sectionId: string,
    itemIndex: number,
    direction: -1 | 1
  ) => {
    updateSection(lessonId, sectionId, (sec) => {
      const items = [...ensureItems(sec)];
      const target = itemIndex + direction;
      if (target < 0 || target >= items.length) return sec;
      const [moved] = items.splice(itemIndex, 1);
      items.splice(target, 0, moved);
      return syncSectionMirrors(sec, items);
    });
  };

  const updateSectionItem = (
    lessonId: string,
    sectionId: string,
    itemId: string,
    patch: Partial<SectionContentItem>
  ) => {
    updateSection(lessonId, sectionId, (sec) => {
      const items = ensureItems(sec).map((it) =>
        it.id === itemId ? { ...it, ...patch } : it
      );
      return syncSectionMirrors(sec, items);
    });
  };

  // --- MEDIA UPLOAD / URL PROBES FOR ITEMS ---
  const handleItemVideoUpload = async (
    lessonId: string,
    sectionId: string,
    itemId: string,
    file: File
  ) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      onNotify?.(
        'error',
        'Video file size exceeds 50 MB. Please use a YouTube or Google Drive link for fast streaming.'
      );
      return;
    }
    setBusyKey(itemId);
    setBusyStatusText('Reading video duration and uploading to Lectures...');
    try {
      const durationInfo = await detectVideoDuration(file);
      const res = await uploadFileWithRealProgress(file, 'Lectures', (info) => {
        setBusyStatusText(info.statusText);
        setUploadProgressByItem((prev) => ({ ...prev, [itemId]: info }));
      });
      if (res.success && res.url) {
        updateSectionItem(lessonId, sectionId, itemId, {
          videoUrl: res.url,
          durationSeconds:
            durationInfo.accurate && durationInfo.totalSeconds > 0
              ? durationInfo.totalSeconds
              : undefined,
          durationMinutes:
            durationInfo.accurate && durationInfo.minutes > 0
              ? durationInfo.minutes
              : undefined,
        });
        onNotify?.(
          'success',
          durationInfo.accurate
            ? `Uploaded to ${res.bucket}/${res.path} (${durationInfo.formattedText}) ✓`
            : `Uploaded to ${res.bucket}/${res.path} ✓`
        );
      } else {
        onNotify?.('error', `Failed to upload video to Lectures: ${res.error || 'Unknown error'}`);
      }
    } finally {
      setBusyKey(null);
      setBusyStatusText('');
    }
  };

  const handleProbeItemVideoUrl = async (
    lessonId: string,
    sectionId: string,
    itemId: string,
    rawUrl: string
  ) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    const check = validateExternalVideoLink(trimmed);
    if (!check.valid) {
      onNotify?.('error', check.error || 'Invalid video URL');
      return;
    }
    setBusyKey(itemId);
    setBusyStatusText('Checking link...');
    try {
      const probe = await validateLinkWithProgress(trimmed, (_pct, status) => {
        setBusyStatusText(status);
      });
      updateSectionItem(lessonId, sectionId, itemId, {
        videoUrl: check.cleanUrl,
        durationSeconds:
          probe.accurate && probe.totalSeconds && probe.totalSeconds > 0
            ? probe.totalSeconds
            : undefined,
        durationMinutes:
          probe.accurate && probe.detectedMinutes > 0 ? probe.detectedMinutes : undefined,
      });
      onNotify?.(
        'success',
        probe.accurate
          ? `Link verified (${probe.formattedDuration}) ✓`
          : 'Video link verified (--:--:--)'
      );
    } finally {
      setBusyKey(null);
      setBusyStatusText('');
    }
  };

  const handleItemPdfUpload = async (
    lessonId: string,
    sectionId: string,
    itemId: string,
    file: File
  ) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      onNotify?.('error', 'File size exceeds 50 MB. Please use a Google Drive link.');
      return;
    }
    setBusyKey(itemId);
    setBusyStatusText('Counting pages and uploading file to Files...');
    try {
      const detectedCount = await detectPdfPages(file);
      const res = await uploadFileWithRealProgress(file, 'Files', (info) => {
        setBusyStatusText(info.statusText);
        setUploadProgressByItem((prev) => ({ ...prev, [itemId]: info }));
      });
      if (res.success && res.url) {
        updateSectionItem(lessonId, sectionId, itemId, {
          fileUrl: res.url,
          documentId: undefined,
          pagesCount: detectedCount > 0 ? detectedCount : undefined,
        });
        onNotify?.('success', `Uploaded to ${res.bucket}/${res.path} ✓`);
      } else {
        onNotify?.('error', `Failed to upload file to Files: ${res.error || 'Unknown error'}`);
      }
    } finally {
      setBusyKey(null);
      setBusyStatusText('');
    }
  };

  const handleProbeItemDocUrl = async (
    lessonId: string,
    sectionId: string,
    itemId: string,
    rawUrl: string
  ) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    const check = validateExternalDocumentLink(trimmed);
    if (!check.valid) {
      onNotify?.('error', check.error || 'Invalid file URL');
      return;
    }
    setBusyKey(itemId);
    setBusyStatusText('Checking file link...');
    try {
      const probe = await validateDocumentLinkWithProgress(trimmed, (_pct, status) => {
        setBusyStatusText(status);
      });
      updateSectionItem(lessonId, sectionId, itemId, {
        fileUrl: probe.cleanUrl || check.cleanUrl || trimmed,
        documentId: undefined,
        pagesCount: probe.detectedPages > 0 ? probe.detectedPages : undefined,
      });
      onNotify?.('success', 'File linked and verified successfully ✓');
    } finally {
      setBusyKey(null);
      setBusyStatusText('');
    }
  };

  // --- INLINE QUESTIONS CRUD FOR ASSIGNMENT/EXAM ITEMS ---
  const getDraftQuestion = (itemId: string) =>
    draftQuestionByItem[itemId] || {
      type: 'mcq' as const,
      question: '',
      optA: '',
      optB: '',
      optC: '',
      optD: '',
      correct: 'A',
      explanation: '',
      points: '2',
    };

  const handleAddInlineQuestion = (
    lessonId: string,
    sectionId: string,
    item: SectionContentItem
  ) => {
    const dq = getDraftQuestion(item.id);
    if (!dq.question.trim()) {
      onNotify?.('error', 'Please enter the question text first');
      return;
    }
    const existingQs = item.inlineQuestions || [];
    const options =
      dq.type === 'mcq'
        ? [
            dq.optA.trim() || 'First Option',
            dq.optB.trim() || 'Second Option',
            dq.optC.trim() || 'Third Option',
            dq.optD.trim() || 'Fourth Option',
          ]
        : undefined;

    let resolvedCorrect = dq.correct.trim();
    if (dq.type === 'mcq' && options) {
      if (resolvedCorrect === 'A' || resolvedCorrect === 'أ') resolvedCorrect = options[0];
      else if (resolvedCorrect === 'B' || resolvedCorrect === 'ب') resolvedCorrect = options[1];
      else if (resolvedCorrect === 'C' || resolvedCorrect === 'ج') resolvedCorrect = options[2];
      else if (resolvedCorrect === 'D' || resolvedCorrect === 'د') resolvedCorrect = options[3];
    }

    const newQ: ExamQuestion = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: dq.type,
      question: dq.question.trim(),
      options,
      correctAnswer: resolvedCorrect || (options ? options[0] : ''),
      explanation: dq.explanation.trim(),
      points: Math.max(1, Number(dq.points) || 2),
    };

    updateSectionItem(lessonId, sectionId, item.id, {
      inlineQuestions: [...existingQs, newQ],
    });
    setDraftQuestionByItem((prev) => ({
      ...prev,
      [item.id]: {
        ...dq,
        question: '',
        optA: '',
        optB: '',
        optC: '',
        optD: '',
        explanation: '',
      },
    }));
    onNotify?.('success', 'Question added successfully ✓');
  };

  // --- DELETE CONFIRMATION HANDLER ---
  const executePendingDelete = () => {
    if (!pendingDelete) return;

    if (pendingDelete.kind === 'lesson') {
      const updated = lessons
        .filter((l) => l.id !== pendingDelete.lessonId)
        .map((l, idx) => ({ ...l, order: idx + 1 }));
      onChangeLessons(updated);
      onNotify?.('success', 'Lesson deleted ✓');
    } else if (pendingDelete.kind === 'section') {
      onChangeLessons(
        lessons.map((l) =>
          l.id === pendingDelete.lessonId
            ? {
                ...l,
                sections: (l.sections || [])
                  .filter((sec) => sec.id !== pendingDelete.sectionId)
                  .map((sec, idx) => ({ ...sec, order: idx + 1 })),
              }
            : l
        )
      );
      onNotify?.('success', 'Section deleted ✓');
    } else if (pendingDelete.kind === 'item') {
      updateSection(pendingDelete.lessonId, pendingDelete.sectionId, (sec) => {
        const remaining = ensureItems(sec).filter((it) => it.id !== pendingDelete.itemId);
        return syncSectionMirrors(sec, remaining);
      });
      onNotify?.('success', 'Item deleted ✓');
    } else if (pendingDelete.kind === 'question') {
      updateSection(pendingDelete.lessonId, pendingDelete.sectionId, (sec) => {
        const nextItems = ensureItems(sec).map((it) =>
          it.id === pendingDelete.itemId
            ? {
                ...it,
                inlineQuestions: (it.inlineQuestions || []).filter(
                  (q) => q.id !== pendingDelete.questionId
                ),
              }
            : it
        );
        return syncSectionMirrors(sec, nextItems);
      });
      onNotify?.('success', 'Question deleted ✓');
    }

    setPendingDelete(null);
  };

  return (
    <div className="p-4 bg-white dark:bg-slate-950/70 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
      {/* Header & Dynamic New Lesson Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <Layers className="w-4 h-4 shrink-0" />
            <span>Course Lessons & Sections ({lessons.length})</span>
          </span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Add any number of lessons, and inside each lesson add custom sections with any name, type, and content you choose.
          </p>
        </div>
      </div>

      {/* Add Lesson Composer */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <input
          type="text"
          value={newLessonTitleInput}
          onChange={(e) => setNewLessonTitleInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddLesson();
            }
          }}
          placeholder="New lesson name (e.g., Lesson 1 - Present Tenses)..."
          className="flex-1 min-w-0 min-h-[44px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
        />
        <button
          type="button"
          onClick={handleAddLesson}
          className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Lesson</span>
        </button>
      </div>

      {lessons.length === 0 ? (
        <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40">
          <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            No lessons have been added to this course yet
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Type the lesson name above and click "Add New Lesson" to start building its sections freely.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson, lessonIdx) => {
            const isExpanded = Boolean(expandedLessonIds[lesson.id]);
            const sections = lesson.sections || [];

            return (
              <div
                key={lesson.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 overflow-hidden"
              >
                {/* Lesson Header Bar */}
                <div className="p-3 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleLesson(lesson.id)}
                      className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                      title={isExpanded ? 'Collapse lesson' : 'Expand lesson'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[11px] font-black font-mono shrink-0">
                      #{lessonIdx + 1}
                    </span>

                    <input
                      type="text"
                      value={lesson.title}
                      onChange={(e) => updateLessonField(lesson.id, { title: e.target.value })}
                      placeholder="Lesson title"
                      className="flex-1 min-w-[140px] min-h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold px-1.5">
                      {sections.length} {sections.length === 1 ? 'section' : 'sections'}
                    </span>
                    <button
                      type="button"
                      disabled={lessonIdx === 0}
                      onClick={() => handleMoveLesson(lessonIdx, -1)}
                      className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 cursor-pointer flex items-center justify-center"
                      title="Move lesson up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={lessonIdx === lessons.length - 1}
                      onClick={() => handleMoveLesson(lessonIdx, 1)}
                      className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 cursor-pointer flex items-center justify-center"
                      title="Move lesson down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingDelete({
                          kind: 'lesson',
                          lessonId: lesson.id,
                          label: lesson.title || `Lesson ${lessonIdx + 1}`,
                        })
                      }
                      className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/25 cursor-pointer flex items-center justify-center"
                      title="Delete lesson"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Lesson Body */}
                {isExpanded && (
                  <div className="p-3.5 space-y-4">
                    <div>
                      <input
                        type="text"
                        value={lesson.description || ''}
                        onChange={(e) =>
                          updateLessonField(lesson.id, { description: e.target.value })
                        }
                        placeholder="Short lesson description (optional)..."
                        className="w-full min-h-[40px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                      />
                    </div>

                    {/* Add Dynamic Custom Section Bar (NO PRESET TEMPLATES) */}
                    <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 space-y-2">
                      <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 block">
                        Add a new section inside this lesson (with any name and type you choose):
                      </span>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={customTitleByLesson[lesson.id] || ''}
                          onChange={(e) =>
                            setCustomTitleByLesson((prev) => ({
                              ...prev,
                              [lesson.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomSection(lesson.id);
                            }
                          }}
                          placeholder="Section name (e.g., Lesson Explanation, Workbook Practice, Grammar Summary...)"
                          className="flex-1 min-w-0 min-h-[42px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                        />
                        <select
                          value={customTypeByLesson[lesson.id] || 'video'}
                          onChange={(e) =>
                            setCustomTypeByLesson((prev) => ({
                              ...prev,
                              [lesson.id]: e.target.value as LessonSectionContentType,
                            }))
                          }
                          className="min-h-[42px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
                        >
                          {LESSON_CONTENT_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              Type: {opt.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAddCustomSection(lesson.id)}
                          className="min-h-[42px] px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Section</span>
                        </button>
                      </div>
                    </div>

                    {/* Sections List inside Lesson */}
                    {sections.length === 0 ? (
                      <p className="text-center text-xs text-slate-500 dark:text-slate-400 py-4 bg-white dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                        No sections in this lesson yet. Add the first section from the field above.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {sections.map((section, secIdx) => {
                          const SectionIcon = getContentIcon(section.contentType);
                          const sectionItems = ensureItems(section);

                          return (
                            <div
                              key={section.id}
                              className="p-3.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm"
                            >
                              {/* Section Top Row: Inline Name + Content Type Switcher + Reorder + Delete */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                    <SectionIcon className="w-4 h-4" />
                                  </div>
                                  <input
                                    type="text"
                                    value={section.title}
                                    onChange={(e) =>
                                      updateSection(lesson.id, section.id, (sec) => ({
                                        ...sec,
                                        title: e.target.value,
                                      }))
                                    }
                                    placeholder="Section name"
                                    className="flex-1 min-w-[140px] min-h-[38px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-white"
                                  />
                                  <select
                                    value={section.contentType}
                                    onChange={(e) => {
                                      const nextType = e.target.value as LessonSectionContentType;
                                      updateSection(lesson.id, section.id, (sec) => ({
                                        ...sec,
                                        contentType: nextType,
                                      }));
                                    }}
                                    className="min-h-[38px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                    title="Default section type"
                                  >
                                    {LESSON_CONTENT_TYPE_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={secIdx === 0}
                                    onClick={() => handleMoveSection(lesson.id, secIdx, -1)}
                                    className="min-w-[34px] min-h-[34px] rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
                                    title="Move section up"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={secIdx === sections.length - 1}
                                    onClick={() => handleMoveSection(lesson.id, secIdx, 1)}
                                    className="min-w-[34px] min-h-[34px] rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
                                    title="Move section down"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPendingDelete({
                                        kind: 'section',
                                        lessonId: lesson.id,
                                        sectionId: section.id,
                                        label: section.title,
                                      })
                                    }
                                    className="min-w-[34px] min-h-[34px] rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center cursor-pointer"
                                    title="Delete section"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Optional Section Description */}
                              <input
                                type="text"
                                value={section.description || ''}
                                onChange={(e) =>
                                  updateSection(lesson.id, section.id, (sec) => ({
                                    ...sec,
                                    description: e.target.value,
                                  }))
                                }
                                placeholder="Short description displayed under section name (optional)..."
                                className="w-full min-h-[36px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300"
                              />

                              {/* Multi-Item List Inside Section */}
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                    Section Contents ({sectionItems.length})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddItemToSection(lesson.id, section.id)}
                                    className="min-h-[36px] px-3 py-1 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-500/25 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add new item inside "{section.title}"</span>
                                  </button>
                                </div>

                                {sectionItems.map((item, itemIdx) => {
                                  const isItemBusy = busyKey === item.id;
                                  const itemType = item.contentType || section.contentType;
                                  const dq = getDraftQuestion(item.id);
                                  const inlineQuestions = item.inlineQuestions || [];
                                  const isQOpen = Boolean(openQuestionEditorByItem[item.id]);

                                  return (
                                    <div
                                      key={item.id}
                                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2.5"
                                    >
                                      {/* Item Toolbar */}
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                                            #{itemIdx + 1}
                                          </span>
                                          <input
                                            type="text"
                                            value={item.title}
                                            onChange={(e) =>
                                              updateSectionItem(
                                                lesson.id,
                                                section.id,
                                                item.id,
                                                { title: e.target.value }
                                              )
                                            }
                                            placeholder="Item title (e.g., Video Part 1, Study Notes...)"
                                            className="flex-1 min-w-[140px] min-h-[36px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-900 dark:text-white"
                                          />
                                          <select
                                            value={itemType}
                                            onChange={(e) =>
                                              updateSectionItem(
                                                lesson.id,
                                                section.id,
                                                item.id,
                                                {
                                                  contentType: e.target
                                                    .value as LessonSectionContentType,
                                                }
                                              )
                                            }
                                            className="min-h-[36px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200"
                                          >
                                            {LESSON_CONTENT_TYPE_OPTIONS.map((opt) => (
                                              <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            type="button"
                                            disabled={itemIdx === 0}
                                            onClick={() =>
                                              handleMoveItem(lesson.id, section.id, itemIdx, -1)
                                            }
                                            className="min-w-[32px] min-h-[32px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 flex items-center justify-center cursor-pointer"
                                            title="Move up"
                                          >
                                            <ArrowUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={itemIdx === sectionItems.length - 1}
                                            onClick={() =>
                                              handleMoveItem(lesson.id, section.id, itemIdx, 1)
                                            }
                                            className="min-w-[32px] min-h-[32px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 flex items-center justify-center cursor-pointer"
                                            title="Move down"
                                          >
                                            <ArrowDown className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPendingDelete({
                                                kind: 'item',
                                                lessonId: lesson.id,
                                                sectionId: section.id,
                                                itemId: item.id,
                                                label:
                                                  item.title ||
                                                  `${getContentTypeLabel(itemType)} #${itemIdx + 1}`,
                                              })
                                            }
                                            className="min-w-[32px] min-h-[32px] rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center cursor-pointer"
                                            title="Delete item"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>

                                      {isItemBusy && !uploadProgressByItem[item.id] && (
                                        <div className="flex items-center gap-2 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          <span>{busyStatusText}</span>
                                        </div>
                                      )}

                                      {uploadProgressByItem[item.id] && (
                                        <UploadProgressBar info={uploadProgressByItem[item.id]} className="p-3" />
                                      )}

                                      {/* Type-specific content editor */}
                                      {itemType === 'video' && (
                                        <div className="space-y-2">
                                          <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                              type="text"
                                              value={item.videoUrl || ''}
                                              onChange={(e) =>
                                                updateSectionItem(
                                                  lesson.id,
                                                  section.id,
                                                  item.id,
                                                  { videoUrl: e.target.value }
                                                )
                                              }
                                              placeholder="Video URL (YouTube / Google Drive / Direct link)..."
                                              className="flex-1 min-w-0 min-h-[38px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                                            />
                                            <button
                                              type="button"
                                              disabled={isItemBusy || !(item.videoUrl || '').trim()}
                                              onClick={() =>
                                                void handleProbeItemVideoUrl(
                                                  lesson.id,
                                                  section.id,
                                                  item.id,
                                                  item.videoUrl || ''
                                                )
                                              }
                                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0"
                                            >
                                              <Sparkles className="w-3.5 h-3.5" />
                                              <span>Check Link</span>
                                            </button>
                                            <label className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0">
                                              <Upload className="w-3.5 h-3.5" />
                                              <span>Upload Video</span>
                                              <input
                                                type="file"
                                                accept="video/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                  const f = e.target.files?.[0];
                                                  e.target.value = '';
                                                  if (f) {
                                                    void handleItemVideoUpload(
                                                      lesson.id,
                                                      section.id,
                                                      item.id,
                                                      f
                                                    );
                                                  }
                                                }}
                                              />
                                            </label>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                                            <span>Duration (minutes):</span>
                                            <input
                                              type="number"
                                              min={0}
                                              value={item.durationMinutes || ''}
                                              onChange={(e) => {
                                                const mins = parseInt(e.target.value, 10) || 0;
                                                updateSectionItem(
                                                  lesson.id,
                                                  section.id,
                                                  item.id,
                                                  {
                                                    durationMinutes: mins > 0 ? mins : undefined,
                                                    durationSeconds: mins > 0 ? mins * 60 : undefined,
                                                  }
                                                );
                                              }}
                                              placeholder="--"
                                              className="w-20 min-h-[32px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs font-mono text-slate-900 dark:text-white"
                                            />
                                            <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400 font-bold" dir="ltr">
                                              ({formatCourseDurationHHMMSS(item)})
                                            </span>
                                          </div>
                                        </div>
                                      )}

                                      {itemType === 'pdf' && (
                                        <div className="space-y-2">
                                          <select
                                            value={item.documentId || ''}
                                            onChange={(e) =>
                                              updateSectionItem(lesson.id, section.id, item.id, {
                                                documentId: e.target.value || undefined,
                                              })
                                            }
                                            className="w-full min-h-[38px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                                          >
                                            <option value="">
                                              -- Select notes from platform library or attach a file below --
                                            </option>
                                            {allDocuments.map((doc) => (
                                              <option key={doc.id} value={doc.id}>
                                                {doc.title} ({doc.docType} · {doc.pagesCount} pages)
                                              </option>
                                            ))}
                                          </select>

                                          <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                              type="text"
                                              value={item.fileUrl || ''}
                                              onChange={(e) =>
                                                updateSectionItem(
                                                  lesson.id,
                                                  section.id,
                                                  item.id,
                                                  { fileUrl: e.target.value }
                                                )
                                              }
                                              placeholder="Or paste a PDF / Google Drive link directly..."
                                              className="flex-1 min-w-0 min-h-[38px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                                            />
                                            <button
                                              type="button"
                                              disabled={isItemBusy || !(item.fileUrl || '').trim()}
                                              onClick={() =>
                                                void handleProbeItemDocUrl(
                                                  lesson.id,
                                                  section.id,
                                                  item.id,
                                                  item.fileUrl || ''
                                                )
                                              }
                                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0"
                                            >
                                              <Sparkles className="w-3.5 h-3.5" />
                                              <span>Check</span>
                                            </button>
                                            <label className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0">
                                              <Upload className="w-3.5 h-3.5" />
                                              <span>Upload File</span>
                                              <input
                                                type="file"
                                                accept=".pdf,.doc,.docx,.ppt,.pptx,image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                  const f = e.target.files?.[0];
                                                  e.target.value = '';
                                                  if (f) {
                                                    void handleItemPdfUpload(
                                                      lesson.id,
                                                      section.id,
                                                      item.id,
                                                      f
                                                    );
                                                  }
                                                }}
                                              />
                                            </label>
                                          </div>
                                        </div>
                                      )}

                                      {(itemType === 'assignment' || itemType === 'exam') && (
                                        <div className="space-y-2.5">
                                          <select
                                            value={item.examId || ''}
                                            onChange={(e) =>
                                              updateSectionItem(lesson.id, section.id, item.id, {
                                                examId: e.target.value || undefined,
                                              })
                                            }
                                            className="w-full min-h-[38px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                                          >
                                            <option value="">
                                              -- Select an existing assignment/exam or create inline questions below --
                                            </option>
                                            {allExams.map((ex) => (
                                              <option key={ex.id} value={ex.id}>
                                                {ex.title} ({ex.questions.length} questions)
                                              </option>
                                            ))}
                                          </select>

                                          {/* Inline Questions Manager Button & Panel */}
                                          <div className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/15 p-2.5 space-y-2.5">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                                                <HelpCircle className="w-3.5 h-3.5" />
                                                <span>
                                                  Inline questions inside this item ({inlineQuestions.length})
                                                </span>
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setOpenQuestionEditorByItem((prev) => ({
                                                    ...prev,
                                                    [item.id]: !prev[item.id],
                                                  }))
                                                }
                                                className="min-h-[34px] px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black cursor-pointer"
                                              >
                                                {isQOpen
                                                  ? 'Hide Question Editor'
                                                  : 'Add / Edit Questions'}
                                              </button>
                                            </div>

                                            {inlineQuestions.length > 0 && (
                                              <div className="space-y-1.5">
                                                {inlineQuestions.map((q, qIdx) => (
                                                  <div
                                                    key={q.id}
                                                    className="flex items-start justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]"
                                                  >
                                                    <div className="min-w-0">
                                                      <span className="font-bold text-slate-900 dark:text-white">
                                                        Q{qIdx + 1}: {q.question}
                                                      </span>
                                                      <span className="block text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                                                        Correct Answer: {q.correctAnswer} ({q.points}{' '}
                                                        pts)
                                                      </span>
                                                    </div>
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        setPendingDelete({
                                                          kind: 'question',
                                                          lessonId: lesson.id,
                                                          sectionId: section.id,
                                                          itemId: item.id,
                                                          questionId: q.id,
                                                          label: `Question #${qIdx + 1}`,
                                                        })
                                                      }
                                                      className="min-w-[30px] min-h-[30px] rounded-lg bg-red-500/10 text-red-600 flex items-center justify-center shrink-0 cursor-pointer"
                                                      title="Delete question"
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            )}

                                            {isQOpen && (
                                              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                  <select
                                                    value={dq.type}
                                                    onChange={(e) =>
                                                      setDraftQuestionByItem((prev) => ({
                                                        ...prev,
                                                        [item.id]: {
                                                          ...dq,
                                                          type: e.target.value as 'mcq' | 'essay',
                                                        },
                                                      }))
                                                    }
                                                    className="min-h-[36px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 text-xs text-slate-900 dark:text-white"
                                                  >
                                                    <option value="mcq">Multiple Choice</option>
                                                    <option value="essay">Essay</option>
                                                  </select>
                                                  <input
                                                    type="number"
                                                    min={1}
                                                    value={dq.points}
                                                    onChange={(e) =>
                                                      setDraftQuestionByItem((prev) => ({
                                                        ...prev,
                                                        [item.id]: { ...dq, points: e.target.value },
                                                      }))
                                                    }
                                                    placeholder="Points"
                                                    className="min-h-[36px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 text-xs font-mono text-slate-900 dark:text-white"
                                                  />
                                                  {dq.type === 'mcq' && (
                                                    <select
                                                      value={dq.correct}
                                                      onChange={(e) =>
                                                        setDraftQuestionByItem((prev) => ({
                                                          ...prev,
                                                          [item.id]: {
                                                            ...dq,
                                                            correct: e.target.value,
                                                          },
                                                        }))
                                                      }
                                                      className="min-h-[36px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 text-xs text-slate-900 dark:text-white"
                                                    >
                                                      <option value="A">Answer: A</option>
                                                      <option value="B">Answer: B</option>
                                                      <option value="C">Answer: C</option>
                                                      <option value="D">Answer: D</option>
                                                    </select>
                                                  )}
                                                </div>

                                                <textarea
                                                  rows={2}
                                                  value={dq.question}
                                                  onChange={(e) =>
                                                    setDraftQuestionByItem((prev) => ({
                                                      ...prev,
                                                      [item.id]: {
                                                        ...dq,
                                                        question: e.target.value,
                                                      },
                                                    }))
                                                  }
                                                  placeholder="Write the question text here..."
                                                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                                                />

                                                {dq.type === 'mcq' ? (
                                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    <input
                                                      type="text"
                                                      value={dq.optA}
                                                      onChange={(e) =>
                                                        setDraftQuestionByItem((prev) => ({
                                                          ...prev,
                                                          [item.id]: { ...dq, optA: e.target.value },
                                                        }))
                                                      }
                                                      placeholder="A) First Option"
                                                      className="min-h-[36px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 text-xs text-slate-900 dark:text-white"
                                                    />
                                                    <input
                                                      type="text"
                                                      value={dq.optB}
                                                      onChange={(e) =>
                                                        setDraftQuestionByItem((prev) => ({
                                                          ...prev,
                                                          [item.id]: { ...dq, optB: e.target.value },
                                                        }))
                                                      }
                                                      placeholder="B) Second Option"
                                                      className="min-h-[36px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 text-xs text-slate-900 dark:text-white"
                                                    />
                                                    <input
                                                      type="text"
                                                      value={dq.optC}
                                                      onChange={(e) =>
                                                        setDraftQuestionByItem((prev) => ({
                                                          ...prev,
                                                          [item.id]: { ...dq, optC: e.target.value },
                                                        }))
                                                      }
                                                      placeholder="C) Third Option"
                                                      className="min-h-[36px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 text-xs text-slate-900 dark:text-white"
                                                    />
                                                    <input
                                                      type="text"
                                                      value={dq.optD}
                                                      onChange={(e) =>
                                                        setDraftQuestionByItem((prev) => ({
                                                          ...prev,
                                                          [item.id]: { ...dq, optD: e.target.value },
                                                        }))
                                                      }
                                                      placeholder="D) Fourth Option"
                                                      className="min-h-[36px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 text-xs text-slate-900 dark:text-white"
                                                    />
                                                  </div>
                                                ) : (
                                                  <input
                                                    type="text"
                                                    value={dq.correct}
                                                    onChange={(e) =>
                                                      setDraftQuestionByItem((prev) => ({
                                                        ...prev,
                                                        [item.id]: {
                                                          ...dq,
                                                          correct: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    placeholder="Model answer (optional)..."
                                                    className="w-full min-h-[36px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 text-xs text-slate-900 dark:text-white"
                                                  />
                                                )}

                                                <div className="flex justify-end">
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleAddInlineQuestion(
                                                        lesson.id,
                                                        section.id,
                                                        item
                                                      )
                                                    }
                                                    className="min-h-[38px] px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
                                                  >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    <span>Add Question to Item</span>
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>

                                          <input
                                            type="text"
                                            value={item.fileUrl || ''}
                                            onChange={(e) =>
                                              updateSectionItem(lesson.id, section.id, item.id, {
                                                fileUrl: e.target.value,
                                              })
                                            }
                                            placeholder="Or external file / form link (optional)..."
                                            className="w-full min-h-[36px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-900 dark:text-white"
                                          />
                                        </div>
                                      )}

                                      {itemType === 'link' && (
                                        <div className="space-y-2">
                                          <input
                                            type="text"
                                            value={item.fileUrl || ''}
                                            onChange={(e) =>
                                              updateSectionItem(lesson.id, section.id, item.id, {
                                                fileUrl: e.target.value,
                                              })
                                            }
                                            placeholder="Enter external link (https://...)..."
                                            className="w-full min-h-[38px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                                          />
                                          <input
                                            type="text"
                                            value={item.description || ''}
                                            onChange={(e) =>
                                              updateSectionItem(lesson.id, section.id, item.id, {
                                                description: e.target.value,
                                              })
                                            }
                                            placeholder="Helpful note for the link (optional)..."
                                            className="w-full min-h-[36px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white"
                                          />
                                        </div>
                                      )}

                                      {itemType === 'text' && (
                                        <div className="space-y-2">
                                          <textarea
                                            rows={4}
                                            value={item.textContent || ''}
                                            onChange={(e) =>
                                              updateSectionItem(lesson.id, section.id, item.id, {
                                                textContent: e.target.value,
                                              })
                                            }
                                            placeholder="Write text content, notes, or written explanation to show to the student..."
                                            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white leading-relaxed"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* In-app Delete Confirmation Dialog */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  Confirm Deletion
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  Are you sure you want to delete{' '}
                  <strong className="text-red-600 dark:text-red-400">
                    "{pendingDelete.label}"
                  </strong>
                  ? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executePendingDelete}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white shadow cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
