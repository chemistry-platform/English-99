/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Play,
  FileText,
  CheckSquare,
  GraduationCap,
  Globe,
  Clock,
  Calendar,
  BookOpen,
  Info,
  Sliders,
  AlignLeft,
  Layers,
  Lock,
  LayoutList,
  Radio,
} from 'lucide-react';
import {
  CourseLecture,
  CourseLesson,
  LessonSubSection,
  SectionContentItem,
  ChemistryDocument,
  ExamOrAssignment,
  ExamSubmission,
  UserProfile,
} from '../types';
import { getCourseLessons, getCourseCover, getSectionItems } from '../lib/courseHelpers';
import { formatCourseDurationHHMMSS } from '../lib/formatDuration';
import { InlineVideoViewer } from './course/InlineVideoViewer';
import { InlineDocumentViewer } from './course/InlineDocumentViewer';
import { InlineExamViewer } from './course/InlineExamViewer';
import { formatTemplate, getGradeDisplayLabel, useLanguage } from '../lib/translations';

export interface CourseActiveSelection {
  lessonId: string;
  sectionId: string;
  itemId?: string;
}

interface CourseDetailViewProps {
  course: CourseLecture;
  currentUser: UserProfile | null;
  documents: ChemistryDocument[];
  exams: ExamOrAssignment[];
  completedLectures?: string[];
  initialSelection?: CourseActiveSelection | null;
  onSelectionChange?: (selection: CourseActiveSelection | null) => void;
  onBack: () => void;
  onMarkLectureCompleted?: (lectureId: string) => void;
  onExamSubmitted?: (submission: ExamSubmission) => void;
  onPlaySectionVideo?: (course: CourseLecture, section: LessonSubSection, lesson: CourseLesson) => void;
  onOpenSectionPdf?: (section: LessonSubSection, matchedDoc?: ChemistryDocument) => void;
  onOpenSectionAssessment?: (section: LessonSubSection, matchedExam?: ExamOrAssignment) => void;
  onEditCourseInAdmin?: (course: CourseLecture) => void;
  onRequestSubscribe?: (course: CourseLecture) => void;
  onOpenAuth?: () => void;
}

export const CourseDetailView: React.FC<CourseDetailViewProps> = ({
  course,
  currentUser,
  documents,
  exams,
  completedLectures = [],
  initialSelection = null,
  onSelectionChange,
  onBack,
  onMarkLectureCompleted,
  onExamSubmitted,
  onEditCourseInAdmin,
  onRequestSubscribe,
  onOpenAuth,
}) => {
  const { t } = useLanguage();
  const lessons = getCourseLessons(course);

  const [openLessonIds, setOpenLessonIds] = useState<Record<string, boolean>>(() =>
    initialSelection?.lessonId ? { [initialSelection.lessonId]: true } : {}
  );
  const [activeSelection, setActiveSelection] = useState<CourseActiveSelection | null>(
    initialSelection
  );
  const [imgFailed, setImgFailed] = useState(false);

  const workspaceTopRef = useRef<HTMLDivElement>(null);

  // Sync when selected course changes (restoring initialSelection if valid)
  useEffect(() => {
    setImgFailed(false);
    if (
      initialSelection &&
      lessons.some(
        (l) =>
          l.id === initialSelection.lessonId &&
          (l.sections || []).some((s) => s.id === initialSelection.sectionId)
      )
    ) {
      setOpenLessonIds({ [initialSelection.lessonId]: true });
      setActiveSelection(initialSelection);
    } else {
      setOpenLessonIds({});
      setActiveSelection(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);

  // Also restore once lessons hydrate from Supabase on refresh
  useEffect(() => {
    if (
      !activeSelection &&
      initialSelection &&
      lessons.some(
        (l) =>
          l.id === initialSelection.lessonId &&
          (l.sections || []).some((s) => s.id === initialSelection.sectionId)
      )
    ) {
      setOpenLessonIds((prev) => ({ ...prev, [initialSelection.lessonId]: true }));
      setActiveSelection(initialSelection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelection?.lessonId, initialSelection?.sectionId, initialSelection?.itemId, lessons.length]);

  const updateActiveSelection = (next: CourseActiveSelection | null) => {
    setActiveSelection(next);
    onSelectionChange?.(next);
  };

  const isAdminOrSecretary = currentUser?.role === 'admin' || currentUser?.role === 'secretary';
  const isEnrolled = Boolean(
    currentUser &&
      (isAdminOrSecretary || (currentUser.enrolledCourses || []).includes(course.id))
  );
  const coverSrc = getCourseCover(course);

  const toggleLesson = (id: string) => {
    setOpenLessonIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getContentVisuals = (contentType: LessonSubSection['contentType']) => {
    switch (contentType) {
      case 'video':
        return {
          icon: Play,
          typeLabel: t.courses.typeVideoLecture,
          actionLabel: t.courses.actionPlayVideo,
          accentClass: 'bg-blue-600 hover:bg-blue-500 text-white',
          iconWrapClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
        };
      case 'pdf':
        return {
          icon: FileText,
          typeLabel: t.courses.typeFileStudyNotes,
          actionLabel: t.courses.actionOpenFile,
          accentClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
          iconWrapClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        };
      case 'assignment':
        return {
          icon: CheckSquare,
          typeLabel: t.courses.typeHomework,
          actionLabel: t.courses.actionOpenHomework,
          accentClass: 'bg-amber-500 hover:bg-amber-400 text-slate-950',
          iconWrapClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        };
      case 'exam':
        return {
          icon: GraduationCap,
          typeLabel: t.courses.typeExam,
          actionLabel: t.courses.actionOpenExam,
          accentClass: 'bg-amber-500 hover:bg-amber-400 text-slate-950',
          iconWrapClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        };
      case 'text':
        return {
          icon: AlignLeft,
          typeLabel: t.courses.typeTextContent,
          actionLabel: t.courses.actionReadText,
          accentClass: 'bg-slate-800 hover:bg-slate-700 text-white dark:bg-slate-700 dark:hover:bg-slate-600',
          iconWrapClass: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
        };
      default:
        return {
          icon: Globe,
          typeLabel: t.courses.typeLink,
          actionLabel: t.courses.actionOpenLink,
          accentClass: 'bg-slate-800 hover:bg-slate-700 text-white dark:bg-slate-700 dark:hover:bg-slate-600',
          iconWrapClass: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
        };
    }
  };

  const handleOpenSectionInline = (
    lesson: CourseLesson,
    section: LessonSubSection,
    item?: SectionContentItem
  ) => {
    if (!currentUser) {
      onOpenAuth?.();
      return;
    }

    if (!isEnrolled) {
      onRequestSubscribe?.(course);
      return;
    }

    const sectionItems = getSectionItems(section);
    const targetItem = item || sectionItems[0];
    const targetItemId = targetItem?.id;

    const wasClosed = !activeSelection;
    setOpenLessonIds((prev) => ({ ...prev, [lesson.id]: true }));
    updateActiveSelection({ lessonId: lesson.id, sectionId: section.id, itemId: targetItemId });

    if (wasClosed || (typeof window !== 'undefined' && window.innerWidth < 1024)) {
      window.requestAnimationFrame(() => {
        workspaceTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  // Resolve currently active lesson, section & specific item when split layout is open
  const activeLesson = activeSelection
    ? lessons.find((l) => l.id === activeSelection.lessonId) || null
    : null;
  const activeSection =
    activeLesson && activeSelection
      ? (activeLesson.sections || []).find((s) => s.id === activeSelection.sectionId) || null
      : null;
  const activeSectionItems = activeSection ? getSectionItems(activeSection) : [];
  const activeItem =
    activeSection && activeSelection
      ? activeSectionItems.find((it) => it.id === activeSelection.itemId) ||
        activeSectionItems[0] ||
        null
      : null;

  const renderActiveViewer = () => {
    if (!activeLesson || !activeSection) return null;

    const effectiveType = activeItem?.contentType || activeSection.contentType;
    const effectiveTitle =
      activeItem && activeItem.title && activeItem.title !== activeSection.title
        ? `${activeSection.title} — ${activeItem.title}`
        : activeSection.title;
    const effectiveDesc =
      activeItem?.description ||
      activeSection.description ||
      activeLesson.description ||
      course.description;
    const effectiveVideoUrl = (activeItem?.videoUrl || activeSection.videoUrl || course.videoUrl || '').trim();
    const effectiveFileUrl = (activeItem?.fileUrl || activeSection.fileUrl || '').trim();
    const effectiveDocId = activeItem?.documentId || activeSection.documentId;
    const effectiveExamId = activeItem?.examId || activeSection.examId;
    const effectiveInlineQuestions = activeItem?.inlineQuestions || activeSection.inlineQuestions;
    const effectiveText = activeItem?.textContent ?? activeSection.textContent ?? '';
    const effectiveKey = activeItem?.id || activeSection.id;

    if (effectiveType === 'video') {
      const resolvedSource: CourseLecture['videoSource'] = effectiveVideoUrl.includes('drive.')
        ? 'drive'
        : effectiveVideoUrl.includes('youtube.') || effectiveVideoUrl.includes('youtu.be')
        ? 'youtube'
        : course.videoSource;

      return (
        <InlineVideoViewer
          key={effectiveKey}
          lectureId={course.id}
          sectionId={effectiveKey}
          title={`${activeLesson.title} — ${effectiveTitle}`}
          chapter={course.chapter}
          description={effectiveDesc}
          videoUrl={effectiveVideoUrl}
          videoSource={resolvedSource}
          durationMinutes={activeItem?.durationMinutes || activeSection.durationMinutes || course.durationMinutes}
          durationSeconds={activeItem?.durationSeconds ?? activeSection.durationSeconds ?? course.durationSeconds}
          isCompleted={completedLectures.includes(course.id)}
          onMarkCompleted={(id) => onMarkLectureCompleted?.(id)}
        />
      );
    }

    if (effectiveType === 'pdf') {
      const matchedDoc = effectiveDocId
        ? documents.find((d) => d.id === effectiveDocId) || null
        : null;

      return (
        <InlineDocumentViewer
          key={effectiveKey}
          sectionId={effectiveKey}
          document={matchedDoc}
          fallbackUrl={effectiveFileUrl}
          title={effectiveTitle}
          currentUser={currentUser}
          courses={[course]}
          courseId={course.id}
        />
      );
    }

    if (effectiveType === 'assignment' || effectiveType === 'exam') {
      const matchedExam = effectiveExamId
        ? exams.find((ex) => ex.id === effectiveExamId)
        : undefined;

      const resolvedExam: ExamOrAssignment | undefined =
        matchedExam ||
        (effectiveInlineQuestions && effectiveInlineQuestions.length > 0
          ? {
              id: effectiveExamId || `inline-${effectiveKey}`,
              title: effectiveTitle,
              category: effectiveType === 'assignment' ? 'assignment' : 'exam',
              grade: course.grade,
              durationMinutes: 45,
              totalPoints: effectiveInlineQuestions.reduce((acc, q) => acc + (Number(q.points) || 2), 0),
              deadline: t.courses.availableImmediately,
              questions: effectiveInlineQuestions,
              createdAt: course.createdAt,
            }
          : undefined);

      if (resolvedExam) {
        return (
          <InlineExamViewer
            key={resolvedExam.id}
            exam={resolvedExam}
            currentUser={currentUser}
            onSubmitted={(sub) => onExamSubmitted?.(sub)}
            onExitView={() => updateActiveSelection(null)}
          />
        );
      }

      if (effectiveFileUrl) {
        return (
          <InlineDocumentViewer
            key={effectiveKey}
            sectionId={effectiveKey}
            document={null}
            fallbackUrl={effectiveFileUrl}
            title={effectiveTitle}
            currentUser={currentUser}
            courses={[course]}
            courseId={course.id}
          />
        );
      }

      return (
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
            {effectiveType === 'assignment' ? (
              <CheckSquare className="w-6 h-6" />
            ) : (
              <GraduationCap className="w-6 h-6" />
            )}
          </div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
            {effectiveTitle}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {t.courses.noLinkedAssessmentDesc}
          </p>
        </div>
      );
    }

    if (effectiveType === 'text') {
      return (
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlignLeft className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block">
                {activeLesson.title}
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                {effectiveTitle}
              </h3>
            </div>
          </div>
          <div className="text-sm sm:text-[15px] text-slate-800 dark:text-slate-200 leading-8 whitespace-pre-wrap break-words">
            {effectiveText || effectiveDesc || t.courses.noTextContentYet}
          </div>
        </div>
      );
    }

    const extraUrl = effectiveFileUrl || effectiveVideoUrl;
    return (
      <InlineDocumentViewer
        key={effectiveKey}
        sectionId={effectiveKey}
        document={null}
        fallbackUrl={extraUrl}
        title={effectiveTitle}
        currentUser={currentUser}
        courses={[course]}
        courseId={course.id}
      />
    );
  };

  return (
    <div ref={workspaceTopRef} className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-[14px] sm:text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-amber-500/50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-amber-500 rtl:rotate-180" />
            <span>{t.courses.detailBack}</span>
          </button>

          {activeSelection && (
            <button
              type="button"
              onClick={() => updateActiveSelection(null)}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-[14px] sm:text-xs font-bold text-amber-800 dark:text-amber-300 transition-colors cursor-pointer"
            >
              <LayoutList className="w-4 h-4" />
              <span>{t.courses.showAllLectures}</span>
            </button>
          )}
        </div>

        {isAdminOrSecretary && onEditCourseInAdmin && (
          <button
            type="button"
            onClick={() => onEditCourseInAdmin(course)}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[14px] sm:text-xs shadow-sm transition-colors cursor-pointer"
          >
            <Sliders className="w-4 h-4" />
            <span>{t.courses.manageLessonsAdmin}</span>
          </button>
        )}
      </div>

      {/* Course Overview Banner (shown prominently when browsing lectures in center) */}
      {!activeSelection && (
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 items-stretch">
            <div className="md:col-span-5 relative min-h-[200px] sm:min-h-[260px] bg-slate-900 overflow-hidden">
              {!imgFailed ? (
                <img
                  src={coverSrc}
                  alt={course.title}
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-amber-400">
                  <BookOpen className="w-12 h-12 mb-3" />
                  <span className="text-sm font-bold text-center text-white">{course.title}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute bottom-4 start-4 end-4 flex items-center justify-between text-xs text-slate-100">
                <span className="font-bold">
                  {course.isFree
                    ? t.courses.freeCourseBadge
                    : formatTemplate(t.courses.detailSubFeeInline, { price: course.price })}
                </span>
                <span className="font-mono tabular-nums" dir="ltr">
                  {formatCourseDurationHHMMSS(course)}
                </span>
              </div>
            </div>

            <div className="md:col-span-7 p-5 sm:p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{course.chapter}</span>
                  <span aria-hidden="true">·</span>
                  <span>{getGradeDisplayLabel(course.grade, t)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                    <span>{lessons.length} {t.courses.lecturesWord}</span>
                  </span>
                </div>

                <h2 className="text-[20px] sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-snug">
                  {course.title}
                </h2>

                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {t.courses.detailSyllabusHeading}
                  </h3>
                  <p className="text-[14px] sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {course.description}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                {course.scheduleText && (
                  <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>{t.courses.detailSchedule}: {course.scheduleText}</span>
                  </div>
                )}

                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-slate-800 dark:text-amber-100 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                      {t.courses.detailInstructionsHeading}
                    </span>
                    <p className="leading-relaxed">
                      {course.instructions?.trim() || t.courses.detailDefaultInstructions}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Read-only preview banner when not enrolled */}
      {!isEnrolled && (
        <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                {t.courses.readingPreviewTitle}
              </h4>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                {t.courses.readingPreviewDesc}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => (!currentUser ? onOpenAuth?.() : onRequestSubscribe?.(course))}
            className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>
              {!currentUser
                ? t.courses.signInToSubscribe
                : course.isFree
                ? t.courses.enrollFreeToEnter
                : formatTemplate(t.courses.subscribeNowPrice, { price: course.price })}
            </span>
          </button>
        </div>
      )}

      {/* WORKSPACE VIEW SWITCH: Centered All-Lectures List OR Split Center-Viewer + Right-Sidebar */}
      {!activeSelection ? (
        /* INITIAL VIEW: Single centered vertical column of lectures with expandable chevron arrows */
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {formatTemplate(t.courses.courseLecturesCount, { count: lessons.length })}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.courses.expandHint}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {lessons.map((lesson, idx) => {
              const isExpanded = Boolean(openLessonIds[lesson.id]);
              const sections = lesson.sections || [];

              return (
                <div
                  key={lesson.id}
                  className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-colors shadow-sm"
                >
                  {/* Lecture Row with Chevron Toggle */}
                  <button
                    type="button"
                    onClick={() => toggleLesson(lesson.id)}
                    aria-expanded={isExpanded}
                    className="w-full min-h-[64px] px-4 sm:px-5 py-4 flex items-center justify-between gap-3 text-start hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 font-mono tabular-nums text-sm font-black flex items-center justify-center shrink-0">
                        {(idx + 1).toString().padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                          {lesson.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {lesson.description && (
                            <>
                              <span className="truncate max-w-md">{lesson.description}</span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span className="tabular-nums font-medium">{sections.length} {t.courses.sectionsWord}</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {/* Sub-sections dropdown under the lecture */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30">
                      {sections.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                          {t.courses.noSectionsAddedYet}
                        </div>
                      ) : (
                        sections.map((section) => {
                          const sectionItems = getSectionItems(section);
                          const visuals = getContentVisuals(section.contentType);
                          const SectionIcon = visuals.icon;
                          const linkedDoc = section.documentId
                            ? documents.find((d) => d.id === section.documentId)
                            : undefined;
                          const linkedExam = section.examId
                            ? exams.find((ex) => ex.id === section.examId)
                            : undefined;

                          if (sectionItems.length > 1) {
                            return (
                              <div key={section.id} className="px-4 sm:px-5 py-4 space-y-2.5">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${visuals.iconWrapClass}`}
                                  >
                                    <SectionIcon className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <h5 className="text-[15px] sm:text-sm font-bold text-slate-900 dark:text-white break-words">
                                      {section.title}
                                    </h5>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {formatTemplate(t.courses.itemsInsideSection, { count: sectionItems.length })}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-2 ps-3 border-s-2 border-amber-500/30">
                                  {sectionItems.map((item) => {
                                    const iv = getContentVisuals(item.contentType || section.contentType);
                                    const ItemIcon = iv.icon;
                                    return (
                                      <div
                                        key={item.id}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div
                                            className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${iv.iconWrapClass}`}
                                          >
                                            <ItemIcon className="w-3.5 h-3.5" />
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                              {item.title}
                                            </p>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                              {iv.typeLabel}
                                              {(item.contentType || section.contentType) === 'video'
                                                ? ` · ${formatCourseDurationHHMMSS(item)}`
                                                : ''}
                                            </p>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => handleOpenSectionInline(lesson, section, item)}
                                          className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                                            isEnrolled
                                              ? iv.accentClass
                                              : 'bg-amber-500/15 hover:bg-amber-500 text-amber-800 dark:text-amber-300 hover:text-slate-950 border border-amber-500/40'
                                          }`}
                                        >
                                          {isEnrolled ? (
                                            <ItemIcon className="w-3.5 h-3.5" />
                                          ) : (
                                            <Lock className="w-3.5 h-3.5" />
                                          )}
                                          <span>
                                            {isEnrolled
                                              ? iv.actionLabel
                                              : !currentUser
                                              ? t.courses.signInFirst
                                              : t.courses.subscribeToUnlock}
                                          </span>
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={section.id}
                              className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white dark:hover:bg-slate-900/50 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${visuals.iconWrapClass}`}
                                >
                                  <SectionIcon className="w-4 h-4" />
                                </div>

                                <div className="min-w-0">
                                  <h5 className="text-[15px] sm:text-sm font-bold text-slate-900 dark:text-white break-words">
                                    {section.title}
                                  </h5>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    <span>{visuals.typeLabel}</span>
                                    {section.contentType === 'video' ? (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                                          <Clock className="w-3 h-3" />
                                          {formatCourseDurationHHMMSS(section)}
                                        </span>
                                      </>
                                    ) : null}
                                    {linkedDoc && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="truncate max-w-[200px] sm:max-w-xs">
                                          {linkedDoc.title}
                                        </span>
                                      </>
                                    )}
                                    {linkedExam && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="truncate max-w-[200px] sm:max-w-xs">
                                          {linkedExam.title}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleOpenSectionInline(lesson, section)}
                                className={`min-h-[44px] px-4 py-2 rounded-xl text-[14px] sm:text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                                  isEnrolled
                                    ? visuals.accentClass
                                    : 'bg-amber-500/15 hover:bg-amber-500 text-amber-800 dark:text-amber-300 hover:text-slate-950 border border-amber-500/40'
                                }`}
                              >
                                {isEnrolled ? (
                                  <SectionIcon className="w-4 h-4" />
                                ) : (
                                  <Lock className="w-4 h-4" />
                                )}
                                <span>
                                  {isEnrolled
                                    ? visuals.actionLabel
                                    : !currentUser
                                    ? t.courses.signInFirst
                                    : t.courses.subscribeToUnlock}
                                </span>
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ACTIVE WORKSPACE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* ZONE 1: Main Active Content Stage */}
          <div className="lg:col-span-8 xl:col-span-9 min-w-0 w-full">
            {renderActiveViewer()}
          </div>

          {/* ZONE 2: Lectures & Sections Navigation List */}
          <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-6 min-w-0 w-full bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-4 py-3.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  {t.courses.courseContentsTitle}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {course.title}
                </p>
              </div>
              <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 font-mono text-[11px] font-bold shrink-0">
                {lessons.length} {t.courses.lecturesWord}
              </span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 lg:max-h-[75dvh] lg:overflow-y-auto">
              {lessons.map((lesson, idx) => {
                const isExpanded = Boolean(openLessonIds[lesson.id]);
                const sections = lesson.sections || [];
                const containsActive = lesson.id === activeSelection.lessonId;

                return (
                  <div key={lesson.id}>
                    <button
                      type="button"
                      onClick={() => toggleLesson(lesson.id)}
                      aria-expanded={isExpanded}
                      className={`w-full min-h-[52px] px-3.5 py-3 flex items-center justify-between gap-2.5 text-start transition-colors cursor-pointer ${
                        containsActive
                          ? 'bg-amber-500/10'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-lg font-mono tabular-nums text-xs font-black flex items-center justify-center shrink-0 ${
                            containsActive
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-white truncate">
                            {lesson.title}
                          </h4>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {sections.length} {t.courses.sectionsWord}
                          </span>
                        </div>
                      </div>

                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="bg-slate-50/70 dark:bg-slate-950/40 px-2.5 py-2 space-y-1.5 border-t border-slate-200/80 dark:border-slate-800/80">
                        {sections.length === 0 ? (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 p-2 text-center">
                            {t.courses.noSectionsYet}
                          </p>
                        ) : (
                          sections.map((section) => {
                            const sectionItems = getSectionItems(section);
                            const visuals = getContentVisuals(section.contentType);
                            const SectionIcon = visuals.icon;
                            const isSectionActive =
                              activeSelection.lessonId === lesson.id &&
                              activeSelection.sectionId === section.id;

                            if (sectionItems.length > 1) {
                              return (
                                <div key={section.id} className="space-y-1">
                                  <div className="px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                    <SectionIcon className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span className="truncate">{section.title}</span>
                                  </div>
                                  {sectionItems.map((item) => {
                                    const iv = getContentVisuals(item.contentType || section.contentType);
                                    const ItemIcon = iv.icon;
                                    const isActive =
                                      isSectionActive &&
                                      (activeSelection.itemId === item.id ||
                                        (!activeSelection.itemId && item === sectionItems[0]));
                                    return (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => handleOpenSectionInline(lesson, section, item)}
                                        aria-current={isActive ? 'true' : undefined}
                                        className={`w-full min-h-[44px] p-2 rounded-xl border text-start flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                          isActive
                                            ? 'bg-amber-500/15 border-amber-500 text-slate-950 dark:text-white shadow-sm'
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500/40 text-slate-700 dark:text-slate-300'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <div
                                            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                                              isActive
                                                ? 'bg-amber-500 text-slate-950 border-amber-600'
                                                : iv.iconWrapClass
                                            }`}
                                          >
                                            <ItemIcon className="w-3.5 h-3.5" />
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-[11px] font-bold truncate">{item.title}</p>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                              {iv.typeLabel}
                                            </p>
                                          </div>
                                        </div>
                                        {isActive && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black shrink-0">
                                            <Radio className="w-3 h-3" />
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            }

                            return (
                              <button
                                key={section.id}
                                type="button"
                                onClick={() => handleOpenSectionInline(lesson, section)}
                                aria-current={isSectionActive ? 'true' : undefined}
                                className={`w-full min-h-[46px] p-2.5 rounded-xl border text-start flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                  isSectionActive
                                    ? 'bg-amber-500/15 border-amber-500 text-slate-950 dark:text-white shadow-sm'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500/40 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                                      isSectionActive
                                        ? 'bg-amber-500 text-slate-950 border-amber-600'
                                        : visuals.iconWrapClass
                                    }`}
                                  >
                                    <SectionIcon className="w-3.5 h-3.5" />
                                  </div>

                                  <div className="min-w-0">
                                    <p className="text-xs font-bold leading-snug truncate">
                                      {section.title}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                      {visuals.typeLabel}
                                      {section.contentType === 'video'
                                        ? ` · ${formatCourseDurationHHMMSS(section)}`
                                        : ''}
                                    </p>
                                  </div>
                                </div>

                                {isSectionActive && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black shrink-0">
                                    <Radio className="w-3 h-3" />
                                    <span>{t.courses.playingBadge}</span>
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
