/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AssessmentAttempt,
  AssessmentForm,
  AssessmentFormAssignment,
  DurationUnit,
  ExamChoice,
  ExamOrAssignment,
  ExamQuestion,
  ExamSubmission,
  PlatformSettings,
} from '../types';
import {
  buildTeacherAuditEntries,
  extractQuestionImageUrls,
  formatDurationArabic,
  fromMinutesToUnitValue,
  getArabicChoiceLetter,
  getNextFormName,
  isAllOfTheAboveChoice,
  normalizeQuestion,
  normalizeQuestionsList,
  toMinutesFromUnit,
} from '../lib/examGrading';
import { generateUuid } from '../lib/supabase';
import { platformDB } from '../lib/storage';
import { compressImageFile, uploadFileWithRealProgress } from '../lib/uploadManager';
import {
  deleteAiTempSourceImmediately,
  fetchAllAttemptsForAdmin,
  fetchAssessmentFormAssignments,
  fetchFormsForAssessment,
  promoteAiSourcesAndCleanupOnPublish,
  saveAssessmentForms,
  updateAttemptEssayGrades,
  uploadCompressedAiSource,
} from '../lib/supabaseAssessments';

interface AssessmentQuestionEditorProps {
  mode: 'exams' | 'assignments' | 'gemini';
  settings: PlatformSettings;
  allExams: ExamOrAssignment[];
  allSubmissions: ExamSubmission[];
  onDataChanged: () => void;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onEmergencyResetAi?: () => void;
  isResettingAi?: boolean;
  aiResetMessage?: { success: boolean; text: string } | null;
  onDirtyChange?: (isDirty: boolean) => void;
}

const createEmptyQuestion = (type: 'mcq' | 'essay' = 'mcq'): ExamQuestion => {
  const qId = generateUuid();
  if (type === 'essay') {
    return {
      id: qId,
      type: 'essay',
      question: '',
      correctAnswer: '',
      explanation: '',
      points: 4,
    };
  }
  const c1 = `${qId}-c1`;
  const c2 = `${qId}-c2`;
  const c3 = `${qId}-c3`;
  const c4 = `${qId}-c4`;
  return {
    id: qId,
    type: 'mcq',
    question: '',
    choices: [
      { id: c1, text: 'First Option' },
      { id: c2, text: 'Second Option' },
      { id: c3, text: 'Third Option' },
      { id: c4, text: 'Fourth Option' },
    ],
    correctChoiceIds: [c1],
    options: ['A) First Option', 'B) Second Option', 'C) Third Option', 'D) Fourth Option'],
    correctAnswer: 'First Option',
    explanation: '',
    points: 2,
  };
};

export const AssessmentQuestionEditor: React.FC<AssessmentQuestionEditorProps> = ({
  mode,
  settings,
  allExams,
  allSubmissions,
  onDataChanged,
  onSuccessToast,
  onErrorToast,
  onEmergencyResetAi,
  isResettingAi,
  aiResetMessage,
  onDirtyChange,
}) => {
  const defaultCategory: ExamOrAssignment['category'] =
    mode === 'assignments' ? 'assignment' : 'exam';

  // Core metadata state (independent dual timers + maxAttempts + shuffle)
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [draftAssessmentId, setDraftAssessmentId] = useState<string>(() => generateUuid());
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExamOrAssignment['category']>(defaultCategory);
  const [grade, setGrade] = useState('3rd Secondary');
  const [lessonNumber, setLessonNumber] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [deadline, setDeadline] = useState('Available immediately');

  // Timer A: Overall assessment duration (independent)
  const [durationValue, setDurationValue] = useState('45');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('minutes');

  // Timer B: Post-first-exit resume window (independent; default 24h for assignment, 5h for exam/sheet)
  const [resumeValue, setResumeValue] = useState(defaultCategory === 'assignment' ? '24' : '5');
  const [resumeUnit, setResumeUnit] = useState<DurationUnit>('hours');

  // Entry limit & Shuffling
  const [maxAttemptsInput, setMaxAttemptsInput] = useState('');
  const [shuffleForStudents, setShuffleForStudents] = useState(true);

  // Forms state (starting strictly with 1 form: Form A)
  const makeInitialForm = (assessmentId: string, questions: ExamQuestion[] = []): AssessmentForm => ({
    id: generateUuid(),
    assessmentId,
    name: 'Form A',
    sortOrder: 1,
    questions: normalizeQuestionsList(questions),
    totalPoints: questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0),
  });

  const [forms, setForms] = useState<AssessmentForm[]>(() => [makeInitialForm(draftAssessmentId)]);
  const [activeFormId, setActiveFormId] = useState<string>(() => forms[0].id);

  // Per-form assignment counts & averages fetched from Supabase
  const [formStatsMap, setFormStatsMap] = useState<
    Record<string, { assignedCount: number; avgPercent: number | null }>
  >({});

  // Form menu / rename / add-form modal state
  const [openMenuFormId, setOpenMenuFormId] = useState<string | null>(null);
  const [renamingFormId, setRenamingFormId] = useState<string | null>(null);
  const [renameFormText, setRenameFormText] = useState('');
  const [confirmDeleteFormId, setConfirmDeleteFormId] = useState<string | null>(null);
  const [showAddFormMenu, setShowAddFormMenu] = useState(false);
  const [duplicateSourceFormId, setDuplicateSourceFormId] = useState<string>('');
  const [isGeneratingParallelForm, setIsGeneratingParallelForm] = useState(false);

  // AI Extraction state for the active form (temp image uploaded to ai-sources/)
  const [aiSourceUrl, setAiSourceUrl] = useState('');
  const [aiSourcePath, setAiSourcePath] = useState('');
  const [aiSourcePreviewBase64, setAiSourcePreviewBase64] = useState('');
  const [isUploadingAiSource, setIsUploadingAiSource] = useState(false);
  const [sessionTempAiPaths, setSessionTempAiPaths] = useState<string[]>([]);
  const [aiPromptText, setAiPromptText] = useState('');
  const [transformMode, setTransformMode] = useState<'none' | 'to_mcq' | 'to_essay'>('none');
  const [isExtractingAi, setIsExtractingAi] = useState(false);

  // Question editor UI state
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [confirmToggleTypeQId, setConfirmToggleTypeQId] = useState<string | null>(null);
  const [confirmDeleteQId, setConfirmDeleteQId] = useState<string | null>(null);
  const [draggedQuestionIndex, setDraggedQuestionIndex] = useState<number | null>(null);
  const [uploadingImageKey, setUploadingImageKey] = useState<string | null>(null);
  const [imageUrlDraftByKey, setImageUrlDraftByKey] = useState<Record<string, string>>({});

  // Dirty state & unsaved guard
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingActionAfterUnsaved, setPendingActionAfterUnsaved] = useState<
    | null
    | { type: 'load_exam'; exam: ExamOrAssignment }
    | { type: 'reset_new' }
  >(null);

  // Published assessments drawer + Teacher Essay Grading + Grading Audit Log
  const [listFilterCategory, setListFilterCategory] = useState<'all' | 'exam' | 'assignment' | 'sheet'>('all');
  const [showGradingExamId, setShowGradingExamId] = useState<string | null>(null);
  const [gradingSubmissionId, setGradingSubmissionId] = useState<string | null>(null);
  const [essayDraftScores, setEssayDraftScores] = useState<Record<string, string>>({});
  const [essayDraftFeedback, setEssayDraftFeedback] = useState('');
  const [adminAttempts, setAdminAttempts] = useState<AssessmentAttempt[]>([]);

  const editorTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const activeForm = useMemo(
    () => forms.find((f) => f.id === activeFormId) || forms[0],
    [forms, activeFormId]
  );

  const activeQuestions = activeForm?.questions || [];
  const activeTotalPoints = useMemo(
    () => activeQuestions.reduce((acc, q) => acc + (Number(q.points) || 0), 0),
    [activeQuestions]
  );

  // Sync default category when switching between exams and assignments tabs if creating a brand new one
  useEffect(() => {
    if (!editingAssessmentId && !isDirty) {
      const nextCat = mode === 'assignments' ? 'assignment' : 'exam';
      setCategory(nextCat);
      setResumeValue(nextCat === 'assignment' ? '24' : '5');
      setResumeUnit('hours');
    }
  }, [mode, editingAssessmentId, isDirty]);

  // Fetch per-form assignment stats & attempts whenever editingAssessmentId changes or grading opens
  const refreshFormStats = async (assessmentId: string) => {
    const [assignmentsList, attemptsList] = await Promise.all([
      fetchAssessmentFormAssignments(assessmentId),
      fetchAllAttemptsForAdmin(),
    ]);
    setAdminAttempts(attemptsList);
    const stats: Record<string, { assignedCount: number; avgPercent: number | null }> = {};
    assignmentsList.forEach((a) => {
      if (!stats[a.formId]) stats[a.formId] = { assignedCount: 0, avgPercent: null };
      stats[a.formId].assignedCount += 1;
    });
    const completedByForm = new Map<string, number[]>();
    attemptsList
      .filter((att) => att.assessmentId === assessmentId && att.status !== 'in_progress')
      .forEach((att) => {
        const arr = completedByForm.get(att.formId) || [];
        arr.push(Number(att.percentage) || 0);
        completedByForm.set(att.formId, arr);
      });
    completedByForm.forEach((pcts, fId) => {
      if (!stats[fId]) stats[fId] = { assignedCount: 0, avgPercent: null };
      const sum = pcts.reduce((a, b) => a + b, 0);
      stats[fId].avgPercent = pcts.length > 0 ? Math.round(sum / pcts.length) : null;
    });
    setFormStatsMap(stats);
  };

  useEffect(() => {
    if (editingAssessmentId) {
      void refreshFormStats(editingAssessmentId);
    } else {
      setFormStatsMap({});
    }
  }, [editingAssessmentId]);

  const markDirty = () => setIsDirty(true);

  const updateActiveFormQuestions = (updater: (prev: ExamQuestion[]) => ExamQuestion[]) => {
    setForms((prevForms) =>
      prevForms.map((f) => {
        if (f.id !== activeForm.id) return f;
        const nextQuestions = updater(f.questions);
        return {
          ...f,
          questions: nextQuestions,
          totalPoints: nextQuestions.reduce((acc, q) => acc + (Number(q.points) || 0), 0),
        };
      })
    );
    markDirty();
  };

  const resetToNewAssessment = () => {
    const newId = generateUuid();
    const initialF = makeInitialForm(newId, []);
    const nextCat = mode === 'assignments' ? 'assignment' : 'exam';
    setEditingAssessmentId(null);
    setDraftAssessmentId(newId);
    setTitle('');
    setCategory(nextCat);
    setGrade('3rd Secondary');
    setLessonNumber('');
    setLessonTitle('');
    setDeadline('Available immediately');
    setDurationValue('45');
    setDurationUnit('minutes');
    setResumeValue(nextCat === 'assignment' ? '24' : '5');
    setResumeUnit('hours');
    setMaxAttemptsInput('');
    setShuffleForStudents(true);
    setForms([initialF]);
    setActiveFormId(initialF.id);
    setExpandedQuestionId(null);
    setAiSourceUrl('');
    setAiSourcePath('');
    setAiSourcePreviewBase64('');
    setAiPromptText('');
    setIsDirty(false);
  };

  const loadAssessmentIntoEditor = async (ex: ExamOrAssignment) => {
    setEditingAssessmentId(ex.id);
    setDraftAssessmentId(ex.id);
    setTitle(ex.title);
    setCategory(ex.category);
    setGrade(ex.grade);
    setLessonNumber(ex.lessonNumber ? String(ex.lessonNumber) : '');
    setLessonTitle(ex.lessonTitle || '');
    setDeadline(ex.deadline || 'Available immediately');

    const dUnit: DurationUnit = ex.durationUnit || 'minutes';
    setDurationUnit(dUnit);
    setDurationValue(ex.durationMinutes ? fromMinutesToUnitValue(ex.durationMinutes, dUnit) : '');

    const rUnit: DurationUnit = ex.resumeWindowUnit || 'hours';
    setResumeUnit(rUnit);
    const effectiveResumeMins =
      ex.resumeWindowMinutes !== undefined
        ? ex.resumeWindowMinutes
        : ex.maxCompletionHours && ex.maxCompletionHours > 0
        ? Math.round(ex.maxCompletionHours * 60)
        : undefined;
    setResumeValue(effectiveResumeMins ? fromMinutesToUnitValue(effectiveResumeMins, rUnit) : '');

    setMaxAttemptsInput(ex.maxAttempts && ex.maxAttempts > 0 ? String(ex.maxAttempts) : '');
    setShuffleForStudents(ex.shuffleForStudents !== false);

    // Load forms from Supabase assessment_forms (falls back to existing ex.questions as Form A)
    const remoteForms = await fetchFormsForAssessment(ex.id);
    const loadedForms =
      remoteForms.length > 0
        ? remoteForms
        : [makeInitialForm(ex.id, ex.questions || [])];

    setForms(loadedForms);
    setActiveFormId(loadedForms[0].id);
    setExpandedQuestionId(loadedForms[0].questions[0]?.id || null);
    setIsDirty(false);

    editorTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRequestLoadAssessment = (ex: ExamOrAssignment) => {
    if (isDirty) {
      setPendingActionAfterUnsaved({ type: 'load_exam', exam: ex });
      return;
    }
    void loadAssessmentIntoEditor(ex);
  };

  const handleRequestNewAssessment = () => {
    if (isDirty) {
      setPendingActionAfterUnsaved({ type: 'reset_new' });
      return;
    }
    resetToNewAssessment();
  };

  // =========================================================================
  // AI Source Upload (compressed -> ai-sources/ + immediate delete on replace)
  // =========================================================================
  const handleUploadAiSourceImage = async (file: File) => {
    setIsUploadingAiSource(true);
    try {
      // Read light dataURL preview for immediate offline-resilient Gemini call if needed
      const reader = new FileReader();
      reader.onload = () => setAiSourcePreviewBase64(String(reader.result || ''));
      reader.readAsDataURL(file);

      // Delete previous temp source immediately when teacher replaces it before publish
      if (aiSourcePath) {
        const oldPath = aiSourcePath;
        setSessionTempAiPaths((prev) => prev.filter((p) => p !== oldPath));
        void deleteAiTempSourceImmediately(oldPath);
      }

      const targetAssessmentId = editingAssessmentId || draftAssessmentId;
      const res = await uploadCompressedAiSource(file, targetAssessmentId, activeForm?.id);
      if (res.success && res.publicUrl && res.storagePath) {
        setAiSourceUrl(res.publicUrl);
        setAiSourcePath(res.storagePath);
        setSessionTempAiPaths((prev) => [...prev, res.storagePath!]);
        onSuccessToast('Temporary AI source image compressed and uploaded successfully ✓');
      } else {
        onErrorToast(res.error || 'Unable to upload source image to temporary storage');
      }
    } finally {
      setIsUploadingAiSource(false);
    }
  };

  const handleClearAiSource = () => {
    if (aiSourcePath) {
      const p = aiSourcePath;
      setSessionTempAiPaths((prev) => prev.filter((x) => x !== p));
      void deleteAiTempSourceImmediately(p);
    }
    setAiSourceUrl('');
    setAiSourcePath('');
    setAiSourcePreviewBase64('');
  };

  const handleExtractIntoActiveForm = async () => {
    if (!aiSourceUrl && !aiSourcePreviewBase64 && !aiPromptText.trim()) {
      onErrorToast('Please upload an image or enter instructions to extract questions with Gemini');
      return;
    }
    setIsExtractingAi(true);
    try {
      let promptWithTransform = aiPromptText.trim();
      if (transformMode === 'to_mcq') {
        promptWithTransform +=
          ' (Important note: Convert all questions into multiple-choice with 4 options, specifying the correct answer and English explanation).';
      } else if (transformMode === 'to_essay') {
        promptWithTransform +=
          ' (Important note: Convert all questions into open-ended essay questions with a model answer).';
      }

      const res = await fetch('/api/gemini/extract-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: aiSourceUrl || undefined,
          imageBase64: !aiSourceUrl ? aiSourcePreviewBase64 : undefined,
          promptText: promptWithTransform,
          grade,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        onErrorToast(json?.error || 'Could not extract questions with AI, please try again');
        return;
      }

      if (json.data.title && !title.trim()) {
        setTitle(String(json.data.title).trim());
      }
      const extracted = normalizeQuestionsList(json.data.questions || []);
      if (extracted.length === 0) {
        onErrorToast('Gemini did not find clear questions; please try a clearer image or text.');
        return;
      }
      updateActiveFormQuestions((prev) => [...prev, ...extracted]);
      setExpandedQuestionId(extracted[0].id);
      onSuccessToast(`Extracted ${extracted.length} questions and added them to ${activeForm.name} ✓`);
    } catch (err: any) {
      onErrorToast(err?.message || 'Error connecting to the AI service');
    } finally {
      setIsExtractingAi(false);
    }
  };

  // =========================================================================
  // FORMS MANAGEMENT (up to 10 forms, never auto-created)
  // =========================================================================
  const handleAddEmptyForm = () => {
    if (forms.length >= 10) {
      onErrorToast('Maximum number of forms per assessment is 10.');
      return;
    }
    const nextForm: AssessmentForm = {
      id: generateUuid(),
      assessmentId: editingAssessmentId || draftAssessmentId,
      name: getNextFormName(forms),
      sortOrder: forms.length + 1,
      questions: [],
      totalPoints: 0,
    };
    setForms((prev) => [...prev, nextForm]);
    setActiveFormId(nextForm.id);
    setShowAddFormMenu(false);
    markDirty();
  };

  const handleDuplicateForm = (sourceId: string) => {
    if (forms.length >= 10) {
      onErrorToast('Maximum number of forms per assessment is 10.');
      return;
    }
    const src = forms.find((f) => f.id === sourceId) || activeForm;
    if (!src) return;
    const clonedQuestions: ExamQuestion[] = src.questions.map((q) => {
      const newQId = generateUuid();
      const idMap = new Map<string, string>();
      const clonedChoices = q.choices?.map((c, idx) => {
        const newCid = `${newQId}-c${idx + 1}`;
        idMap.set(c.id, newCid);
        return { ...c, id: newCid };
      });
      return normalizeQuestion({
        ...q,
        id: newQId,
        choices: clonedChoices,
        correctChoiceIds: q.correctChoiceIds?.map((cid) => idMap.get(cid) || cid),
      });
    });
    const nextForm: AssessmentForm = {
      id: generateUuid(),
      assessmentId: editingAssessmentId || draftAssessmentId,
      name: getNextFormName(forms),
      sortOrder: forms.length + 1,
      questions: clonedQuestions,
      totalPoints: clonedQuestions.reduce((a, b) => a + (Number(b.points) || 0), 0),
    };
    setForms((prev) => [...prev, nextForm]);
    setActiveFormId(nextForm.id);
    setOpenMenuFormId(null);
    setShowAddFormMenu(false);
    markDirty();
    onSuccessToast(`Created ${nextForm.name} as an exact copy of ${src.name} ✓`);
  };

  const handleGenerateParallelFormWithGemini = async () => {
    if (forms.length >= 10) {
      onErrorToast('Maximum limit reached (10 forms).');
      return;
    }
    const refForm = activeForm.questions.length > 0 ? activeForm : forms.find((f) => f.questions.length > 0);
    if (!refForm || refForm.questions.length === 0) {
      onErrorToast('There must be questions in the current form first to generate a parallel form.');
      return;
    }

    const targetName = getNextFormName(forms);
    setIsGeneratingParallelForm(true);
    setShowAddFormMenu(false);
    try {
      const res = await fetch('/api/gemini/generate-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceQuestions: refForm.questions,
          targetFormName: targetName,
          title: title || 'English Assessment',
          grade,
          promptText: aiPromptText.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !Array.isArray(json.questions)) {
        onErrorToast(json?.error || 'Could not generate an alternative form with Gemini right now');
        return;
      }
      const normalized = normalizeQuestionsList(json.questions);
      const newForm: AssessmentForm = {
        id: generateUuid(),
        assessmentId: editingAssessmentId || draftAssessmentId,
        name: targetName,
        sortOrder: forms.length + 1,
        questions: normalized,
        totalPoints: normalized.reduce((a, b) => a + (Number(b.points) || 0), 0),
      };
      setForms((prev) => [...prev, newForm]);
      setActiveFormId(newForm.id);
      markDirty();
      onSuccessToast(`Generated ${targetName} (${normalized.length} questions) with matching specs via Gemini ✨`);
    } catch (err: any) {
      onErrorToast(err?.message || 'An error occurred while generating the new form');
    } finally {
      setIsGeneratingParallelForm(false);
    }
  };

  const handleConfirmDeleteForm = (formId: string) => {
    if (forms.length <= 1) {
      onErrorToast('Cannot delete the last remaining form in the assessment.');
      return;
    }
    const remaining = forms.filter((f) => f.id !== formId);
    setForms(remaining);
    if (activeFormId === formId && remaining[0]) {
      setActiveFormId(remaining[0].id);
    }
    setConfirmDeleteFormId(null);
    setOpenMenuFormId(null);
    markDirty();
  };

  const handleSaveRenameForm = (formId: string) => {
    const cleanName = renameFormText.trim();
    if (!cleanName) return;
    setForms((prev) => prev.map((f) => (f.id === formId ? { ...f, name: cleanName } : f)));
    setRenamingFormId(null);
    setOpenMenuFormId(null);
    markDirty();
  };

  // =========================================================================
  // QUESTION EDITING OPERATIONS (MCQ <-> Essay, multi-images, choices + images, reorder)
  // =========================================================================
  const handleAddQuestion = (qType: 'mcq' | 'essay') => {
    const newQ = createEmptyQuestion(qType);
    updateActiveFormQuestions((prev) => [...prev, newQ]);
    setExpandedQuestionId(newQ.id);
  };

  const handleDuplicateQuestion = (idx: number) => {
    const src = activeQuestions[idx];
    if (!src) return;
    const newId = generateUuid();
    const idMap = new Map<string, string>();
    const clonedChoices = src.choices?.map((c, cIdx) => {
      const nextCid = `${newId}-c${cIdx + 1}`;
      idMap.set(c.id, nextCid);
      return { ...c, id: nextCid };
    });
    const clone = normalizeQuestion({
      ...src,
      id: newId,
      question: `${src.question} (Copy)`,
      choices: clonedChoices,
      correctChoiceIds: src.correctChoiceIds?.map((cid) => idMap.get(cid) || cid),
    });
    updateActiveFormQuestions((prev) => {
      const copy = [...prev];
      copy.splice(idx + 1, 0, clone);
      return copy;
    });
    setExpandedQuestionId(clone.id);
  };

  const handleMoveQuestion = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= activeQuestions.length || fromIdx === toIdx) return;
    updateActiveFormQuestions((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, item);
      return copy;
    });
  };

  const handleToggleQuestionTypeConfirmed = (qId: string) => {
    updateActiveFormQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        if (q.type === 'mcq') {
          const cached = {
            choices: q.choices,
            correctChoiceIds: q.correctChoiceIds,
            options: q.options,
            correctAnswer: q.correctAnswer,
          };
          const correctText =
            q.choices
              ?.filter((c) => q.correctChoiceIds?.includes(c.id))
              .map((c) => c.text)
              .join(', ') ||
            q.correctAnswer ||
            q.explanation ||
            '';
          return {
            ...q,
            type: 'essay',
            options: undefined,
            choices: undefined,
            correctChoiceIds: undefined,
            correctAnswer: correctText,
            explanation: q.explanation || correctText,
            _cachedMcqChoices: cached,
          };
        }

        // Convert essay -> mcq: restore cached choices if still in memory!
        if (q._cachedMcqChoices?.choices && q._cachedMcqChoices.choices.length >= 2) {
          return normalizeQuestion({
            ...q,
            type: 'mcq',
            choices: q._cachedMcqChoices.choices,
            correctChoiceIds: q._cachedMcqChoices.correctChoiceIds,
            options: q._cachedMcqChoices.options,
            correctAnswer: q._cachedMcqChoices.correctAnswer || '',
            _cachedMcqChoices: undefined,
          });
        }

        const c1 = `${q.id}-c1`;
        const c2 = `${q.id}-c2`;
        const c3 = `${q.id}-c3`;
        const c4 = `${q.id}-c4`;
        const firstText = q.correctAnswer?.trim() || 'Correct Answer';
        return normalizeQuestion({
          ...q,
          type: 'mcq',
          choices: [
            { id: c1, text: firstText },
            { id: c2, text: 'Second Option' },
            { id: c3, text: 'Third Option' },
            { id: c4, text: 'Fourth Option' },
          ],
          correctChoiceIds: [c1],
          correctAnswer: firstText,
          _cachedMcqChoices: undefined,
        });
      })
    );
    setConfirmToggleTypeQId(null);
  };

  const handlePatchQuestion = (qId: string, patch: Partial<ExamQuestion>) => {
    updateActiveFormQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, ...patch } : q))
    );
  };

  const handleUploadCompressedImage = async (
    file: File,
    uploadKey: string,
    onDone: (publicUrl: string) => void
  ) => {
    setUploadingImageKey(uploadKey);
    try {
      const compressed = await compressImageFile(file, 1600, 0.82);
      const res = await uploadFileWithRealProgress(compressed, 'Files', undefined, 'question-images');
      if (res.success && res.url) {
        onDone(res.url);
        onSuccessToast('Image compressed and uploaded to Supabase successfully ✓');
      } else {
        onErrorToast(res.error || 'Failed to upload image');
      }
    } finally {
      setUploadingImageKey(null);
    }
  };

  // =========================================================================
  // EXPLICIT SAVE / PUBLISH (Promotes ai-sources/ -> question-images/ & cleans temp)
  // =========================================================================
  const handleSaveAssessment = async (): Promise<boolean> => {
    if (!title.trim()) {
      onErrorToast('Please enter the exam, assignment, or sheet title');
      return false;
    }
    const nonEmptyForms = forms.filter((f) => f.questions.length > 0);
    if (nonEmptyForms.length === 0) {
      onErrorToast('Please add at least one question before saving or publishing');
      return false;
    }

    setIsSaving(true);
    try {
      const targetId = editingAssessmentId || draftAssessmentId;
      // Strip _cachedMcqChoices and ensure every question/choice has immutable IDs
      const cleanedForms: AssessmentForm[] = forms.map((f, idx) => ({
        ...f,
        assessmentId: targetId,
        sortOrder: idx + 1,
        questions: normalizeQuestionsList(f.questions).map(({ _cachedMcqChoices, ...rest }) => rest),
      }));

      // Promote any ai-sources/ images inside questions/choices to permanent question-images/ & delete temp sources
      const { updatedForms } = await promoteAiSourcesAndCleanupOnPublish(
        targetId,
        cleanedForms,
        sessionTempAiPaths
      );
      setSessionTempAiPaths([]);
      setAiSourceUrl('');
      setAiSourcePath('');
      setAiSourcePreviewBase64('');

      const primaryQuestions = updatedForms[0]?.questions || [];
      const totalCalculatedPoints =
        primaryQuestions.reduce((acc, q) => acc + (Number(q.points) || 0), 0) || 60;

      const parsedDurationVal = parseFloat(durationValue);
      const finalDurationMinutes =
        !Number.isNaN(parsedDurationVal) && parsedDurationVal > 0
          ? toMinutesFromUnit(parsedDurationVal, durationUnit)
          : undefined;

      const parsedResumeVal = parseFloat(resumeValue);
      const finalResumeMinutes =
        !Number.isNaN(parsedResumeVal) && parsedResumeVal > 0
          ? toMinutesFromUnit(parsedResumeVal, resumeUnit)
          : undefined;

      const parsedMaxAttempts = parseInt(maxAttemptsInput, 10);
      const finalMaxAttempts =
        !Number.isNaN(parsedMaxAttempts) && parsedMaxAttempts > 0 ? parsedMaxAttempts : undefined;

      const existingExam = editingAssessmentId
        ? platformDB.getExams().find((item) => item.id === editingAssessmentId)
        : undefined;

      const assessmentPayload: ExamOrAssignment = {
        id: targetId,
        title: title.trim(),
        category,
        grade,
        lessonNumber: lessonNumber.trim() ? parseInt(lessonNumber.trim(), 10) : undefined,
        lessonTitle: lessonTitle.trim() || undefined,
        durationMinutes: finalDurationMinutes,
        durationUnit,
        resumeWindowMinutes: finalResumeMinutes,
        resumeWindowUnit: resumeUnit,
        maxCompletionHours: finalResumeMinutes
          ? Number((finalResumeMinutes / 60).toFixed(2))
          : category === 'assignment'
          ? 24
          : 5,
        maxAttempts: finalMaxAttempts,
        shuffleForStudents,
        totalPoints: totalCalculatedPoints,
        deadline: deadline.trim() || 'Available immediately',
        questions: primaryQuestions,
        forms: updatedForms,
        createdAt: existingExam?.createdAt || new Date().toISOString(),
      };

      const { supabaseResult } = await platformDB.saveExamAsync(assessmentPayload);
      if (!supabaseResult.success) {
        onErrorToast(`Unable to save assessment in Supabase: ${supabaseResult.error || 'Unknown error'}`);
        return false;
      }

      const formsSaveRes = await saveAssessmentForms(targetId, updatedForms);
      if (!formsSaveRes.success && formsSaveRes.error) {
        onErrorToast(formsSaveRes.error);
      }

      setForms(formsSaveRes.forms);
      setEditingAssessmentId(targetId);
      setIsDirty(false);
      onDataChanged();
      onSuccessToast(
        editingAssessmentId
          ? 'All edits and forms saved and synced to Supabase successfully ✨'
          : 'Assessment published with all its forms and settings in Supabase ✨'
      );
      void refreshFormStats(targetId);
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  // =========================================================================
  // ESSAY GRADING & AUDIT LOG IN PUBLISHED ASSESSMENTS LIST
  // =========================================================================
  const handleStartGradingSubmission = (ex: ExamOrAssignment, sub: ExamSubmission) => {
    setGradingSubmissionId(sub.id);
    const matchedAtt = adminAttempts.find((a) => a.id === (sub.attemptId || sub.id));
    const snapshotQs = normalizeQuestionsList(
      matchedAtt?.questionsSnapshot && matchedAtt.questionsSnapshot.length > 0
        ? matchedAtt.questionsSnapshot
        : sub.questionsSnapshot && sub.questionsSnapshot.length > 0
        ? sub.questionsSnapshot
        : ex.questions
    );
    const drafts: Record<string, string> = {};
    snapshotQs.forEach((q) => {
      if (q.type === 'essay') {
        const existingScore = sub.questionGrades?.[q.id] ?? matchedAtt?.questionGrades?.[q.id];
        if (existingScore !== undefined) {
          drafts[q.id] = String(existingScore);
        } else if (sub.autoZeroedQuestions?.includes(q.id) || !(sub.answers[q.id] || '').trim()) {
          drafts[q.id] = '0';
        } else {
          drafts[q.id] = String(q.points);
        }
      }
    });
    setEssayDraftScores(drafts);
    setEssayDraftFeedback(sub.teacherFeedback || '');
  };

  const handleSaveEssayGrades = async (ex: ExamOrAssignment, sub: ExamSubmission) => {
    const matchedAtt = adminAttempts.find((a) => a.id === (sub.attemptId || sub.id));
    const snapshotQs = normalizeQuestionsList(
      matchedAtt?.questionsSnapshot && matchedAtt.questionsSnapshot.length > 0
        ? matchedAtt.questionsSnapshot
        : sub.questionsSnapshot && sub.questionsSnapshot.length > 0
        ? sub.questionsSnapshot
        : ex.questions
    );

    const updatedQuestionGrades: Record<string, number> = {
      ...(matchedAtt?.questionGrades || sub.questionGrades || {}),
    };
    let computedMcqScore = 0;
    let computedEssayScore = 0;

    snapshotQs.forEach((q) => {
      const studentAns = (sub.answers[q.id] || '').trim();
      if (q.type === 'mcq') {
        const existingVal = updatedQuestionGrades[q.id];
        const qScore = existingVal !== undefined ? Number(existingVal) : 0;
        updatedQuestionGrades[q.id] = qScore;
        computedMcqScore += qScore;
      } else {
        const isBlank = studentAns === '';
        const parsed = isBlank
          ? 0
          : Math.min(q.points, Math.max(0, parseFloat(essayDraftScores[q.id] || '0') || 0));
        updatedQuestionGrades[q.id] = parsed;
        computedEssayScore += parsed;
      }
    });

    const totalPts =
      snapshotQs.reduce((a, b) => a + (Number(b.points) || 0), 0) || ex.totalPoints;
    const totalScore = computedMcqScore + computedEssayScore;
    const grader = platformDB.getCurrentUser()?.fullName || 'Miss Asmaa';

    const updatedSub: ExamSubmission = {
      ...sub,
      score: totalScore,
      totalPoints: totalPts,
      mcqScore: computedMcqScore,
      essayGradingPending: false,
      questionGrades: updatedQuestionGrades,
      teacherFeedback: essayDraftFeedback.trim() || undefined,
      gradedAt: new Date().toISOString(),
      gradedBy: grader,
    };

    await platformDB.saveSubmissionAsync(updatedSub);
    if (matchedAtt) {
      await updateAttemptEssayGrades({
        attemptId: matchedAtt.id,
        questionGrades: updatedQuestionGrades,
        score: totalScore,
        mcqScore: computedMcqScore,
        totalPoints: totalPts,
        teacherFeedback: essayDraftFeedback.trim() || undefined,
        gradedBy: grader,
      });
    }

    setGradingSubmissionId(null);
    onSuccessToast(`Final score approved for ${sub.studentName} (${totalScore} / ${totalPts}) ✓`);
    onDataChanged();
  };

  const handleDeleteExam = (id: string) => {
    platformDB.deleteExam(id);
    if (editingAssessmentId === id) {
      resetToNewAssessment();
    }
    onDataChanged();
  };

  const filteredPublishedExams = useMemo(() => {
    if (listFilterCategory !== 'all') {
      return allExams.filter((e) => e.category === listFilterCategory);
    }
    if (mode === 'exams') return allExams.filter((e) => e.category === 'exam');
    if (mode === 'assignments') {
      return allExams.filter((e) => e.category === 'assignment' || e.category === 'sheet');
    }
    return allExams;
  }, [allExams, listFilterCategory, mode]);

  const categoryEnglishLabel =
    category === 'assignment' ? 'Assignment' : category === 'sheet' ? 'Sheet' : 'Exam';

  return (
    <div ref={editorTopRef} className="space-y-6">
      {/* Unsaved Changes Intercept Banner */}
      {pendingActionAfterUnsaved && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-400 dark:border-amber-500/60 shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>You have unsaved changes on the current assessment. Save them before continuing?</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const pending = pendingActionAfterUnsaved;
                const saved = await handleSaveAssessment();
                if (!saved) return;
                setPendingActionAfterUnsaved(null);
                if (pending.type === 'load_exam') void loadAssessmentIntoEditor(pending.exam);
                else resetToNewAssessment();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              Save & Continue
            </button>
            <button
              type="button"
              onClick={() => {
                const pending = pendingActionAfterUnsaved;
                setPendingActionAfterUnsaved(null);
                if (pending.type === 'load_exam') void loadAssessmentIntoEditor(pending.exam);
                else resetToNewAssessment();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
            >
              Discard Changes
            </button>
            <button
              type="button"
              onClick={() => setPendingActionAfterUnsaved(null)}
              className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main Unified Assessment & Forms Card */}
      <div className="bg-slate-50 dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-5">
        {/* Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-500" />
              <span>
                {editingAssessmentId
                  ? `Edit ${categoryEnglishLabel}: ${title || 'Untitled'}`
                  : `Create New Multi-Form ${categoryEnglishLabel}`}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Timer, entry limit, and form settings are completely independent for this assessment only and do not affect any other assessment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDirty && (
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={handleRequestNewAssessment}
              className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
            >
              + New Assessment
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAssessment()}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-extrabold shadow-md cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{editingAssessmentId ? 'Save Changes' : 'Save & Publish Assessment'}</span>
            </button>
          </div>
        </div>

        {/* 1) SECTION: Assessment Metadata + Independent Dual Timers + Max Attempts + Shuffle */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Exam / Assignment / Sheet Title:
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDirty();
                }}
                placeholder="e.g., Unit 1 Comprehensive Grammar & Vocabulary Exam"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Type:
              </label>
              <select
                value={category}
                onChange={(e) => {
                  const nextCat = e.target.value as ExamOrAssignment['category'];
                  setCategory(nextCat);
                  if (!editingAssessmentId) {
                    setResumeValue(nextCat === 'assignment' ? '24' : '5');
                    setResumeUnit('hours');
                  }
                  markDirty();
                }}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="exam">Online Exam</option>
                <option value="assignment">Homework Assignment</option>
                <option value="sheet">Practice Sheet</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Grade Level:
              </label>
              <select
                value={grade}
                onChange={(e) => {
                  setGrade(e.target.value);
                  markDirty();
                }}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="3rd Secondary">{`3rd Secondary (${settings.academicYear})`}</option>
                <option value="2nd Secondary">2nd Secondary</option>
                <option value="1st Secondary">1st Secondary</option>
              </select>
            </div>
          </div>

          {/* Two Strictly Independent Timers + Max Entry Attempts + Lesson Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Timer A: Duration */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                {categoryEnglishLabel} Duration
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={durationValue}
                  onChange={(e) => {
                    setDurationValue(e.target.value);
                    markDirty();
                  }}
                  placeholder="Open"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono"
                />
                <select
                  value={durationUnit}
                  onChange={(e) => {
                    setDurationUnit(e.target.value as DurationUnit);
                    markDirty();
                  }}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-900 dark:text-white shrink-0"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Starts when student enters. Leave blank for unlimited time.
              </p>
            </div>

            {/* Timer B: Resume Window */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500/40 space-y-1.5">
              <label className="block text-xs font-bold text-amber-800 dark:text-amber-300">
                Resume Window
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={resumeValue}
                  onChange={(e) => {
                    setResumeValue(e.target.value);
                    markDirty();
                  }}
                  placeholder="Open"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono"
                />
                <select
                  value={resumeUnit}
                  onChange={(e) => {
                    setResumeUnit(e.target.value as DurationUnit);
                    markDirty();
                  }}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-900 dark:text-white shrink-0"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Starts only on student's first exit and is completely independent.
              </p>
            </div>

            {/* Max Entry Attempts */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                Allowed Attempts
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={maxAttemptsInput}
                onChange={(e) => {
                  setMaxAttemptsInput(e.target.value);
                  markDirty();
                }}
                placeholder="Unlimited"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono"
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                For completed attempts only (resuming does not count as an attempt).
              </p>
            </div>

            {/* Lesson + Shuffle Toggle */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={lessonNumber}
                  onChange={(e) => {
                    setLessonNumber(e.target.value);
                    markDirty();
                  }}
                  placeholder="No."
                  title="Lesson number"
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-900 dark:text-white font-mono text-center"
                />
                <input
                  type="text"
                  value={lessonTitle}
                  onChange={(e) => {
                    setLessonTitle(e.target.value);
                    markDirty();
                  }}
                  placeholder="Lesson / Unit Name"
                  className="col-span-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-center justify-between gap-2 cursor-pointer pt-0.5">
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  Randomize order per student
                </span>
                <input
                  type="checkbox"
                  checked={shuffleForStudents}
                  onChange={(e) => {
                    setShuffleForStudents(e.target.checked);
                    markDirty();
                  }}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>

        {/* 2) SECTION: Forms (Strictly BETWEEN metadata and "Ready Questions") */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                Forms ({forms.length} / 10)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                The system distributes forms randomly and evenly among students on their first open. Forms belong to this assessment only.
              </p>
            </div>

            <div className="relative">
              <button
                type="button"
                disabled={forms.length >= 10 || isGeneratingParallelForm}
                onClick={() => setShowAddFormMenu((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs shadow-sm cursor-pointer"
              >
                {isGeneratingParallelForm ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>+ Add Another Form</span>
              </button>

              {showAddFormMenu && (
                <div className="absolute right-0 mt-2 w-72 z-30 p-3 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-2xl space-y-2 text-xs">
                  <button
                    type="button"
                    onClick={handleAddEmptyForm}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                  >
                    <span>Empty Form</span>
                    <Plus className="w-3.5 h-3.5 text-amber-500" />
                  </button>

                  <div className="border-t border-slate-200 dark:border-slate-800 pt-2 space-y-1.5">
                    <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                      Copy from existing form:
                    </span>
                    <select
                      value={duplicateSourceFormId || activeForm.id}
                      onChange={(e) => setDuplicateSourceFormId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                    >
                      {forms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.questions.length} Qs)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDuplicateForm(duplicateSourceFormId || activeForm.id)}
                      className="w-full px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer"
                    >
                      Create Exact Copy
                    </button>
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-800 pt-2">
                    <button
                      type="button"
                      onClick={() => void handleGenerateParallelFormWithGemini()}
                      className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate with Gemini (Same Specs)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Horizontal Scrollable Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {forms.map((f) => {
              const isSelected = f.id === activeForm?.id;
              const stats = formStatsMap[f.id];
              const qPts = f.questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0);

              return (
                <div key={f.id} className="relative shrink-0">
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-slate-900 dark:text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {renamingFormId === f.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={renameFormText}
                          onChange={(e) => setRenameFormText(e.target.value)}
                          className="w-28 bg-white dark:bg-slate-900 border border-amber-500 rounded-lg px-2 py-0.5 text-xs"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRenameForm(f.id)}
                          className="p-1 text-emerald-600 hover:text-emerald-500 cursor-pointer"
                          title="Save name"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingFormId(null)}
                          className="p-1 text-slate-500 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFormId(f.id);
                          setExpandedQuestionId(f.questions[0]?.id || null);
                          setOpenMenuFormId(null);
                        }}
                        className="text-left cursor-pointer"
                      >
                        <div className="text-xs font-extrabold whitespace-nowrap">
                          {f.name}{' '}
                          <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            ({f.questions.length} Qs · {qPts} pts)
                          </span>
                        </div>
                        {stats && stats.assignedCount > 0 && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                            {stats.assignedCount} students
                            {stats.avgPercent !== null ? ` · Avg ${stats.avgPercent}%` : ''}
                          </div>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuFormId((prev) => (prev === f.id ? null : f.id));
                      }}
                      className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                      aria-label={`Options for ${f.name}`}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {openMenuFormId === f.id && (
                    <div className="absolute left-0 mt-1.5 w-44 z-30 p-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-xl text-xs space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingFormId(f.id);
                          setRenameFormText(f.name);
                          setOpenMenuFormId(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Rename</span>
                      </button>
                      <button
                        type="button"
                        disabled={forms.length >= 10}
                        onClick={() => handleDuplicateForm(f.id)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Duplicate Form</span>
                      </button>
                      {forms.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteFormId(f.id);
                            setOpenMenuFormId(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Form</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {confirmDeleteFormId && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-rose-800 dark:text-rose-200">
                Confirm deleting "{forms.find((f) => f.id === confirmDeleteFormId)?.name}" and all its questions?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirmDeleteForm(confirmDeleteFormId)}
                  className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteFormId(null)}
                  className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3) SECTION: Gemini Extraction Box targeting ONLY the active form */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-white to-blue-500/10 dark:from-amber-500/10 dark:via-slate-900 dark:to-blue-500/10 border border-amber-500/35 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                Extract & Generate Questions for "{activeForm?.name}" via Gemini AI
              </span>
            </div>
            {onEmergencyResetAi && (
              <button
                type="button"
                onClick={onEmergencyResetAi}
                disabled={isResettingAi}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-bold cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isResettingAi ? 'animate-spin' : ''}`} />
                <span>Reset AI</span>
              </button>
            )}
          </div>

          {aiResetMessage && (
            <div
              className={`p-2 rounded-xl text-xs font-semibold border ${
                aiResetMessage.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 text-rose-700 dark:text-rose-300'
              }`}
            >
              {aiResetMessage.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                1. Temporary Source Image (compressed & auto-deleted from storage after publish):
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer">
                  {isUploadingAiSource ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{isUploadingAiSource ? 'Compressing & Uploading...' : 'Upload Page/Question Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadAiSourceImage(f);
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                </label>
                {(aiSourceUrl || aiSourcePreviewBase64) && (
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800">
                    <img
                      src={aiSourceUrl || aiSourcePreviewBase64}
                      alt="Source preview"
                      className="w-8 h-8 object-cover rounded"
                    />
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Ready
                    </span>
                    <button
                      type="button"
                      onClick={handleClearAiSource}
                      className="text-rose-500 hover:text-rose-600 p-0.5 cursor-pointer"
                      title="Remove source image immediately"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                2. Teacher Instructions for Gemini:
              </label>
              <input
                type="text"
                value={aiPromptText}
                onChange={(e) => setAiPromptText(e.target.value)}
                placeholder="e.g., Extract 10 grammar & vocabulary questions on Unit 1 with answers and explanations..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTransformMode('none')}
                  className={`px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                    transformMode === 'none'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800'
                  }`}
                >
                  As Original
                </button>
                <button
                  type="button"
                  onClick={() => setTransformMode('to_mcq')}
                  className={`px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                    transformMode === 'to_mcq'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800'
                  }`}
                >
                  Convert to MCQ
                </button>
                <button
                  type="button"
                  onClick={() => setTransformMode('to_essay')}
                  className={`px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                    transformMode === 'to_essay'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800'
                  }`}
                >
                  Convert to Essay
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleGenerateParallelFormWithGemini()}
              disabled={isGeneratingParallelForm || forms.length >= 10 || activeQuestions.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-45 text-white font-bold text-xs shadow cursor-pointer"
            >
              {isGeneratingParallelForm ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Generate Parallel Form (Same Specs)</span>
            </button>

            <button
              type="button"
              onClick={() => void handleExtractIntoActiveForm()}
              disabled={isExtractingAi}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs shadow cursor-pointer"
            >
              {isExtractingAi ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Extract & Generate Questions in "{activeForm?.name}"</span>
            </button>
          </div>
        </div>

        {/* 4) SECTION: "Ready Questions" for Active Form (Full Editability Pre & Post Publish) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h4 className="text-xs sm:text-sm font-extrabold text-amber-600 dark:text-amber-400">
                Ready Questions — {activeForm?.name} ({activeQuestions.length} questions · {activeTotalPoints} pts)
              </h4>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                <span>MCQ: {activeQuestions.filter((q) => q.type === 'mcq').length}</span>
                <span>·</span>
                <span>Essay: {activeQuestions.filter((q) => q.type === 'essay').length}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddQuestion('mcq')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ MCQ Question</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion('essay')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Essay Question</span>
              </button>
            </div>
          </div>

          {activeQuestions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No questions in {activeForm?.name} yet. Extract questions using Gemini or add one manually above.
            </div>
          ) : (
            <div className="space-y-3">
              {activeQuestions.map((rawQ, idx) => {
                const q = normalizeQuestion(rawQ, idx);
                const isExpanded = expandedQuestionId === q.id;
                const qImages = extractQuestionImageUrls(q);
                const hasAllOfAbove =
                  q.type === 'mcq' && (q.choices || []).some((c) => isAllOfTheAboveChoice(c.text));

                return (
                  <div
                    key={q.id}
                    draggable
                    onDragStart={() => setDraggedQuestionIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedQuestionIndex !== null) {
                        handleMoveQuestion(draggedQuestionIndex, idx);
                      }
                      setDraggedQuestionIndex(null);
                    }}
                    className={`rounded-2xl border transition-colors ${
                      isExpanded
                        ? 'bg-slate-50 dark:bg-slate-950 border-amber-400 dark:border-amber-500/50'
                        : 'bg-slate-50/70 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Question Card Header */}
                    <div className="p-3 sm:p-4 flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span
                          className="mt-1 text-slate-400 cursor-grab active:cursor-grabbing shrink-0 hidden sm:inline-flex"
                          title="Drag to reorder question"
                        >
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                            className="text-left w-full cursor-pointer"
                          >
                            <div className="text-xs font-extrabold text-slate-900 dark:text-white break-words">
                              <span className="text-amber-600 dark:text-amber-400 mr-1.5">Q{idx + 1}:</span>
                              {q.question || 'New question (click to edit)'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                              <span>{q.type === 'mcq' ? 'Multiple Choice' : 'Essay'}</span>
                              <span>·</span>
                              <span className="font-mono">{q.points} pts</span>
                              {qImages.length > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="text-blue-600 dark:text-blue-400">
                                    {qImages.length} {qImages.length === 1 ? 'image' : 'images'}
                                  </span>
                                </>
                              )}
                              {q.groupId && (
                                <>
                                  <span>·</span>
                                  <span>Group: {q.groupId}</span>
                                </>
                              )}
                            </div>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {/* Mobile / Quick Reorder */}
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveQuestion(idx, idx - 1)}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-30 cursor-pointer"
                          title="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === activeQuestions.length - 1}
                          onClick={() => handleMoveQuestion(idx, idx + 1)}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-30 cursor-pointer"
                          title="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        {/* Toggle MCQ <-> Essay (Confirmation trigger) */}
                        <button
                          type="button"
                          onClick={() => setConfirmToggleTypeQId(q.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                            q.type === 'mcq'
                              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
                              : 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30'
                          }`}
                        >
                          {q.type === 'mcq' ? 'MCQ ⇄ Essay' : 'Essay ⇄ MCQ'}
                        </button>

                        {/* Duplicate Question */}
                        <button
                          type="button"
                          onClick={() => handleDuplicateQuestion(idx)}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-amber-500 cursor-pointer"
                          title="Duplicate question"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Expand/Collapse */}
                        <button
                          type="button"
                          onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold cursor-pointer"
                        >
                          {isExpanded ? 'Collapse' : 'Edit'}
                        </button>

                        {/* Delete Question Trigger */}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteQId(q.id)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                          title="Delete question"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Confirmations */}
                    {confirmToggleTypeQId === q.id && (
                      <div className="mx-3 mb-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-amber-900 dark:text-amber-200">
                          {q.type === 'mcq'
                            ? 'Convert question to Essay? (Choices will remain cached in memory until saved).'
                            : 'Convert question to Multiple Choice?'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleQuestionTypeConfirmed(q.id)}
                            className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold cursor-pointer"
                          >
                            Confirm Convert
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmToggleTypeQId(null)}
                            className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {confirmDeleteQId === q.id && (
                      <div className="mx-3 mb-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-rose-800 dark:text-rose-200">
                          Are you sure you want to delete question #{idx + 1}?
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              updateActiveFormQuestions((prev) => prev.filter((item) => item.id !== q.id));
                              setConfirmDeleteQId(null);
                            }}
                            className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                          >
                            Yes, Delete Question
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteQId(null)}
                            className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Expanded Full Question Editor Body */}
                    {isExpanded && (
                      <div className="px-3 sm:px-4 pb-4 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-8">
                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              Question Text:
                            </label>
                            <textarea
                              rows={3}
                              value={q.question}
                              onChange={(e) => handlePatchQuestion(q.id, { question: e.target.value })}
                              placeholder="Type the full question text here..."
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="md:col-span-4 space-y-2">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                                Question Points:
                              </label>
                              <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                value={q.points}
                                onChange={(e) =>
                                  handlePatchQuestion(q.id, {
                                    points: Math.max(0.5, parseFloat(e.target.value) || 1),
                                  })
                                }
                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                                Linked Question Group (optional):
                              </label>
                              <input
                                type="text"
                                value={q.groupId || ''}
                                onChange={(e) =>
                                  handlePatchQuestion(q.id, { groupId: e.target.value.trim() || undefined })
                                }
                                placeholder="e.g., G1"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Question Multi-Images */}
                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              Question Images ({qImages.length}):
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer">
                                {uploadingImageKey === `q-${q.id}` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ImageIcon className="w-3.5 h-3.5" />
                                )}
                                <span>+ Upload Question Image</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    void handleUploadCompressedImage(file, `q-${q.id}`, (url) => {
                                      const next = [...qImages, url];
                                      handlePatchQuestion(q.id, {
                                        imageUrl: next[0],
                                        imageUrls: next,
                                      });
                                    });
                                    e.currentTarget.value = '';
                                  }}
                                  className="hidden"
                                />
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={imageUrlDraftByKey[`q-${q.id}`] || ''}
                                  onChange={(e) =>
                                    setImageUrlDraftByKey((p) => ({ ...p, [`q-${q.id}`]: e.target.value }))
                                  }
                                  placeholder="Or paste image URL..."
                                  className="w-40 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const u = (imageUrlDraftByKey[`q-${q.id}`] || '').trim();
                                    if (!u) return;
                                    const next = [...qImages, u];
                                    handlePatchQuestion(q.id, { imageUrl: next[0], imageUrls: next });
                                    setImageUrlDraftByKey((p) => ({ ...p, [`q-${q.id}`]: '' }));
                                  }}
                                  className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-[11px] font-bold cursor-pointer"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          </div>

                          {qImages.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {qImages.map((imgUrl, imgIdx) => (
                                <div
                                  key={`${imgUrl}-${imgIdx}`}
                                  className="relative group w-24 h-24 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950"
                                >
                                  <img
                                    src={imgUrl}
                                    alt={`Question image ${imgIdx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = qImages.filter((_, i) => i !== imgIdx);
                                      handlePatchQuestion(q.id, {
                                        imageUrl: next[0] || undefined,
                                        imageUrls: next.length > 0 ? next : undefined,
                                      });
                                    }}
                                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow cursor-pointer"
                                    title="Remove image"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* MCQ Choices Editor OR Essay Model Answer */}
                        {q.type === 'mcq' ? (
                          <div className="space-y-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">
                                Options ({(q.choices || []).length}) — Click the checkmark to set one or more correct answers:
                              </span>
                              <div className="flex flex-wrap items-center gap-3">
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(q.lockChoiceOrder)}
                                    onChange={(e) =>
                                      handlePatchQuestion(q.id, { lockChoiceOrder: e.target.checked })
                                    }
                                    className="w-3.5 h-3.5 accent-amber-500"
                                  />
                                  <span>Lock choice order</span>
                                </label>
                                {hasAllOfAbove && (
                                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                    "All of the above" is pinned at the end automatically
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentChoices = q.choices || [];
                                    const nextChoice: ExamChoice = {
                                      id: `${q.id}-c${Date.now()}`,
                                      text: `Option ${currentChoices.length + 1}`,
                                    };
                                    handlePatchQuestion(
                                      q.id,
                                      normalizeQuestion({
                                        ...q,
                                        choices: [...currentChoices, nextChoice],
                                      })
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add Option</span>
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {(q.choices || []).map((choice, cIdx) => {
                                const isCorrectChoice = (q.correctChoiceIds || []).includes(choice.id);
                                return (
                                  <div
                                    key={choice.id}
                                    className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-2 ${
                                      isCorrectChoice
                                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-500/50'
                                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const currentCorrect = q.correctChoiceIds || [];
                                          let nextCorrect: string[];
                                          if (currentCorrect.includes(choice.id)) {
                                            if (currentCorrect.length <= 1) return; // keep at least 1 correct
                                            nextCorrect = currentCorrect.filter((id) => id !== choice.id);
                                          } else {
                                            nextCorrect = [...currentCorrect, choice.id];
                                          }
                                          handlePatchQuestion(
                                            q.id,
                                            normalizeQuestion({ ...q, correctChoiceIds: nextCorrect })
                                          );
                                        }}
                                        title={
                                          isCorrectChoice
                                            ? 'Correct answer (click to unselect if others exist)'
                                            : 'Mark as correct answer (supports single or multiple)'
                                        }
                                        className={`w-7 h-7 rounded-lg flex items-center justify-center border font-bold text-xs shrink-0 cursor-pointer ${
                                          isCorrectChoice
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-300 dark:border-slate-700 hover:border-emerald-500'
                                        }`}
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>

                                      <span className="text-xs font-bold text-slate-500 w-5 shrink-0">
                                        {getArabicChoiceLetter(cIdx)})
                                      </span>

                                      <input
                                        type="text"
                                        value={choice.text}
                                        onChange={(e) => {
                                          const nextChoices = (q.choices || []).map((c) =>
                                            c.id === choice.id ? { ...c, text: e.target.value } : c
                                          );
                                          handlePatchQuestion(
                                            q.id,
                                            normalizeQuestion({ ...q, choices: nextChoices })
                                          );
                                        }}
                                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                                      />
                                    </div>

                                    {/* Per-choice Image + Reorder + Delete */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {choice.imageUrl && (
                                        <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700">
                                          <img
                                            src={choice.imageUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const nextChoices = (q.choices || []).map((c) =>
                                                c.id === choice.id ? { ...c, imageUrl: undefined } : c
                                              );
                                              handlePatchQuestion(q.id, { choices: nextChoices });
                                            }}
                                            className="absolute inset-0 bg-black/55 opacity-0 hover:opacity-100 text-white flex items-center justify-center cursor-pointer"
                                            title="Delete option image"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      )}

                                      <label
                                        className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                        title="Attach or replace image for this option"
                                      >
                                        {uploadingImageKey === `c-${choice.id}` ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <ImageIcon className="w-3 h-3" />
                                        )}
                                        <span className="hidden md:inline">Image</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (!f) return;
                                            void handleUploadCompressedImage(f, `c-${choice.id}`, (url) => {
                                              const nextChoices = (q.choices || []).map((c) =>
                                                c.id === choice.id ? { ...c, imageUrl: url } : c
                                              );
                                              handlePatchQuestion(q.id, { choices: nextChoices });
                                            });
                                            e.currentTarget.value = '';
                                          }}
                                          className="hidden"
                                        />
                                      </label>

                                      <button
                                        type="button"
                                        disabled={cIdx === 0}
                                        onClick={() => {
                                          const arr = [...(q.choices || [])];
                                          [arr[cIdx - 1], arr[cIdx]] = [arr[cIdx], arr[cIdx - 1]];
                                          handlePatchQuestion(
                                            q.id,
                                            normalizeQuestion({ ...q, choices: arr })
                                          );
                                        }}
                                        className="p-1 rounded bg-slate-200 dark:bg-slate-800 disabled:opacity-30 cursor-pointer"
                                        title="Move up"
                                      >
                                        <ArrowUp className="w-3 h-3" />
                                      </button>

                                      <button
                                        type="button"
                                        disabled={cIdx === (q.choices || []).length - 1}
                                        onClick={() => {
                                          const arr = [...(q.choices || [])];
                                          [arr[cIdx + 1], arr[cIdx]] = [arr[cIdx], arr[cIdx + 1]];
                                          handlePatchQuestion(
                                            q.id,
                                            normalizeQuestion({ ...q, choices: arr })
                                          );
                                        }}
                                        className="p-1 rounded bg-slate-200 dark:bg-slate-800 disabled:opacity-30 cursor-pointer"
                                        title="Move down"
                                      >
                                        <ArrowDown className="w-3 h-3" />
                                      </button>

                                      {(q.choices || []).length > 2 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const remaining = (q.choices || []).filter((c) => c.id !== choice.id);
                                            const nextCorrect = (q.correctChoiceIds || []).filter(
                                              (id) => id !== choice.id
                                            );
                                            handlePatchQuestion(
                                              q.id,
                                              normalizeQuestion({
                                                ...q,
                                                choices: remaining,
                                                correctChoiceIds:
                                                  nextCorrect.length > 0 ? nextCorrect : [remaining[0].id],
                                              })
                                            );
                                          }}
                                          className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                                          title="Delete option"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                              Approved Model Answer for Essay Question:
                            </label>
                            <textarea
                              rows={2}
                              value={q.correctAnswer}
                              onChange={(e) =>
                                handlePatchQuestion(q.id, {
                                  correctAnswer: e.target.value,
                                  explanation: e.target.value,
                                })
                              }
                              placeholder="Write the model answer and grading rubric..."
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                            Explanation (shown to student after submission):
                          </label>
                          <input
                            type="text"
                            value={q.explanation}
                            onChange={(e) => handlePatchQuestion(q.id, { explanation: e.target.value })}
                            placeholder="English explanation for the correct answer..."
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Explicit Save Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Note: All edits across all forms and settings are saved in Supabase, and temporary source images are cleaned up immediately upon saving.
            </span>
            <button
              type="button"
              onClick={() => void handleSaveAssessment()}
              disabled={isSaving || forms.every((f) => f.questions.length === 0)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-45 text-white font-extrabold text-xs shadow-lg cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{editingAssessmentId ? 'Save All Changes Now' : 'Publish Assessment Now'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Published Assessments List + Teacher Essay Grading + Grading Audit Log (NO Regrade Button!) */}
      <div className="bg-slate-50 dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            Published Assessments ({filteredPublishedExams.length})
          </h3>
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'exam', label: 'Exams' },
                { id: 'assignment', label: 'Assignments' },
                { id: 'sheet', label: 'Sheets' },
              ] as const
            ).map((fBtn) => (
              <button
                key={fBtn.id}
                type="button"
                onClick={() => setListFilterCategory(fBtn.id)}
                className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                  listFilterCategory === fBtn.id
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                }`}
              >
                {fBtn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {filteredPublishedExams.map((ex) => {
            const examSubs = allSubmissions.filter((s) => s.examId === ex.id);
            const pendingEssayCount = examSubs.filter((s) => s.essayGradingPending).length;
            const isGradingOpen = showGradingExamId === ex.id;
            const formsCount = ex.forms?.length || 1;

            return (
              <div key={ex.id} className="py-3.5 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                        {ex.title}
                      </span>
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                        {ex.category === 'exam' ? 'Exam' : ex.category === 'assignment' ? 'Assignment' : 'Sheet'}
                      </span>
                      {formsCount > 1 && (
                        <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
                          · {formsCount} forms
                        </span>
                      )}
                      {pendingEssayCount > 0 && (
                        <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          · {pendingEssayCount} pending essay grading
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                      {ex.grade} · {ex.questions.length} questions · Duration:{' '}
                      {formatDurationArabic(ex.durationMinutes, ex.durationUnit)} · Resume window:{' '}
                      {formatDurationArabic(
                        ex.resumeWindowMinutes ||
                          (ex.maxCompletionHours ? Math.round(ex.maxCompletionHours * 60) : undefined),
                        ex.resumeWindowUnit
                      )}{' '}
                      · Max attempts: {ex.maxAttempts ? ex.maxAttempts : 'Unlimited'} · {examSubs.length} submissions
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const nextOpen = isGradingOpen ? null : ex.id;
                        setShowGradingExamId(nextOpen);
                        if (nextOpen) {
                          void refreshFormStats(ex.id);
                        }
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                        isGradingOpen
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Grade Essays & Audit Log ({examSubs.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRequestLoadAssessment(ex)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-bold cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteExam(ex.id)}
                      className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 cursor-pointer"
                      title="Delete assessment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Essay Grading & Teacher-Only Grading Audit Log */}
                {isGradingOpen && (
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                        Student Submissions & Grading Audit Log — {ex.title}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowGradingExamId(null)}
                        className="text-slate-500 hover:text-slate-900 dark:hover:text-white text-xs cursor-pointer"
                      >
                        Close
                      </button>
                    </div>

                    {examSubs.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3 text-center">
                        No students have submitted this assessment yet.
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {examSubs.map((sub) => {
                          const isEditingThisSub = gradingSubmissionId === sub.id;
                          const matchedAtt = adminAttempts.find((a) => a.id === (sub.attemptId || sub.id));
                          const snapshotQs = normalizeQuestionsList(
                            matchedAtt?.questionsSnapshot && matchedAtt.questionsSnapshot.length > 0
                              ? matchedAtt.questionsSnapshot
                              : sub.questionsSnapshot && sub.questionsSnapshot.length > 0
                              ? sub.questionsSnapshot
                              : ex.questions
                          );
                          const essayQuestions = snapshotQs.filter((q) => q.type === 'essay');
                          const auditEntries = isEditingThisSub
                            ? buildTeacherAuditEntries(
                                snapshotQs,
                                sub.answers,
                                matchedAtt?.questionGrades || sub.questionGrades,
                                sub.autoZeroedQuestions
                              )
                            : [];

                          return (
                            <div
                              key={sub.id}
                              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <strong className="text-slate-900 dark:text-white">{sub.studentName}</strong>{' '}
                                  <span className="font-mono text-amber-600 dark:text-amber-400">
                                    ({sub.studentCode})
                                  </span>
                                  {(sub.formName || matchedAtt?.formName) && (
                                    <span className="ml-2 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                                      · {sub.formName || matchedAtt?.formName}
                                    </span>
                                  )}
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                                    Score: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{sub.score} / {sub.totalPoints || ex.totalPoints}</strong>
                                    {' · '}
                                    {sub.essayGradingPending ? 'Pending Essay Grading' : 'Graded & Approved'}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditingThisSub
                                      ? setGradingSubmissionId(null)
                                      : handleStartGradingSubmission(ex, sub)
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] cursor-pointer"
                                >
                                  {isEditingThisSub ? 'Hide' : 'Audit Log & Grade Essays'}
                                </button>
                              </div>

                              {isEditingThisSub && (
                                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                                  {/* Teacher-Only Compact Grading Audit Log */}
                                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                                        <tr>
                                          <th className="py-1.5 px-2.5">Question</th>
                                          <th className="py-1.5 px-2.5">Student Answer</th>
                                          <th className="py-1.5 px-2.5">Stored Correct Answer</th>
                                          <th className="py-1.5 px-2.5">Result</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                        {auditEntries.map((row, aIdx) => (
                                          <tr key={row.questionId}>
                                            <td className="py-1.5 px-2.5 font-semibold text-slate-800 dark:text-slate-200 max-w-[180px] truncate">
                                              Q{aIdx + 1}: {row.questionText}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">
                                              {row.studentAnswerDisplay}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-emerald-700 dark:text-emerald-400">
                                              {row.storedCorrectDisplay}
                                            </td>
                                            <td className="py-1.5 px-2.5 font-mono font-bold tabular-nums">
                                              {row.isPendingEssay ? (
                                                <span className="text-amber-600">Pending Review</span>
                                              ) : (
                                                <span
                                                  className={
                                                    row.isCorrect ? 'text-emerald-600' : 'text-rose-600'
                                                  }
                                                >
                                                  {row.awardedPoints} / {row.maxPoints}
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  {essayQuestions.length > 0 && (
                                    <div className="space-y-2">
                                      {essayQuestions.map((eq, eIdx) => {
                                        const ans = (sub.answers[eq.id] || '').trim();
                                        const isAutoZeroed =
                                          !ans || sub.autoZeroedQuestions?.includes(eq.id);
                                        return (
                                          <div
                                            key={eq.id}
                                            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="font-bold text-slate-900 dark:text-white">
                                                Essay {eIdx + 1}: {eq.question}
                                              </span>
                                              <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400 shrink-0">
                                                Max: {eq.points}
                                              </span>
                                            </div>
                                            <p className="text-[11px] text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-200 dark:border-slate-800 whitespace-pre-wrap">
                                              {ans || '<Student left answer blank — auto-scored 0>'}
                                            </p>
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] text-slate-500">
                                                Model: {eq.explanation || eq.correctAnswer}
                                              </span>
                                              <div className="flex items-center gap-1.5 shrink-0">
                                                <label className="text-[11px] font-bold">Score:</label>
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max={eq.points}
                                                  step="0.5"
                                                  disabled={isAutoZeroed}
                                                  value={essayDraftScores[eq.id] ?? '0'}
                                                  onChange={(e) =>
                                                    setEssayDraftScores((prev) => ({
                                                      ...prev,
                                                      [eq.id]: e.target.value,
                                                    }))
                                                  }
                                                  className="w-16 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold"
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}

                                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                        <input
                                          type="text"
                                          value={essayDraftFeedback}
                                          onChange={(e) => setEssayDraftFeedback(e.target.value)}
                                          placeholder="Miss Asmaa's notes for the student (optional)..."
                                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => void handleSaveEssayGrades(ex, sub)}
                                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 cursor-pointer"
                                        >
                                          Save & Approve Final Score ✓
                                        </button>
                                      </div>
                                    </div>
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
