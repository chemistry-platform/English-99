/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChemistryDocument } from '../types';
import { getSupabaseClient } from './supabase';
import { extractGoogleDriveId, stripInternalPrefixes } from './urlParser';
import { getTranslations } from './translations';

export interface ResolvedDriveInfo {
  driveId: string;
  previewUrl: string;
}

export interface LoadedDocumentPayload {
  kind: 'pdf' | 'image' | 'office';
  blob: Blob;
  bytes?: Uint8Array;
  objectUrl: string;
  officePublicUrl?: string;
}

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/**
 * Extracts Google Drive FILE_ID from any stored URL format
 * (open?id=, /file/d/, /d/, uc?id=, usercontent?id=, docs.google.com/.../d/)
 * and builds the clean preview iframe URL without exposing the original link.
 */
export function resolveDrivePreviewInfo(
  rawUrl?: string | null,
  externalId?: string | null
): ResolvedDriveInfo | null {
  const cleaned = stripInternalPrefixes((rawUrl || '').trim());
  const extracted = extractGoogleDriveId(cleaned);
  const candidateId =
    extracted ||
    (externalId && /^[a-zA-Z0-9_-]{10,}$/.test(externalId.trim()) ? externalId.trim() : null);

  if (!candidateId) return null;

  // Verify it actually originated from Google Drive / Docs or explicit external_id
  const isGoogleUrl =
    !cleaned ||
    /drive\.(?:usercontent\.)?google\.com|docs\.google\.com/i.test(cleaned) ||
    Boolean(externalId);

  if (!isGoogleUrl) return null;

  return {
    driveId: candidateId,
    previewUrl: `https://drive.google.com/file/d/${candidateId}/preview`,
  };
}

/**
 * Parses a Supabase Storage URL into { bucket, filePath } so we can request a signed URL if needed.
 */
export function parseSupabaseStorageLocation(
  rawUrl: string
): { bucket: string; filePath: string } | null {
  if (!rawUrl || !rawUrl.includes('/storage/v1/object/')) return null;
  try {
    const u = new URL(rawUrl);
    const m = u.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/
    );
    if (m && m[1] && m[2]) {
      return {
        bucket: decodeURIComponent(m[1]),
        filePath: decodeURIComponent(m[2]),
      };
    }
  } catch {
    const m = rawUrl.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/
    );
    if (m && m[1] && m[2]) {
      return {
        bucket: decodeURIComponent(m[1]),
        filePath: decodeURIComponent(m[2]),
      };
    }
  }
  return null;
}

export async function resolveSupabaseSignedUrl(rawUrl: string): Promise<string | null> {
  const loc = parseSupabaseStorageLocation(rawUrl);
  if (!loc) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from(loc.bucket)
      .createSignedUrl(loc.filePath, 3600);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch {
    // Fallback silently
  }
  return null;
}

export function detectKindFromUrlOrMime(
  url: string,
  mimeType?: string,
  headerBytes?: Uint8Array
): 'pdf' | 'image' | 'office' {
  if (
    headerBytes &&
    headerBytes.length >= 5 &&
    headerBytes[0] === 0x25 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x44 &&
    headerBytes[3] === 0x46 &&
    headerBytes[4] === 0x2d
  ) {
    return 'pdf';
  }

  const mime = (mimeType || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();

  if (
    mime.startsWith('image/') ||
    lowerUrl.startsWith('data:image/') ||
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(lowerUrl)
  ) {
    return 'image';
  }

  if (
    mime.includes('officedocument') ||
    mime.includes('msword') ||
    mime.includes('ms-excel') ||
    mime.includes('ms-powerpoint') ||
    /\.(docx?|xlsx?|pptx?)(\?|#|$)/i.test(lowerUrl)
  ) {
    return 'office';
  }

  return 'pdf';
}

function isLikelyHtmlPayload(bytes: Uint8Array, mime: string): boolean {
  if (mime.includes('text/html')) return true;
  if (bytes.length === 0) return true;
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 64))
    .trimStart()
    .toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

/**
 * Fetches a Supabase / device / direct file into a local Blob inside the platform.
 * Uses direct fetch / Supabase signed URL first, with internal backend stream fallback on CORS.
 */
export async function fetchDocumentPayload(
  rawUrl: string,
  signal?: AbortSignal
): Promise<LoadedDocumentPayload> {
  const t = getTranslations();
  const cleanUrl = stripInternalPrefixes(rawUrl);
  if (!cleanUrl) {
    throw new Error(t.lib.docNoFileAttached);
  }

  let resolvedOfficePublicUrl =
    cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') ? cleanUrl : undefined;
  let blob: Blob | null = null;

  const isSupabaseStorageUrl = cleanUrl.includes('/storage/v1/object/');
  let directFetchError: string | null = null;

  // 1) Try direct browser fetch (CORS-enabled Supabase public bucket, same-origin, etc.)
  try {
    const resp = await fetch(cleanUrl, {
      signal,
      credentials: 'omit',
    });
    if (resp.ok) {
      const candidateBlob = await resp.blob();
      const headBytes = new Uint8Array(await candidateBlob.slice(0, 64).arrayBuffer());
      if (!isLikelyHtmlPayload(headBytes, candidateBlob.type.toLowerCase())) {
        blob = candidateBlob;
      } else {
        directFetchError = t.lib.docHtmlError;
      }
    } else {
      directFetchError = `${t.lib.docFetchFailed} (${resp.status} ${resp.statusText || ''})`.trim();
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    directFetchError = err?.message || t.lib.docConnectFailed;
  }

  // 2) If Supabase Storage URL failed (e.g., non-public path), try signed URL from Supabase
  if (!blob && isSupabaseStorageUrl && !cleanUrl.includes('/storage/v1/object/public/')) {
    const signedUrl = await resolveSupabaseSignedUrl(cleanUrl);
    if (signedUrl) {
      resolvedOfficePublicUrl = signedUrl;
      try {
        const resp = await fetch(signedUrl, { signal, credentials: 'omit' });
        if (resp.ok) {
          const candidateBlob = await resp.blob();
          const headBytes = new Uint8Array(await candidateBlob.slice(0, 64).arrayBuffer());
          if (!isLikelyHtmlPayload(headBytes, candidateBlob.type.toLowerCase())) {
            blob = candidateBlob;
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
      }
    }
  }

  // 3) Internal stream fallback ONLY for external non-Supabase links blocked by remote CORS
  if (!blob && !isSupabaseStorageUrl && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
    const streamEndpoint = `/api/doc-stream?url=${encodeURIComponent(cleanUrl)}`;
    const resp = await fetch(streamEndpoint, { signal });
    if (!resp.ok) {
      let errMsg = t.lib.docStreamError;
      try {
        const j = await resp.json();
        if (j?.error) errMsg = String(j.error);
      } catch {
        // Ignore parse failure
      }
      throw new Error(errMsg);
    }
    const candidateBlob = await resp.blob();
    const headBytes = new Uint8Array(await candidateBlob.slice(0, 64).arrayBuffer());
    if (isLikelyHtmlPayload(headBytes, candidateBlob.type.toLowerCase())) {
      throw new Error(t.lib.docHtmlError);
    }
    blob = candidateBlob;
  }

  if (!blob) {
    throw new Error(directFetchError || t.lib.docLoadFailed);
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const kind = detectKindFromUrlOrMime(cleanUrl, blob.type, bytes);
  const objectUrl = URL.createObjectURL(blob);

  return {
    kind,
    blob,
    bytes: kind === 'pdf' ? bytes : undefined,
    objectUrl,
    officePublicUrl: resolvedOfficePublicUrl,
  };
}

function buildCleanDownloadFilename(
  title: string,
  mimeType?: string,
  rawUrl?: string
): string {
  const base = (title || 'English_File')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim() || 'English_File';

  if (/\.(pdf|png|jpe?g|webp|gif|docx?|pptx?|xlsx?)$/i.test(base)) {
    return base;
  }

  const extFromMime = mimeType ? MIME_TO_EXT[mimeType.split(';')[0].trim().toLowerCase()] : undefined;
  const extFromUrlMatch = (rawUrl || '').match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  const ext = extFromMime || (extFromUrlMatch ? extFromUrlMatch[1].toLowerCase() : 'pdf');
  return `${base}.${ext}`;
}

/**
 * Triggers a clean programmatic Blob download without ever navigating away
 * or exposing internal URLs / proxy paths to the student.
 */
export async function triggerDocumentBlobDownload(params: {
  doc: ChemistryDocument;
  fallbackUrl?: string;
  cachedBlob?: Blob | null;
}): Promise<void> {
  const rawUrl = (params.doc.fileUrl || params.doc.original_url || params.fallbackUrl || '').trim();
  const driveInfo = resolveDrivePreviewInfo(rawUrl, params.doc.external_id);

  let blob = params.cachedBlob || null;

  if (!blob) {
    if (driveInfo) {
      const resp = await fetch(
        `/api/doc-stream?driveId=${encodeURIComponent(driveInfo.driveId)}&download=1`
      );
      if (!resp.ok) {
        throw new Error(getTranslations().lib.docDownloadFailed);
      }
      blob = await resp.blob();
    } else if (rawUrl) {
      const payload = await fetchDocumentPayload(rawUrl);
      blob = payload.blob;
      URL.revokeObjectURL(payload.objectUrl);
    }
  }

  if (!blob) {
    throw new Error(getTranslations().lib.docNoDownloadFile);
  }

  const downloadName = buildCleanDownloadFilename(params.doc.title, blob.type, rawUrl);
  const blobUrl = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = blobUrl;
  link.download = downloadName;
  link.style.display = 'none';
  window.document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    try {
      window.document.body.removeChild(link);
    } catch {
      // Ignore
    }
    URL.revokeObjectURL(blobUrl);
  }, 1500);
}
