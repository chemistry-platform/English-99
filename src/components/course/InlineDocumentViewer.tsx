/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Download,
  Maximize2,
  Loader2,
  Lock,
} from 'lucide-react';
import { ChemistryDocument, CourseLecture, UserProfile } from '../../types';
import { canDownloadDocument } from '../../lib/formatDuration';
import { triggerDocumentBlobDownload } from '../../lib/documentLoader';
import { requestCrossBrowserFullscreen } from '../../lib/fullscreen';
import { getDocTypeDisplayLabel, useLanguage } from '../../lib/translations';
import { FullscreenDocumentReader } from '../FullscreenDocumentReader';

interface InlineDocumentViewerProps {
  sectionId: string;
  document: ChemistryDocument | null;
  fallbackUrl?: string;
  title: string;
  currentUser?: UserProfile | null;
  courses?: CourseLecture[];
  courseId?: string;
}

export const InlineDocumentViewer: React.FC<InlineDocumentViewerProps> = ({
  sectionId,
  document: doc,
  fallbackUrl,
  title,
  currentUser,
  courses = [],
  courseId,
}) => {
  const { t } = useLanguage();
  const rawUrl = (doc?.fileUrl || doc?.original_url || fallbackUrl || '').trim();

  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [subNotice, setSubNotice] = useState(false);

  // Never open file automatically when switching sections — always return to prompt screen
  useEffect(() => {
    setIsFullscreenOpen(false);
    setSubNotice(false);
    setDownloadError(null);
  }, [sectionId, rawUrl]);

  const canDownload = useMemo(
    () => canDownloadDocument(currentUser, doc, courses, courseId),
    [currentUser, doc, courses, courseId]
  );

  const syntheticDocument: ChemistryDocument | null = useMemo(() => {
    if (doc) return doc;
    if (!rawUrl) return null;
    return {
      id: `inline-doc-${sectionId}`,
      title: title || t.documents.studyMaterialDefault,
      docType: 'Study Notes',
      grade: 'All',
      fileUrl: rawUrl,
      fileSize: 'PDF',
      pagesCount: 1,
      downloadsCount: 0,
      createdAt: new Date().toISOString(),
    };
  }, [doc, rawUrl, sectionId, title, t]);

  const handleOpenFullscreen = useCallback(() => {
    void requestCrossBrowserFullscreen(window.document.documentElement);
    setIsFullscreenOpen(true);
  }, []);

  const handleDownloadClick = useCallback(async () => {
    if (!syntheticDocument) return;
    if (!canDownload) {
      setSubNotice(true);
      return;
    }
    setDownloadError(null);
    setIsDownloading(true);
    try {
      await triggerDocumentBlobDownload({
        doc: syntheticDocument,
        fallbackUrl,
      });
    } catch (err: any) {
      setDownloadError(err?.message || t.documents.unableDownloadNow);
      window.setTimeout(() => setDownloadError(null), 4000);
    } finally {
      setIsDownloading(false);
    }
  }, [syntheticDocument, canDownload, fallbackUrl, t]);

  if (!rawUrl || !syntheticDocument) {
    return (
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-3 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t.documents.noSectionFileAttached}
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        onContextMenu={(e) => e.preventDefault()}
        className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm flex flex-col select-none"
      >
        {/* Top File Header */}
        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2.5 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                {doc?.title || title}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {doc
                  ? `${getDocTypeDisplayLabel(doc.docType, t)} · ${doc.pagesCount} ${t.common.pages} · ${doc.fileSize}`
                  : t.documents.attachedStudyFile}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canDownload ? (
              <button
                type="button"
                onClick={() => void handleDownloadClick()}
                disabled={isDownloading}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 disabled:opacity-60 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title={t.documents.downloadFileTitle}
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{t.common.download}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSubNotice(true)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-amber-600 dark:text-amber-400 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title={t.documents.subscribersOnlyNotice}
              >
                <Lock className="w-4 h-4" />
                <span>{t.common.download}</span>
              </button>
            )}
          </div>
        </div>

        {(subNotice || downloadError) && (
          <div className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>{downloadError || t.documents.subscribersOnlyNotice}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setSubNotice(false);
                setDownloadError(null);
              }}
              className="px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[11px] cursor-pointer"
            >
              {t.common.close}
            </button>
          </div>
        )}

        {/* Center Prompt Stage (Shown in Video Slot on Mobile, Tablet & Desktop) */}
        <div className="relative w-full aspect-video min-h-[290px] sm:min-h-[380px] bg-gradient-to-br from-slate-100 via-white to-slate-50 dark:from-[#0B1120] dark:via-[#0F172A] dark:to-[#111827] flex flex-col items-center justify-center p-6 sm:p-10 text-center gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-lg">
            <FileText className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>

          <div className="space-y-2 max-w-lg">
            <p className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 dark:text-white leading-relaxed">
              {t.documents.clickPrefix}{' '}
              <button
                type="button"
                onClick={handleOpenFullscreen}
                className="text-amber-600 dark:text-amber-400 underline decoration-2 underline-offset-4 hover:text-amber-500 dark:hover:text-amber-300 focus:outline-none cursor-pointer"
              >
                {t.documents.clickHereWord}
              </button>{' '}
              {t.documents.clickSuffixOpen}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
              {doc?.title || title}
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenFullscreen}
            className="min-h-[52px] px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm sm:text-base shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2.5 transition-transform active:scale-95 cursor-pointer"
          >
            <Maximize2 className="w-5 h-5 shrink-0" />
            <span>{t.documents.openFileBtn}</span>
          </button>
        </div>
      </div>

      {/* Edge-to-Edge Fullscreen Overlay (100dvw x 100dvh, closed cleanly back to this same screen) */}
      {isFullscreenOpen && (
        <FullscreenDocumentReader
          document={syntheticDocument}
          currentUser={currentUser}
          courses={courses}
          courseId={courseId}
          onClose={() => setIsFullscreenOpen(false)}
        />
      )}
    </>
  );
};
