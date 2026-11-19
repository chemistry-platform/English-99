/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChemistryDocument, CourseLecture, UserProfile } from '../types';
import { FullscreenDocumentReader } from './FullscreenDocumentReader';

interface InBrowserPdfViewerProps {
  document: ChemistryDocument | null;
  currentUser?: UserProfile | null;
  courses?: CourseLecture[];
  courseId?: string;
  onClose: () => void;
}

export const InBrowserPdfViewer: React.FC<InBrowserPdfViewerProps> = ({
  document,
  currentUser,
  courses,
  courseId,
  onClose,
}) => {
  if (!document || !currentUser) return null;

  return (
    <FullscreenDocumentReader
      document={document}
      currentUser={currentUser}
      courses={courses}
      courseId={courseId}
      onClose={onClose}
    />
  );
};
