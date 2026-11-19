/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChemistryDocument,
  CourseLecture,
  CourseLesson,
  LessonSectionContentType,
  LessonSubSection,
  SectionContentItem,
} from '../types';
import { getTranslations } from './translations';

export const COURSE_COVER_IMAGES = [
  '/src/assets/images/chem_transition_elements_cover_1794567946561.jpg',
  '/src/assets/images/chem_organic_hydrocarbons_cover_1794567946655.jpg',
  '/src/assets/images/chem_analytical_titration_cover_1794567947084.jpg',
];

export const LESSON_CONTENT_TYPE_OPTIONS: {
  value: LessonSectionContentType;
  label: string;
}[] = [
  { value: 'video', label: 'Video' },
  { value: 'pdf', label: 'File' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'exam', label: 'Exam' },
  { value: 'link', label: 'Link' },
  { value: 'text', label: 'Text' },
];

export function normalizeGrade(raw?: string | null): string {
  const g = String(raw || '').trim();
  if (!g) return '3rd Secondary';
  if (g === 'الكل' || g.toLowerCase() === 'all') return 'All';
  if (g === 'الصف الثالث الثانوي' || g === '3rd Secondary') return '3rd Secondary';
  if (g === 'الصف الثاني الثانوي' || g === '2nd Secondary') return '2nd Secondary';
  if (g === 'الصف الأول الثانوي' || g === '1st Secondary') return '1st Secondary';
  return g;
}

export function normalizeDocType(raw?: string | null): ChemistryDocument['docType'] {
  const t = String(raw || '').trim();
  if (t === 'شيت أسئلة' || t === 'Question Sheet') return 'Question Sheet';
  if (t === 'ملخص قوانين ومفاهيم' || t === 'Grammar & Rules Summary') return 'Grammar & Rules Summary';
  if (t === 'مراجعة نهائية' || t === 'Final Revision') return 'Final Revision';
  return 'Study Notes';
}

export function makeSectionId(prefix = 'sec'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makeLessonId(): string {
  return `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makeItemId(prefix = 'item'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Returns ordinal label for publish destination checkboxes
 * e.g. 0 -> "Lesson 1 Contents", 1 -> "Lesson 2 Contents", etc.
 */
export function getLessonPublishDestinationLabel(index: number, title?: string): string {
  const t = getTranslations();
  const cleanTitle = (title || '').trim();
  const base = `${t.lib.lessonPrefix} ${index + 1} ${t.lib.lessonContentsSuffix}`;
  return cleanTitle ? `${base}: ${cleanTitle}` : base;
}

/**
 * Normalizes a section's content items:
 * - If `section.items` is defined and non-empty, returns sorted items
 * - Otherwise synthesizes the single legacy item represented by the section's own fields (only if configured)
 */
export function getSectionItems(section: LessonSubSection): SectionContentItem[] {
  if (Array.isArray(section.items) && section.items.length > 0) {
    return [...section.items].sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  const hasLegacyPayload = Boolean(
    (section.videoUrl && section.videoUrl.trim()) ||
      (section.fileUrl && section.fileUrl.trim()) ||
      (section.documentId && section.documentId.trim()) ||
      (section.examId && section.examId.trim()) ||
      (section.textContent && section.textContent.trim()) ||
      (section.inlineQuestions && section.inlineQuestions.length > 0)
  );

  if (!hasLegacyPayload) {
    return [];
  }

  return [
    {
      id: `${section.id}-item-1`,
      title: section.title,
      contentType: section.contentType,
      order: 1,
      videoUrl: section.videoUrl,
      fileUrl: section.fileUrl,
      examId: section.examId,
      documentId: section.documentId,
      textContent: section.textContent,
      description: section.description,
      durationMinutes: section.durationMinutes,
      durationSeconds: section.durationSeconds,
      pagesCount: section.pagesCount,
      inlineQuestions: section.inlineQuestions,
    },
  ];
}

export function getCourseLessons(course: CourseLecture): CourseLesson[] {
  if (Array.isArray(course.lessons)) {
    return [...course.lessons]
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((lesson) => ({
        ...lesson,
        sections: [...(lesson.sections || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
      }));
  }

  // Fallback ONLY for legacy flat courses that never had `lessons` array
  const t = getTranslations();
  const legacySections: LessonSubSection[] = [];
  if (course.videoUrl && course.videoUrl.trim()) {
    legacySections.push({
      id: makeSectionId('vid'),
      title: t.lib.lessonExplanationDefault,
      contentType: 'video',
      order: 1,
      videoUrl: course.videoUrl,
      durationMinutes: course.durationMinutes,
      durationSeconds: course.durationSeconds,
      description: course.description,
    });
  }
  if (course.attachedPdfUrl && course.attachedPdfUrl.trim()) {
    legacySections.push({
      id: makeSectionId('pdf'),
      title: t.lib.lessonNotesDefault,
      contentType: 'pdf',
      order: legacySections.length + 1,
      documentId:
        course.attachedPdfUrl.startsWith('http') || course.attachedPdfUrl.startsWith('blob:')
          ? undefined
          : course.attachedPdfUrl,
      fileUrl:
        course.attachedPdfUrl.startsWith('http') || course.attachedPdfUrl.startsWith('blob:')
          ? course.attachedPdfUrl
          : undefined,
    });
  }
  if (course.attachedExamId && course.attachedExamId.trim()) {
    legacySections.push({
      id: makeSectionId('exam'),
      title: t.lib.examDefaultTitle,
      contentType: 'exam',
      order: legacySections.length + 1,
      examId: course.attachedExamId,
    });
  }

  if (legacySections.length === 0) return [];

  return [
    {
      id: `default-lesson-${course.id}`,
      title: course.title || t.lib.lessonDefaultTitle,
      description: course.description || '',
      order: 1,
      sections: legacySections,
    },
  ];
}

export function getCourseCover(course: CourseLecture, fallbackIndex = 0): string {
  if (course.coverUrl && course.coverUrl.trim()) {
    return course.coverUrl;
  }
  const titleText = `${course.title} ${course.chapter}`.toLowerCase();
  if (titleText.includes('vocabulary') || titleText.includes('idiom') || titleText.includes('reading')) {
    return COURSE_COVER_IMAGES[1];
  }
  if (titleText.includes('writing') || titleText.includes('essay') || titleText.includes('comprehension') || titleText.includes('translation')) {
    return COURSE_COVER_IMAGES[2];
  }
  return COURSE_COVER_IMAGES[fallbackIndex % COURSE_COVER_IMAGES.length];
}
