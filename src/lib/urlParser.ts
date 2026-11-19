/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MediaSourceType = 'youtube' | 'drive' | 'supabase' | 'direct' | 'telegram';
import { getTranslations } from './translations';

export interface ParsedMedia {
  source: MediaSourceType;
  provider: 'youtube' | 'drive' | 'direct';
  external_id?: string;
  original_url: string;
  cleanUrl: string;
  embedUrl: string;
  id?: string;
  isEmbeddable: boolean;
  valid: boolean;
  error?: string;
}

/**
 * Strips any internal API prefixes or accidental spaces
 */
export function stripInternalPrefixes(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let cleaned = rawUrl.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();

  // If URL is wrapped in query param like ?url=https...
  if (cleaned.includes('/api/') || cleaned.startsWith('api/')) {
    const urlParamMatch = cleaned.match(/[?&]url=([^&]+)/);
    if (urlParamMatch && urlParamMatch[1]) {
      try {
        cleaned = decodeURIComponent(urlParamMatch[1]);
      } catch {
        cleaned = urlParamMatch[1];
      }
    } else {
      cleaned = cleaned.replace(/^\/?api\/[a-zA-Z0-9_.-]+\/?/, '');
    }
  }

  // Prepend https:// if bare domain is given
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://') && !cleaned.startsWith('blob:') && !cleaned.startsWith('data:')) {
    if (/^(?:(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)|youtu\.be|(?:drive\.usercontent\.|drive\.)?google\.com)\//i.test(cleaned)) {
      cleaned = `https://${cleaned}`;
    }
  }

  return cleaned.trim();
}

/**
 * Regex-only YouTube ID Extractor
 * Supports: youtube.com (with/without www), m.youtube.com, youtu.be,
 * /shorts/ID, /live/ID, /embed/ID, watch?v=ID, and extra params (?si=, &t=, &list=)
 */
export function extractYouTubeId(url: string): string | null {
  const clean = stripInternalPrefixes(url);
  if (!clean) return null;

  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
      if (/^[a-zA-Z0-9_-]{11}$/.test(candidate)) {
        return candidate;
      }
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const vParam = parsed.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }

      const pathMatch = parsed.pathname.match(/^\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})(?:\/|$)/i);
      if (pathMatch && pathMatch[1]) {
        return pathMatch[1];
      }
    }
  } catch {
    // Fallback to regex below
  }

  const match =
    clean.match(
      /(?:youtu\.be\/|(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)\/(?:embed\/|v\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})(?=[?&#/\s]|$)/i
    ) ||
    clean.match(/(?:youtube\.com|m\.youtube\.com|music\.youtube\.com)[^\s]*?[?&]v=([a-zA-Z0-9_-]{11})(?=[?&#/\s]|$)/i);

  return match && match[1] ? match[1] : null;
}

/**
 * Regex-only Google Drive ID Extractor
 * Supports: /file/d/ID, ?id=ID, /open?id=ID, uc?id=ID, usercontent?id=ID
 */
export function extractGoogleDriveId(url: string): string | null {
  const clean = stripInternalPrefixes(url);
  if (!clean) return null;

  const match =
    clean.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/i) ||
    clean.match(/\/d\/([a-zA-Z0-9_-]{10,})/i) ||
    clean.match(/[?&]id=([a-zA-Z0-9_-]{10,})/i) ||
    clean.match(/\/open\?id=([a-zA-Z0-9_-]{10,})/i);

  return match && match[1] ? match[1] : null;
}

/**
 * Converts a Google Drive share link to a direct stream URL (bypasses >100MB virus scan warning)
 */
export function convertGoogleDriveLink(url: string): string {
  const fileId = extractGoogleDriveId(url);
  if (fileId) {
    return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  }
  return stripInternalPrefixes(url);
}

/**
 * Returns ordered playback candidates for Google Drive videos:
 * 1. usercontent direct stream (bypasses large file warning)
 * 2. classic uc?export=download direct stream
 * 3. clean embed preview fallback url reference
 */
export function getGoogleDriveVideoFallbacks(urlOrId: string): {
  fileId: string | null;
  primaryStreamUrl: string;
  secondaryStreamUrl: string;
  previewEmbedUrl: string;
} {
  const cleanInput = urlOrId
    .trim()
    .replace(/([?&])autoplay=(?:1|true)(?:&|$)/gi, '$1')
    .replace(/[?&]$/, '');
  const isBareId = /^[a-zA-Z0-9_-]{10,}$/.test(cleanInput);
  const fileId = isBareId ? cleanInput : extractGoogleDriveId(cleanInput);
  if (!fileId) {
    return {
      fileId: null,
      primaryStreamUrl: cleanInput,
      secondaryStreamUrl: cleanInput,
      previewEmbedUrl: cleanInput,
    };
  }
  return {
    fileId,
    primaryStreamUrl: `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    secondaryStreamUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    previewEmbedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
  };
}

/**
 * Validates a video link strictly by Regex (Frontend only, NO external fetch)
 * Supports YouTube AND Google Drive (plus local blob uploads)
 */
export function validateExternalVideoLink(rawUrl: string): {
  valid: boolean;
  provider: 'youtube' | 'drive' | 'direct';
  external_id?: string;
  cleanUrl: string;
  embedUrl: string;
  error?: string;
} {
  const t = getTranslations();
  const clean = stripInternalPrefixes(rawUrl);
  if (!clean) {
    return {
      valid: false,
      provider: 'youtube',
      cleanUrl: '',
      embedUrl: '',
      error: t.lib.enterVideoLink,
    };
  }

  const ytId = extractYouTubeId(clean);
  if (ytId) {
    const cleanUrl = `https://www.youtube.com/watch?v=${ytId}`;
    const embedUrl = `https://www.youtube-nocookie.com/embed/${ytId}?controls=0&rel=0&modestbranding=1&disablekb=1&fs=0&iv_load_policy=3&playsinline=1&cc_load_policy=0&hl=en`;
    return {
      valid: true,
      provider: 'youtube',
      external_id: ytId,
      cleanUrl,
      embedUrl,
    };
  }

  const driveId = extractGoogleDriveId(clean);
  if (driveId) {
    const streamUrl = `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`;
    const previewUrl = `https://drive.google.com/file/d/${driveId}/preview`;
    return {
      valid: true,
      provider: 'drive',
      external_id: driveId,
      cleanUrl: streamUrl,
      embedUrl: previewUrl,
    };
  }

  if (
    clean.startsWith('blob:') ||
    clean.includes('/storage/v1/object/') ||
    /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(clean)
  ) {
    return {
      valid: true,
      provider: 'direct',
      cleanUrl: clean,
      embedUrl: clean,
    };
  }

  return {
    valid: false,
    provider: 'youtube',
    cleanUrl: clean,
    embedUrl: clean,
    error: t.lib.invalidVideoLink,
  };
}

/**
 * Validates a document link strictly by Regex (Frontend only, NO external fetch)
 * Supports Google Drive and uploaded/direct PDF & Office files
 */
export function validateExternalDocumentLink(rawUrl: string): {
  valid: boolean;
  provider: 'drive' | 'direct';
  external_id?: string;
  cleanUrl: string;
  embedUrl: string;
  error?: string;
} {
  const t = getTranslations();
  const clean = stripInternalPrefixes(rawUrl);
  if (!clean) {
    return {
      valid: false,
      provider: 'drive',
      cleanUrl: '',
      embedUrl: '',
      error: t.lib.enterDocLink,
    };
  }

  const driveId = extractGoogleDriveId(clean);
  if (driveId) {
    const previewUrl = `https://drive.google.com/file/d/${driveId}/preview`;
    return {
      valid: true,
      provider: 'drive',
      external_id: driveId,
      cleanUrl: previewUrl,
      embedUrl: previewUrl,
    };
  }

  if (
    clean.startsWith('blob:') ||
    clean.includes('/storage/v1/object/') ||
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)(\?.*)?$/i.test(clean)
  ) {
    return {
      valid: true,
      provider: 'direct',
      cleanUrl: clean,
      embedUrl: clean,
    };
  }

  return {
    valid: false,
    provider: 'drive',
    cleanUrl: clean,
    embedUrl: clean,
    error: t.lib.invalidDocLink,
  };
}

/**
 * Universal Parser: Cleans raw input URLs and prepares them for display and embedding
 */
export function parseAndCleanMediaUrl(rawInput: string, mediaType: 'video' | 'document' = 'video'): ParsedMedia {
  const clean = stripInternalPrefixes(rawInput);

  if (mediaType === 'video') {
    const ytId = extractYouTubeId(clean);
    if (ytId) {
      return {
        source: 'youtube',
        provider: 'youtube',
        external_id: ytId,
        original_url: clean,
        cleanUrl: `https://www.youtube.com/watch?v=${ytId}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?controls=0&rel=0&modestbranding=1&disablekb=1&fs=0&iv_load_policy=3&playsinline=1&cc_load_policy=0&hl=en`,
        id: ytId,
        isEmbeddable: true,
        valid: true,
      };
    }

    const driveVideoId = extractGoogleDriveId(clean);
    if (driveVideoId) {
      return {
        source: 'drive',
        provider: 'drive',
        external_id: driveVideoId,
        original_url: clean,
        cleanUrl: `https://drive.usercontent.google.com/download?id=${driveVideoId}&export=download&confirm=t`,
        embedUrl: `https://drive.google.com/file/d/${driveVideoId}/preview`,
        id: driveVideoId,
        isEmbeddable: true,
        valid: true,
      };
    }
  }

  const driveId = extractGoogleDriveId(clean);
  if (driveId) {
    const previewUrl = `https://drive.google.com/file/d/${driveId}/preview`;
    return {
      source: 'drive',
      provider: 'drive',
      external_id: driveId,
      original_url: clean,
      cleanUrl: previewUrl,
      embedUrl: previewUrl,
      id: driveId,
      isEmbeddable: true,
      valid: true,
    };
  }

  return {
    source: 'direct',
    provider: 'direct',
    original_url: clean,
    cleanUrl: clean,
    embedUrl: clean,
    isEmbeddable: false,
    valid: false,
    error: mediaType === 'video' ? getTranslations().lib.invalidVideoLinkShort : getTranslations().lib.invalidDocLinkShort,
  };
}
