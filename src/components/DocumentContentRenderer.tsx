/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AlertCircle, Download, Loader2, Lock, RefreshCw } from 'lucide-react';
import { ChemistryDocument } from '../types';
import {
  fetchDocumentPayload,
  resolveDrivePreviewInfo,
} from '../lib/documentLoader';
import { useLanguage } from '../lib/translations';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPageMeta {
  pageNumber: number;
  width: number;
  height: number;
}

interface DocumentContentRendererProps {
  document: ChemistryDocument;
  rawUrl: string;
  reloadSeq: number;
  zoomPercent: number;
  bottomPaddingClass?: string;
  canDownload?: boolean;
  onRetry: () => void;
  onTriggerDownload?: () => void;
  onStatusChange?: (status: { loading: boolean; error: string | null; mode: 'drive' | 'pdf' | 'image' | 'office' }) => void;
  onPageInfoChange?: (info: { currentPage: number; numPages: number }) => void;
  onBlobLoaded?: (blob: Blob | null) => void;
}

export const DocumentContentRenderer: React.FC<DocumentContentRendererProps> = ({
  document: doc,
  rawUrl,
  reloadSeq,
  zoomPercent,
  bottomPaddingClass = 'pb-4',
  canDownload = false,
  onRetry,
  onTriggerDownload,
  onStatusChange,
  onPageInfoChange,
  onBlobLoaded,
}) => {
  const { t } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageContainerRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const activeRenderTasksRef = useRef<Record<number, pdfjsLib.RenderTask | null>>({});
  const renderedScaleByPageRef = useRef<Record<number, string>>({});
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const driveInfo = useMemo(
    () => resolveDrivePreviewInfo(rawUrl, doc.external_id),
    [rawUrl, doc.external_id]
  );

  const [mode, setMode] = useState<'drive' | 'pdf' | 'image' | 'office'>(
    driveInfo ? 'drive' : 'pdf'
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pagesMeta, setPagesMeta] = useState<PdfPageMeta[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [imageObjectUrl, setImageObjectUrl] = useState<string>('');
  const [officeEmbedUrl, setOfficeEmbedUrl] = useState<string>('');

  const revokeActiveObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        // Ignore
      }
      objectUrlRef.current = null;
    }
  }, []);

  const cancelAllRenderTasks = useCallback(() => {
    Object.values(activeRenderTasksRef.current).forEach((task) => {
      try {
        task?.cancel();
      } catch {
        // Ignore
      }
    });
    activeRenderTasksRef.current = {};
  }, []);

  useEffect(() => {
    onStatusChange?.({ loading: isLoading, error: loadError, mode });
  }, [isLoading, loadError, mode, onStatusChange]);

  useEffect(() => {
    onPageInfoChange?.({ currentPage, numPages });
  }, [currentPage, numPages, onPageInfoChange]);

  // Render a single PDF page onto crisp HiDPI canvas using ONLY embedded PDF fonts + CMaps
  const renderSinglePage = useCallback(
    async (pageNumber: number, targetZoom: number) => {
      const pdf = pdfDocRef.current;
      const canvas = canvasRefs.current[pageNumber];
      const scrollEl = scrollContainerRef.current;
      if (!pdf || !canvas || !scrollEl) return;

      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 3);
      const containerWidth = Math.max(scrollEl.clientWidth || window.innerWidth, 320);
      const targetCssWidth = Math.max(containerWidth * (targetZoom / 100), 280);
      const renderKey = `${Math.round(targetCssWidth)}:${dpr.toFixed(2)}`;

      if (renderedScaleByPageRef.current[pageNumber] === renderKey) {
        return;
      }

      // Cancel any in-flight render on the same canvas so renders never overlap
      if (activeRenderTasksRef.current[pageNumber]) {
        try {
          activeRenderTasksRef.current[pageNumber]?.cancel();
        } catch {
          // Ignore
        }
        activeRenderTasksRef.current[pageNumber] = null;
      }

      try {
        const page = await pdf.getPage(pageNumber);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const cssScale = targetCssWidth / unscaledViewport.width;
        const cssViewport = page.getViewport({ scale: cssScale });

        // Clamp backing pixel scale on ultra-tall pages to avoid mobile canvas memory limits
        const maxSide = 4096;
        const safeDpr = Math.min(
          dpr,
          maxSide / Math.max(cssViewport.width, 1),
          maxSide / Math.max(cssViewport.height, 1)
        );
        const outputScale = Math.max(safeDpr, 1);

        canvas.width = Math.max(1, Math.floor(cssViewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(cssViewport.height * outputScale));

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        // Pure crisp white background before PDF draws
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        const renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport: cssViewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
          background: '#ffffff',
        });

        activeRenderTasksRef.current[pageNumber] = renderTask;
        await renderTask.promise;

        if (activeRenderTasksRef.current[pageNumber] === renderTask) {
          activeRenderTasksRef.current[pageNumber] = null;
          renderedScaleByPageRef.current[pageNumber] = renderKey;
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`PDF page ${pageNumber} render warning:`, err);
        }
      }
    },
    []
  );

  // Load Drive iframe OR fetch Supabase/Device Blob and initialize pdf.js / Image / Office
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    cancelAllRenderTasks();
    renderedScaleByPageRef.current = {};
    setPagesMeta([]);
    setNumPages(0);
    setCurrentPage(1);
    setImageObjectUrl('');
    setOfficeEmbedUrl('');
    setLoadError(null);
    onBlobLoaded?.(null);

    const cleanupPdf = async () => {
      if (pdfDocRef.current) {
        try {
          await (pdfDocRef.current as unknown as { destroy?: () => Promise<void> }).destroy?.();
        } catch {
          // Ignore
        }
        pdfDocRef.current = null;
      }
    };

    if (!rawUrl && !driveInfo) {
      setMode('pdf');
      setLoadError(t.lib.docNoFileAttached);
      setIsLoading(false);
      return;
    }

    if (driveInfo) {
      revokeActiveObjectUrl();
      void cleanupPdf();
      setMode('drive');
      setIsLoading(true);
      // Safety fallback if Drive iframe doesn't trigger onLoad quickly on slower networks
      const loadTimer = window.setTimeout(() => {
        if (!cancelled) setIsLoading(false);
      }, 4500);
      return () => {
        cancelled = true;
        window.clearTimeout(loadTimer);
      };
    }

    const loadNonDriveDocument = async () => {
      setIsLoading(true);
      revokeActiveObjectUrl();
      await cleanupPdf();

      try {
        const payload = await fetchDocumentPayload(rawUrl, abortController.signal);
        if (cancelled) {
          URL.revokeObjectURL(payload.objectUrl);
          return;
        }

        objectUrlRef.current = payload.objectUrl;
        onBlobLoaded?.(payload.blob);

        if (payload.kind === 'image') {
          setMode('image');
          setImageObjectUrl(payload.objectUrl);
          setIsLoading(false);
          return;
        }

        if (payload.kind === 'office') {
          setMode('office');
          setOfficeEmbedUrl(
            payload.officePublicUrl
              ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
                  payload.officePublicUrl
                )}`
              : ''
          );
          setIsLoading(false);
          return;
        }

        // PDF via pdf.js with CMap + StandardFonts + Embedded FontFace enabled (fixes Arabic glyph stacking)
        setMode('pdf');
        const bytes = payload.bytes || new Uint8Array(await payload.blob.arrayBuffer());

        const loadingTask = pdfjsLib.getDocument({
          data: bytes,
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
          iccUrl: '/pdfjs/iccs/',
          wasmUrl: '/pdfjs/wasm/',
          disableFontFace: false,
          useSystemFonts: true,
          useWorkerFetch: true,
        });

        const pdf = await loadingTask.promise;
        if (cancelled) {
          await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
          return;
        }

        pdfDocRef.current = pdf;
        const count = pdf.numPages || 1;
        setNumPages(count);

        // Collect proportional dimensions for every page so lazy canvas slots match exact aspect ratios
        const metas: PdfPageMeta[] = [];
        for (let i = 1; i <= count; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          metas.push({ pageNumber: i, width: vp.width, height: vp.height });
        }

        if (cancelled) return;
        setPagesMeta(metas);
        setIsLoading(false);
      } catch (err: any) {
        if (cancelled || err?.name === 'AbortError') return;
        setLoadError(
          err?.message || t.documents.viewerLoadError
        );
        setIsLoading(false);
      }
    };

    void loadNonDriveDocument();

    return () => {
      cancelled = true;
      abortController.abort();
      cancelAllRenderTasks();
      revokeActiveObjectUrl();
      void cleanupPdf();
    };
  }, [rawUrl, driveInfo, reloadSeq, cancelAllRenderTasks, revokeActiveObjectUrl, onBlobLoaded, t]);

  // Lazy-render visible PDF pages + track active page number
  useEffect(() => {
    if (mode !== 'pdf' || pagesMeta.length === 0) return;

    // Immediately render first 2 pages for instant display
    void renderSinglePage(1, zoomPercent);
    if (pagesMeta.length > 1) {
      void renderSinglePage(2, zoomPercent);
    }

    const scrollRoot = scrollContainerRef.current;
    if (!scrollRoot) return;

    const renderObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pg = Number(entry.target.getAttribute('data-page-number'));
            if (pg) void renderSinglePage(pg, zoomPercent);
          }
        });
      },
      {
        root: scrollRoot,
        rootMargin: '900px 0px',
        threshold: 0.01,
      }
    );

    const activePageObserver = new IntersectionObserver(
      (entries) => {
        let bestPage = 0;
        let bestRatio = 0;
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestPage = Number(entry.target.getAttribute('data-page-number')) || 0;
          }
        });
        if (bestPage > 0) {
          setCurrentPage(bestPage);
        }
      },
      {
        root: scrollRoot,
        threshold: [0.15, 0.45, 0.75],
      }
    );

    pagesMeta.forEach(({ pageNumber }) => {
      const el = pageContainerRefs.current[pageNumber];
      if (el) {
        renderObserver.observe(el);
        activePageObserver.observe(el);
      }
    });

    return () => {
      renderObserver.disconnect();
      activePageObserver.disconnect();
    };
  }, [mode, pagesMeta, zoomPercent, renderSinglePage]);

  // Re-render nearby pages smoothly on viewport / orientation resize (360px/390px/768px/1280px)
  useEffect(() => {
    if (mode !== 'pdf' || pagesMeta.length === 0) return;
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    let timer: number | null = null;
    const scheduleRerender = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        renderedScaleByPageRef.current = {};
        const start = Math.max(1, currentPage - 1);
        const end = Math.min(pagesMeta.length, currentPage + 2);
        for (let p = start; p <= end; p++) {
          void renderSinglePage(p, zoomPercent);
        }
      }, 120);
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleRerender);
      ro.observe(scrollEl);
    }
    window.addEventListener('resize', scheduleRerender);
    window.addEventListener('orientationchange', scheduleRerender);

    return () => {
      if (timer) window.clearTimeout(timer);
      ro?.disconnect();
      window.removeEventListener('resize', scheduleRerender);
      window.removeEventListener('orientationchange', scheduleRerender);
    };
  }, [mode, pagesMeta.length, currentPage, zoomPercent, renderSinglePage]);

  // Google Drive Iframe View (strictly /file/d/FILE_ID/preview + transparent popout shield + white canvas)
  if (mode === 'drive' && driveInfo) {
    return (
      <div className="relative w-full h-full bg-white overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center p-6 gap-3">
            <Loader2 className="w-9 h-9 text-amber-500 animate-spin" />
            <p className="text-xs sm:text-sm font-bold text-slate-700">
              {t.documents.readerLoading}
            </p>
          </div>
        )}

        {loadError ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-white p-6 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-600 flex items-center justify-center">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h3 className="text-base font-extrabold text-slate-900">{t.documents.unableDisplayTitle}</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{loadError}</p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2 shadow cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t.common.retry}</span>
            </button>
          </div>
        ) : (
          <>
            <iframe
              key={`${driveInfo.driveId}-${reloadSeq}`}
              src={driveInfo.previewUrl}
              title={doc.title || t.documents.documentViewerTitle}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setLoadError(t.documents.viewerConnectError);
              }}
              allow="fullscreen"
              allowFullScreen
              referrerPolicy="no-referrer"
              className="w-full h-full border-0 block bg-white"
            />
            {/* Transparent shields covering Google Drive's built-in "open in new window" corner icon in both LTR & RTL */}
            <div
              aria-hidden="true"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              className="absolute top-0 right-0 w-20 h-16 z-20 bg-transparent pointer-events-auto"
            />
            <div
              aria-hidden="true"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              className="absolute top-0 left-0 w-20 h-16 z-20 bg-transparent pointer-events-auto"
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
      className="w-full h-full bg-white overflow-y-auto overflow-x-auto m-0 p-0"
    >
      {isLoading && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-white p-6 text-center gap-3">
          <Loader2 className="w-9 h-9 text-amber-500 animate-spin" />
          <p className="text-xs sm:text-sm font-bold text-slate-700">
            {t.documents.preparingHighRes}
          </p>
        </div>
      )}

      {!isLoading && loadError && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-white p-6 text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-600 flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-base font-extrabold text-slate-900">{t.documents.unableDisplayTitle}</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2 shadow cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t.common.retry}</span>
          </button>
        </div>
      )}

      {!isLoading && !loadError && mode === 'pdf' && pagesMeta.length > 0 && (
        <div
          style={{ width: `${zoomPercent}%`, minWidth: '100%' }}
          className={`m-0 p-0 bg-white ${bottomPaddingClass}`}
        >
          {pagesMeta.map((page) => (
            <div
              key={page.pageNumber}
              ref={(el) => {
                pageContainerRefs.current[page.pageNumber] = el;
              }}
              data-page-number={page.pageNumber}
              style={{ aspectRatio: `${page.width} / ${page.height}` }}
              className="w-full bg-white m-0 p-0 border-b border-slate-200/80 last:border-b-0 overflow-hidden"
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current[page.pageNumber] = el;
                }}
                className="block w-full h-auto m-0 p-0 bg-white"
              />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !loadError && mode === 'image' && imageObjectUrl && (
        <div
          style={{ width: `${zoomPercent}%`, minWidth: '100%' }}
          className={`m-0 p-0 bg-white ${bottomPaddingClass}`}
        >
          <img
            src={imageObjectUrl}
            alt={doc.title}
            onError={() =>
              setLoadError(t.documents.imageDisplayError)
            }
            className="block w-full h-auto m-0 p-0 bg-white"
          />
        </div>
      )}

      {!isLoading && !loadError && mode === 'office' && (
        officeEmbedUrl ? (
          <iframe
            src={officeEmbedUrl}
            title={doc.title}
            onError={() =>
              setLoadError(t.documents.officeLaunchError)
            }
            className="w-full h-full border-0 block bg-white"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-white p-6 text-center gap-4">
            <p className="text-sm font-bold text-slate-800 max-w-md">
              {t.documents.officeLocalUnsupported}
            </p>
            {canDownload && onTriggerDownload ? (
              <button
                type="button"
                onClick={onTriggerDownload}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center gap-2 shadow cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{t.documents.downloadToViewBtn}</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-500/15 px-4 py-2 rounded-xl border border-amber-500/30">
                <Lock className="w-4 h-4" />
                <span>{t.documents.downloadSubscribersOnlyTitle}</span>
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
};
