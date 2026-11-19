/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Download, Lock, Loader2 } from 'lucide-react';
import { ChemistryDocument, CourseLecture, UserProfile } from '../types';
import { canDownloadDocument } from '../lib/formatDuration';
import { triggerDocumentBlobDownload } from '../lib/documentLoader';
import {
  requestCrossBrowserFullscreen,
  exitCrossBrowserFullscreen,
} from '../lib/fullscreen';
import { DocumentContentRenderer } from './DocumentContentRenderer';
import { useLanguage } from '../lib/translations';

interface FullscreenDocumentReaderProps {
  document: ChemistryDocument | null;
  currentUser?: UserProfile | null;
  courses?: CourseLecture[];
  courseId?: string;
  onClose: () => void;
}

const MIN_ZOOM = 75;
const MAX_ZOOM = 250;
const ZOOM_STEP = 25;

export const FullscreenDocumentReader: React.FC<FullscreenDocumentReaderProps> = ({
  document: doc,
  currentUser,
  courses = [],
  courseId,
  onClose,
}) => {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const savedScrollYRef = useRef<number>(0);
  const closedRef = useRef<boolean>(false);
  const pushedHistoryRef = useRef<boolean>(false);
  const loadedBlobRef = useRef<Blob | null>(null);

  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [reloadSeq, setReloadSeq] = useState<number>(0);
  const [pageInfo, setPageInfo] = useState<{ currentPage: number; numPages: number }>({
    currentPage: 1,
    numPages: 0,
  });
  const [renderStatus, setRenderStatus] = useState<{
    loading: boolean;
    error: string | null;
    mode: 'drive' | 'pdf' | 'image' | 'office';
  }>({
    loading: true,
    error: null,
    mode: 'pdf',
  });
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [subNotice, setSubNotice] = useState<boolean>(false);

  const isSubscribed = useMemo(
    () => canDownloadDocument(currentUser, doc, courses, courseId),
    [doc, currentUser, courses, courseId]
  );

  const performClose = useCallback(
    (fromPopState = false) => {
      if (closedRef.current) return;
      closedRef.current = true;

      void exitCrossBrowserFullscreen();

      const restoreY = savedScrollYRef.current;
      window.document.body.style.overflow = '';
      window.document.documentElement.style.overflow = '';

      if (!fromPopState && pushedHistoryRef.current) {
        try {
          if (window.history.state?.modal === 'amr-doc-fullscreen') {
            window.history.back();
          }
        } catch {
          // Ignore
        }
      }

      onClose();

      window.requestAnimationFrame(() => {
        window.scrollTo(0, restoreY);
      });
    },
    [onClose]
  );

  // Save scroll position, lock page body scroll, attempt Fullscreen API, listen to Back (popstate) & Esc
  useEffect(() => {
    if (!doc) return;
    closedRef.current = false;
    savedScrollYRef.current = window.scrollY;

    const prevBodyOverflow = window.document.body.style.overflow;
    const prevHtmlOverflow = window.document.documentElement.style.overflow;
    window.document.body.style.overflow = 'hidden';
    window.document.documentElement.style.overflow = 'hidden';

    void requestCrossBrowserFullscreen(rootRef.current || window.document.documentElement);

    try {
      window.history.pushState(
        { ...(window.history.state || {}), modal: 'amr-doc-fullscreen' },
        ''
      );
      pushedHistoryRef.current = true;
    } catch {
      pushedHistoryRef.current = false;
    }

    const handlePopState = () => {
      if (!closedRef.current) {
        pushedHistoryRef.current = false;
        performClose(true);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        performClose(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      window.document.body.style.overflow = prevBodyOverflow;
      window.document.documentElement.style.overflow = prevHtmlOverflow;
      void exitCrossBrowserFullscreen();
    };
  }, [doc?.id, performClose]);

  const handleDownloadClick = useCallback(async () => {
    if (!doc) return;
    if (!isSubscribed) {
      setSubNotice(true);
      return;
    }
    setDownloadError(null);
    setIsDownloading(true);
    try {
      await triggerDocumentBlobDownload({
        doc,
        cachedBlob: loadedBlobRef.current,
      });
    } catch (err: any) {
      setDownloadError(err?.message || t.documents.unableDownloadNow);
      window.setTimeout(() => setDownloadError(null), 4000);
    } finally {
      setIsDownloading(false);
    }
  }, [doc, isSubscribed, t]);

  const handleBlobLoaded = useCallback((blob: Blob | null) => {
    loadedBlobRef.current = blob;
  }, []);

  if (!doc) return null;

  const rawFileUrl = (doc.fileUrl || doc.original_url || '').trim();
  const showToolbar = !renderStatus.loading && !renderStatus.error;
  const showZoomControls = renderStatus.mode === 'pdf' || renderStatus.mode === 'image';
  const showPageCount = renderStatus.mode === 'pdf' && pageInfo.numPages > 0;

  return (
    <div
      ref={rootRef}
      dir="ltr"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-[9999] w-[100dvw] h-[100dvh] bg-white overflow-hidden select-none"
    >
      {/* Fixed Close Button (>= 44x44px) above all content & iframe shields */}
      <button
        type="button"
        onClick={() => performClose(false)}
        aria-label={t.documents.closeViewerAria}
        title={t.documents.closeEscTitle}
        className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-[10020] min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white shadow-xl border border-white/30 backdrop-blur-md flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Pure White Edge-to-Edge Document Content */}
      <div className="w-full h-full bg-white m-0 p-0">
        <DocumentContentRenderer
          document={doc}
          rawUrl={rawFileUrl}
          reloadSeq={reloadSeq}
          zoomPercent={zoomPercent}
          bottomPaddingClass="pb-20"
          canDownload={isSubscribed}
          onRetry={() => setReloadSeq((s) => s + 1)}
          onTriggerDownload={() => void handleDownloadClick()}
          onStatusChange={setRenderStatus}
          onPageInfoChange={setPageInfo}
          onBlobLoaded={handleBlobLoaded}
        />
      </div>

      {/* Subscription or Download Feedback Toast */}
      {(subNotice || downloadError) && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[10020] max-w-[92dvw] px-4 py-2 rounded-2xl bg-slate-900/90 text-amber-300 text-xs font-bold shadow-xl border border-amber-500/30 flex items-center gap-2 backdrop-blur-md">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>{downloadError || t.documents.subscribersOnlyNotice}</span>
          <button
            type="button"
            onClick={() => {
              setSubNotice(false);
              setDownloadError(null);
            }}
            className="px-2 py-0.5 rounded bg-white/10 text-white cursor-pointer"
          >
            {t.common.close}
          </button>
        </div>
      )}

      {/* Lightweight Translucent Bottom Toolbar (doesn't overlap text thanks to pb-20 bottom clearance) */}
      {showToolbar && (
        <div
          dir="ltr"
          className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[10015] flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900/75 text-white shadow-xl border border-white/20 backdrop-blur-md max-w-[96dvw]"
        >
          {showPageCount && (
            <span className="px-2.5 text-xs font-mono font-bold tabular-nums whitespace-nowrap border-r border-white/15">
              {pageInfo.currentPage} / {pageInfo.numPages}
            </span>
          )}

          {showZoomControls && (
            <>
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
                disabled={zoomPercent <= MIN_ZOOM}
                aria-label={t.documents.readerZoomOut}
                title={t.documents.readerZoomOut}
                className="min-w-[44px] min-h-[40px] px-2 rounded-full hover:bg-white/15 disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setZoomPercent(100)}
                title={t.documents.defaultZoomTitle}
                className="min-h-[40px] px-2 rounded-full hover:bg-white/15 text-xs font-mono font-bold tabular-nums cursor-pointer"
              >
                {zoomPercent}%
              </button>

              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
                disabled={zoomPercent >= MAX_ZOOM}
                aria-label={t.documents.readerZoomIn}
                title={t.documents.readerZoomIn}
                className="min-w-[44px] min-h-[40px] px-2 rounded-full hover:bg-white/15 disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </>
          )}

          {isSubscribed ? (
            <button
              type="button"
              onClick={() => void handleDownloadClick()}
              disabled={isDownloading}
              title={t.documents.downloadFileTitle}
              className="min-w-[44px] min-h-[40px] px-3 rounded-full bg-emerald-500/25 hover:bg-emerald-500/40 disabled:opacity-60 text-emerald-200 border border-emerald-400/35 flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {t.common.download}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSubNotice(true)}
              title={t.documents.downloadSubscribersOnlyTitle}
              className="min-w-[44px] min-h-[40px] px-2.5 rounded-full hover:bg-white/15 text-amber-300 flex items-center justify-center cursor-pointer"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
