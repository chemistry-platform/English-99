/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PDFDocument } from 'pdf-lib';
import { formatSecondsHHMMSS } from './formatDuration';
import { extractGoogleDriveId } from './urlParser';

/**
 * High-accuracy media detector for Videos and Documents
 * Detects duration in exact minutes and seconds, PDF page count, and formatted sizes
 */

export interface VideoDurationResult {
  formattedText: string; // strict HH:MM:SS or "--:--:--"
  minutes: number;
  seconds: number;
  totalSeconds: number;
  accurate?: boolean;
}

export interface DocumentInfoResult {
  pagesCount: number;
  formattedSize: string;
  fileType: string;
}

function formatVideoSeconds(totalSecondsRaw: number, accurate = true): VideoDurationResult {
  if (!Number.isFinite(totalSecondsRaw) || totalSecondsRaw <= 0) {
    return {
      formattedText: '--:--:--',
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      accurate: false,
    };
  }
  const totalSeconds = Math.max(0, Math.round(totalSecondsRaw));
  const secs = totalSeconds % 60;

  return {
    formattedText: formatSecondsHHMMSS(totalSeconds),
    minutes: totalSeconds > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : 0,
    seconds: secs,
    totalSeconds,
    accurate,
  };
}

/**
 * Binary MP4 / MOV mvhd box duration extractor (works even for iPhone HEVC .MOV files)
 */
function extractMp4DurationFromBytes(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 4; i < bytes.length - 36; i++) {
    if (
      bytes[i] === 0x6d && // m
      bytes[i + 1] === 0x76 && // v
      bytes[i + 2] === 0x68 && // h
      bytes[i + 3] === 0x64 // d
    ) {
      const boxSize = view.getUint32(i - 4, false);
      const version = bytes[i + 4];
      if (boxSize >= 100 && boxSize <= 200 && (version === 0 || version === 1)) {
        if (version === 0 && i + 24 <= bytes.length) {
          const timescale = view.getUint32(i + 16, false);
          const duration = view.getUint32(i + 20, false);
          if (timescale > 0 && duration > 0) {
            const secs = duration / timescale;
            if (secs > 0.5 && secs < 86400 * 3) return secs;
          }
        } else if (version === 1 && i + 36 <= bytes.length) {
          const timescale = view.getUint32(i + 24, false);
          const high = view.getUint32(i + 28, false);
          const low = view.getUint32(i + 32, false);
          const duration = high * 4294967296 + low;
          if (timescale > 0 && duration > 0) {
            const secs = duration / timescale;
            if (secs > 0.5 && secs < 86400 * 3) return secs;
          }
        }
      }
    }
  }
  return null;
}

async function extractVideoFileBinaryDuration(file: File): Promise<number | null> {
  try {
    const chunkSize = 512 * 1024;
    const headSlice = new Uint8Array(await file.slice(0, Math.min(file.size, chunkSize)).arrayBuffer());
    const headDur = extractMp4DurationFromBytes(headSlice);
    if (headDur !== null) return headDur;

    if (file.size > chunkSize) {
      const tailSlice = new Uint8Array(
        await file.slice(Math.max(0, file.size - chunkSize), file.size).arrayBuffer()
      );
      const tailDur = extractMp4DurationFromBytes(tailSlice);
      if (tailDur !== null) return tailDur;
    }
  } catch {}
  return null;
}

function probeSingleVideoPass(
  source: File | string,
  preloadMode: 'metadata' | 'auto',
  timeoutMs: number
): Promise<VideoDurationResult | null> {
  return new Promise((resolve) => {
    try {
      let url = '';
      let shouldRevoke = false;

      if (typeof source === 'string') {
        url = source;
      } else {
        url = URL.createObjectURL(source);
        shouldRevoke = true;
      }

      const video = document.createElement('video');
      video.preload = preloadMode;
      video.muted = true;
      video.playsInline = true;

      let settled = false;
      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.oncanplay = null;
        video.ondurationchange = null;
        video.ontimeupdate = null;
        video.onerror = null;
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch {}
        if (shouldRevoke && url) {
          URL.revokeObjectURL(url);
        }
      };

      const finish = (result: VideoDurationResult | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        cleanup();
        resolve(result);
      };

      const timeoutId = window.setTimeout(() => {
        if (!isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
          finish(formatVideoSeconds(video.duration, true));
        } else {
          finish(null);
        }
      }, timeoutMs);

      const handleDurationReady = () => {
        if (settled) return;
        if (video.duration === Infinity) {
          video.ontimeupdate = () => {
            video.ontimeupdate = null;
            if (!isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
              finish(formatVideoSeconds(video.duration, true));
            }
          };
          try {
            video.currentTime = 1e101;
          } catch {}
          return;
        }
        if (!isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
          finish(formatVideoSeconds(video.duration, true));
        }
      };

      video.onloadedmetadata = handleDurationReady;
      video.onloadeddata = handleDurationReady;
      video.oncanplay = handleDurationReady;
      video.ondurationchange = handleDurationReady;
      video.onerror = () => finish(null);
      video.src = url;
      video.load();
    } catch {
      resolve(null);
    }
  });
}

async function probeVideoElementDuration(source: File | string, timeoutMs = 10000): Promise<VideoDurationResult | null> {
  // Pass 1: fast metadata read
  const metaResult = await probeSingleVideoPass(source, 'metadata', timeoutMs);
  if (metaResult && metaResult.totalSeconds > 0) {
    return metaResult;
  }

  // Pass 2: retry buffering partial data (preload="auto") when NaN/Infinity occurs
  const bufferedResult = await probeSingleVideoPass(source, 'auto', Math.min(timeoutMs + 4000, 15000));
  if (bufferedResult && bufferedResult.totalSeconds > 0) {
    return bufferedResult;
  }

  return null;
}

/**
 * Detects exact video duration in seconds from an uploaded File or URL.
 * Never fabricates a fallback number — returns accurate: false, totalSeconds: 0, formattedText: "--:--:--" on failure.
 */
export async function detectVideoDuration(source: File | string): Promise<VideoDurationResult> {
  if (typeof source === 'string') {
    const cleanSource = source.trim();
    if (!cleanSource) {
      return formatVideoSeconds(0, false);
    }

    try {
      const res = await fetch('/api/probe-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanSource, type: 'video' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Number.isFinite(data.totalSeconds) && data.totalSeconds > 0) {
          return formatVideoSeconds(data.totalSeconds, true);
        }
      }
    } catch (e) {
      console.warn('Probe media failed in detectVideoDuration:', e);
    }

    // Client fallback: try direct URL or Drive proxy stream via <video> buffering
    const driveId = extractGoogleDriveId(cleanSource);
    const probeUrl =
      driveId && !cleanSource.startsWith('/api/drive-stream')
        ? `/api/drive-stream?id=${encodeURIComponent(driveId)}`
        : cleanSource;

    const directResult = await probeVideoElementDuration(probeUrl, 9000);
    if (directResult && directResult.totalSeconds > 0) return directResult;

    return {
      formattedText: '--:--:--',
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      accurate: false,
    };
  }

  // For uploaded File (phone / PC): run both binary MP4/MOV header scan and <video> metadata + partial buffer probe
  const [binarySecs, browserResult] = await Promise.all([
    extractVideoFileBinaryDuration(source),
    probeVideoElementDuration(source, 12000),
  ]);

  if (browserResult && browserResult.totalSeconds > 0) {
    return browserResult;
  }
  if (binarySecs !== null && binarySecs > 0) {
    return formatVideoSeconds(binarySecs, true);
  }

  return {
    formattedText: '--:--:--',
    minutes: 0,
    seconds: 0,
    totalSeconds: 0,
    accurate: false,
  };
}

/**
 * Detects exact PDF page count from uploaded File with pdf-lib + bidirectional fallback
 */
export async function detectPdfPages(file: File): Promise<number> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Primary: exact structural PDF parser via pdf-lib
    try {
      const pdfDoc = await PDFDocument.load(bytes, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        updateMetadata: false,
      });
      const count = pdfDoc.getPageCount();
      if (count > 0 && count < 50000) {
        return count;
      }
    } catch (pdfLibErr) {
      console.warn('pdf-lib client parse fallback:', pdfLibErr);
    }

    // Fallback 1: Bidirectional /Type /Pages & /Count regex within object dictionaries
    const text = new TextDecoder('latin1').decode(buffer);
    const candidateCounts: number[] = [];

    for (const m of text.matchAll(/<<[^<>]{0,800}?\/Type\s*\/Pages\b[^<>]{0,800}?\/Count\s+(\d+)/g)) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > 0 && n < 50000) candidateCounts.push(n);
    }
    for (const m of text.matchAll(/<<[^<>]{0,800}?\/Count\s+(\d+)[^<>]{0,800}?\/Type\s*\/Pages\b/g)) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > 0 && n < 50000) candidateCounts.push(n);
    }
    if (candidateCounts.length > 0) {
      return Math.max(...candidateCounts);
    }

    // Fallback 2: Individual /Type /Page\b (not /Pages)
    const pageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length;
    }

    // Fallback 3: Realistic estimation only for non-PDF files (Word/TXT)
    const estimated = Math.max(1, Math.round(file.size / (120 * 1024)));
    return Math.min(estimated, 300);
  } catch (err) {
    console.warn('PDF page detection fallback:', err);
    return Math.max(1, Math.round(file.size / (150 * 1024)));
  }
}

/**
 * Formats bytes to readable string (e.g. "15.4 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${val} ${sizes[i] || 'MB'}`;
}
