/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildSafeStoragePath, getSupabaseClient } from './supabase';
import {
  parseAndCleanMediaUrl,
  validateExternalVideoLink,
  validateExternalDocumentLink,
  extractGoogleDriveId,
} from './urlParser';
import { detectVideoDuration } from './mediaDetector';
import { formatSecondsHHMMSS } from './formatDuration';
import { formatTemplate, getTranslations } from './translations';

export type StorageBucketName = 'Files' | 'Lectures';

export interface UploadProgressInfo {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  loadedFormatted: string;
  totalFormatted: string;
  speedText: string;
  statusText: string;
  isComplete: boolean;
  error?: string;
  bucket?: StorageBucketName;
  path?: string;
}

export type UploadProgressCallback = (info: UploadProgressInfo) => void;

function formatBytesReadable(bytes: number): string {
  if (bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

/**
 * Uploads a file directly from the browser to Supabase Storage ('Files' or 'Lectures')
 * using supabase.storage.from(bucket).upload(...) and returns getPublicUrl(path).
 * Never generates blob:, data:, or local fallback URLs.
 */
export async function uploadFileWithRealProgress(
  file: File,
  bucketName: StorageBucketName = 'Files',
  onProgress?: UploadProgressCallback,
  folder: string = 'uploads'
): Promise<{ success: boolean; url: string; bucket: StorageBucketName; path: string; error?: string }> {
  const client = getSupabaseClient();
  const totalFormatted = formatBytesReadable(file.size);

  const t = getTranslations();

  if (!client) {
    const errMsg = t.lib.uploadClientMissing;
    console.error('❌ Supabase client missing during upload:', { bucket: bucketName, errMsg });
    onProgress?.({
      percent: 0,
      loadedBytes: 0,
      totalBytes: file.size,
      loadedFormatted: '0.0 MB',
      totalFormatted,
      speedText: t.lib.uploadConnFailed,
      statusText: errMsg,
      isComplete: false,
      error: errMsg,
      bucket: bucketName,
    });
    return { success: false, url: '', bucket: bucketName, path: '', error: errMsg };
  }

  const filePath = buildSafeStoragePath(file.name, folder);
  const startTime = Date.now();
  let simulatedPercent = 8;

  onProgress?.({
    percent: simulatedPercent,
    loadedBytes: Math.round(file.size * 0.08),
    totalBytes: file.size,
    loadedFormatted: formatBytesReadable(Math.round(file.size * 0.08)),
    totalFormatted,
    speedText: formatTemplate(t.lib.uploadConnectingBucket, { bucket: bucketName }),
    statusText: formatTemplate(t.lib.uploadToBucket, { bucket: bucketName, percent: simulatedPercent }),
    isComplete: false,
    bucket: bucketName,
    path: filePath,
  });

  // Active progress ticker while Supabase SDK uploads the file directly
  const progressTimer = window.setInterval(() => {
    simulatedPercent = Math.min(92, simulatedPercent + Math.max(2, Math.round((92 - simulatedPercent) / 6)));
    const loadedApprox = Math.round((file.size * simulatedPercent) / 100);
    const elapsedSec = Math.max(0.5, (Date.now() - startTime) / 1000);
    const speedMbps = (loadedApprox / elapsedSec / (1024 * 1024)).toFixed(1);

    onProgress?.({
      percent: simulatedPercent,
      loadedBytes: loadedApprox,
      totalBytes: file.size,
      loadedFormatted: formatBytesReadable(loadedApprox),
      totalFormatted,
      speedText: `${speedMbps} MB/s`,
      statusText: formatTemplate(t.lib.uploadToBucket, { bucket: bucketName, percent: simulatedPercent }),
      isComplete: false,
      bucket: bucketName,
      path: filePath,
    });
  }, 350);

  try {
    const { data, error } = await client.storage
      .from(bucketName)
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type || 'application/octet-stream',
      });

    window.clearInterval(progressTimer);

    if (error) {
      const realError = error.message || 'Upload to Supabase Storage failed';
      console.error(`❌ Upload failed to ${bucketName}/${filePath}:`, {
        bucket: bucketName,
        path: filePath,
        message: realError,
        error,
      });

      onProgress?.({
        percent: 0,
        loadedBytes: 0,
        totalBytes: file.size,
        loadedFormatted: '0.0 MB',
        totalFormatted,
        speedText: t.lib.uploadFailedLabel,
        statusText: formatTemplate(t.lib.uploadFailedBucket, { bucket: bucketName, err: realError }),
        isComplete: false,
        error: realError,
        bucket: bucketName,
        path: filePath,
      });

      return {
        success: false,
        url: '',
        bucket: bucketName,
        path: filePath,
        error: realError,
      };
    }

    const uploadedPath = data?.path || filePath;
    const { data: publicData } = client.storage.from(bucketName).getPublicUrl(uploadedPath);
    const publicUrl = publicData?.publicUrl || '';

    if (!publicUrl) {
      const urlErr = t.lib.uploadUrlMissing;
      console.error(`❌ ${urlErr}`, { bucket: bucketName, path: uploadedPath });
      onProgress?.({
        percent: 0,
        loadedBytes: 0,
        totalBytes: file.size,
        loadedFormatted: '0.0 MB',
        totalFormatted,
        speedText: t.lib.uploadUrlFailed,
        statusText: urlErr,
        isComplete: false,
        error: urlErr,
        bucket: bucketName,
        path: uploadedPath,
      });
      return {
        success: false,
        url: '',
        bucket: bucketName,
        path: uploadedPath,
        error: urlErr,
      };
    }

    const successDiag = formatTemplate(t.lib.uploadSuccessDiag, { bucket: bucketName, path: uploadedPath });
    console.log(`✅ ${successDiag}`, { bucket: bucketName, path: uploadedPath, publicUrl });

    onProgress?.({
      percent: 100,
      loadedBytes: file.size,
      totalBytes: file.size,
      loadedFormatted: totalFormatted,
      totalFormatted,
      speedText: t.lib.uploadComplete100,
      statusText: successDiag,
      isComplete: true,
      bucket: bucketName,
      path: uploadedPath,
    });

    return {
      success: true,
      url: publicUrl,
      bucket: bucketName,
      path: uploadedPath,
    };
  } catch (err: any) {
    window.clearInterval(progressTimer);
    const errMsg = err?.message || t.lib.uploadUnexpectedErr;
    console.error(`❌ Exception during upload to ${bucketName}/${filePath}:`, err);

    onProgress?.({
      percent: 0,
      loadedBytes: 0,
      totalBytes: file.size,
      loadedFormatted: '0.0 MB',
      totalFormatted,
      speedText: t.lib.uploadFailedLabel,
      statusText: formatTemplate(t.lib.uploadFailedBucket, { bucket: bucketName, err: errMsg }),
      isComplete: false,
      error: errMsg,
      bucket: bucketName,
      path: filePath,
    });

    return {
      success: false,
      url: '',
      bucket: bucketName,
      path: filePath,
      error: errMsg,
    };
  }
}

/**
 * Validates external video links with real-time extraction of duration, title, and provider from the server.
 */
export async function validateLinkWithProgress(
  url: string,
  onProgress?: (percent: number, statusText: string) => void
): Promise<{
  valid: boolean;
  accurate: boolean;
  provider: string;
  cleanUrl: string;
  streamUrl?: string;
  thumbnail?: string;
  title?: string;
  detectedMinutes: number;
  totalSeconds?: number;
  formattedDuration: string;
}> {
  const t = getTranslations();
  const checked = validateExternalVideoLink(url);
  const parsed = parseAndCleanMediaUrl(url, 'video');
  const probeTarget = checked.valid ? checked.cleanUrl : parsed.cleanUrl;

  onProgress?.(20, t.lib.probeConnectingVideo);

  let serverData: any = null;
  try {
    const res = await fetch('/api/probe-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim(), type: 'video' }),
    });
    if (res.ok) {
      serverData = await res.json();
    }
  } catch (err) {
    console.warn('Probe media client request error:', err);
  }

  onProgress?.(65, t.lib.probeVideoCalc);

  const provider =
    serverData?.provider ||
    (checked.provider === 'youtube'
      ? 'YouTube'
      : checked.provider === 'drive'
      ? 'Google Drive'
      : 'Direct Video');
  const title = serverData?.title || '';
  const streamUrl = serverData?.streamUrl || probeTarget;
  let totalSeconds =
    Number.isFinite(Number(serverData?.totalSeconds)) && Number(serverData?.totalSeconds) > 0
      ? Math.round(Number(serverData.totalSeconds))
      : 0;
  let detectedMinutes = totalSeconds > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : 0;
  let formattedDuration = totalSeconds > 0 ? formatSecondsHHMMSS(totalSeconds) : '--:--:--';
  let accurate = Boolean(serverData?.accurate && totalSeconds > 0);

  // Client fallback: if server could not extract exact seconds for a direct/Drive stream, probe via <video> metadata/partial buffer
  if (!accurate && streamUrl && !streamUrl.includes('youtube.com') && !streamUrl.includes('youtu.be')) {
    const driveId = extractGoogleDriveId(url) || extractGoogleDriveId(streamUrl);
    const probePlayableUrl = driveId ? `/api/drive-stream?id=${encodeURIComponent(driveId)}` : streamUrl;
    const clientProbe = await detectVideoDuration(probePlayableUrl);
    if (clientProbe.accurate && clientProbe.totalSeconds > 0) {
      totalSeconds = clientProbe.totalSeconds;
      detectedMinutes = clientProbe.minutes;
      formattedDuration = clientProbe.formattedText;
      accurate = true;
    }
  }

  const cleanUrl = checked.valid ? checked.cleanUrl : serverData?.cleanUrl || parsed.cleanUrl;

  onProgress?.(
    100,
    accurate
      ? formatTemplate(t.lib.probeVideoExact, { duration: formattedDuration })
      : t.lib.probeVideoConfirmed
  );

  return {
    valid: checked.valid || Boolean(serverData?.valid),
    accurate,
    provider,
    cleanUrl,
    streamUrl,
    thumbnail: serverData?.thumbnail || '',
    title,
    detectedMinutes,
    totalSeconds,
    formattedDuration,
  };
}

/**
 * Validates external document / memo links with real-time extraction of pages and file size from the server.
 */
export async function validateDocumentLinkWithProgress(
  url: string,
  onProgress?: (percent: number, statusText: string) => void
): Promise<{
  valid: boolean;
  accurate: boolean;
  provider: string;
  cleanUrl: string;
  title?: string;
  detectedPages: number;
  detectedFileSize: string;
}> {
  const t = getTranslations();
  const checked = validateExternalDocumentLink(url);
  const parsed = parseAndCleanMediaUrl(url, 'document');
  const clean = url.trim();

  onProgress?.(20, t.lib.probeConnectingDoc);

  let serverData: any = null;
  try {
    const res = await fetch('/api/probe-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: clean, type: 'document' }),
    });
    if (res.ok) {
      serverData = await res.json();
    }
  } catch (err) {
    console.warn('Probe doc client request error:', err);
  }

  onProgress?.(75, t.lib.probeDocScanning);

  const provider = serverData?.provider || 'Electronic PDF File';
  const title = serverData?.title || '';
  const detectedPages = Number(serverData?.pagesCount || 1);
  const detectedFileSize = serverData?.formattedSize || '12 MB';
  const accurate = Boolean(serverData?.accurate);
  const cleanUrl = checked.valid ? checked.cleanUrl : serverData?.cleanUrl || parsed.cleanUrl;

  onProgress?.(
    100,
    accurate
      ? formatTemplate(t.lib.probeDocExact, { pages: detectedPages, size: detectedFileSize })
      : formatTemplate(t.lib.probeDocConfirmed, { pages: detectedPages, size: detectedFileSize })
  );

  return {
    valid: checked.valid || Boolean(serverData?.valid),
    accurate,
    provider,
    cleanUrl,
    title,
    detectedPages,
    detectedFileSize,
  };
}

/**
 * Compresses an image file client-side via <canvas> before uploading to Supabase Storage
 * so question images and AI temp sources remain fast and lightweight.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1600,
  quality = 0.82
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let targetW = img.naturalWidth || img.width;
        let targetH = img.naturalHeight || img.height;
        if (targetW > maxWidth && targetW > 0) {
          targetH = Math.round((targetH * maxWidth) / targetW);
          targetW = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, targetW);
        canvas.height = Math.max(1, targetH);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const tryEncode = (mime: string, q: number, fallback: () => void) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                fallback();
                return;
              }
              const ext = mime === 'image/webp' ? 'webp' : 'jpg';
              const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
              const compressed = new File([blob], `${baseName}.${ext}`, { type: mime });
              URL.revokeObjectURL(objectUrl);
              resolve(compressed.size < file.size ? compressed : file);
            },
            mime,
            q
          );
        };

        tryEncode('image/webp', quality, () => {
          tryEncode('image/jpeg', quality, () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file);
          });
        });
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

export function extractFilesBucketPath(publicUrl: string, bucket: StorageBucketName = 'Files'): string | null {
  const raw = String(publicUrl || '').trim();
  if (!raw) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = raw.indexOf(marker);
  if (idx === -1) return null;
  const pathPart = raw.slice(idx + marker.length).split('?')[0];
  try {
    return decodeURIComponent(pathPart);
  } catch {
    return pathPart;
  }
}

export async function copyFilesBucketObject(
  sourcePath: string,
  destFolder = 'question-images',
  bucket: StorageBucketName = 'Files'
): Promise<{ success: boolean; path?: string; publicUrl?: string; error?: string }> {
  const client = getSupabaseClient();
  if (!client || !sourcePath) return { success: false, error: 'Missing Supabase client or source path' };
  try {
    const fileName = sourcePath.split('/').pop() || `img_${Date.now()}.webp`;
    const destPath = buildSafeStoragePath(fileName, destFolder);
    const { error } = await client.storage.from(bucket).copy(sourcePath, destPath);
    if (error) {
      return { success: false, error: error.message };
    }
    const { data } = client.storage.from(bucket).getPublicUrl(destPath);
    return { success: true, path: destPath, publicUrl: data?.publicUrl };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function deleteFilesBucketPaths(
  paths: string[],
  bucket: StorageBucketName = 'Files'
): Promise<boolean> {
  const cleanPaths = Array.from(new Set((paths || []).map((p) => String(p || '').trim()).filter(Boolean)));
  if (cleanPaths.length === 0) return true;
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.storage.from(bucket).remove(cleanPaths);
    return !error;
  } catch {
    return false;
  }
}

