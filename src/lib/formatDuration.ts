/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChemistryDocument,
  CourseLecture,
  LessonSubSection,
  SectionContentItem,
  UserProfile,
} from '../types';

/**
 * Formats seconds into strict HH:MM:SS (e.g. 45 -> 00:00:45, 185 -> 00:03:05, 4329 -> 01:12:09).
 * Returns '--:--:--' when seconds are missing, zero, NaN, or Infinity.
 */
export function formatSecondsHHMMSS(seconds?: number | null): string {
  if (
    seconds === undefined ||
    seconds === null ||
    typeof seconds !== 'number' ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return '--:--:--';
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Resolves the exact duration in seconds from stored item fields.
 * Prefers durationSeconds when available; falls back to durationMinutes * 60 only if positive.
 */
export function resolveDurationSeconds(item?: {
  durationSeconds?: number | null;
  durationMinutes?: number | null;
} | null): number {
  if (!item) return 0;
  const sec = Number(item.durationSeconds);
  if (Number.isFinite(sec) && sec > 0) {
    return Math.round(sec);
  }
  const mins = Number(item.durationMinutes);
  if (Number.isFinite(mins) && mins > 0) {
    return Math.round(mins * 60);
  }
  return 0;
}

/**
 * Formats a course, lesson section, or content item duration as HH:MM:SS or '--:--:--'.
 */
export function formatCourseDurationHHMMSS(item?: {
  durationSeconds?: number | null;
  durationMinutes?: number | null;
} | null): string {
  return formatSecondsHHMMSS(resolveDurationSeconds(item));
}

function sectionContainsDocument(section: LessonSubSection, doc: ChemistryDocument): boolean {
  if (section.documentId && section.documentId === doc.id) return true;
  if (section.fileUrl && doc.fileUrl && section.fileUrl.trim() === doc.fileUrl.trim()) return true;
  if (Array.isArray(section.items)) {
    return section.items.some(
      (it: SectionContentItem) =>
        (it.documentId && it.documentId === doc.id) ||
        (it.fileUrl && doc.fileUrl && it.fileUrl.trim() === doc.fileUrl.trim())
    );
  }
  return false;
}

export function courseContainsDocument(course: CourseLecture, doc: ChemistryDocument): boolean {
  if (course.attachedPdfUrl && doc.fileUrl && course.attachedPdfUrl.trim() === doc.fileUrl.trim()) {
    return true;
  }
  if (course.attachedPdfUrl && course.attachedPdfUrl.trim() === doc.id) {
    return true;
  }
  const allLessons = [...(course.lessons || []), ...(course.draftLessons || [])];
  return allLessons.some((lesson) =>
    (lesson.sections || []).some((sec) => sectionContainsDocument(sec, doc))
  );
}

/**
 * Strictly enforces document download permission:
 * - Admin / Secretary: always allowed
 * - Student: ONLY if logged in AND either:
 *   1) Document ID is explicitly in user.grantedDocuments, OR
 *   2) User is enrolled in the specific course that owns/attaches this document
 *      (if contextCourseId is provided, must be enrolled in that exact course AND the doc belongs to it).
 */
export function canDownloadDocument(
  user: UserProfile | null | undefined,
  doc: ChemistryDocument | null | undefined,
  courses: CourseLecture[] = [],
  contextCourseId?: string
): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'secretary') return true;

  const enrolled = user.enrolledCourses || [];

  if (!doc) {
    return Boolean(contextCourseId && enrolled.includes(contextCourseId));
  }

  if (user.grantedDocuments && user.grantedDocuments.includes(doc.id)) {
    return true;
  }

  if (contextCourseId) {
    if (!enrolled.includes(contextCourseId)) return false;
    const targetCourse = courses.find((c) => c.id === contextCourseId);
    if (!targetCourse) return true;
    return courseContainsDocument(targetCourse, doc);
  }

  return courses.some((c) => enrolled.includes(c.id) && courseContainsDocument(c, doc));
}
