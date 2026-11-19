/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  CourseLecture,
  RedeemCode,
  UserProfile,
  ChemistryDocument,
  ExamOrAssignment,
  ExamProgress,
  PaymentRequest,
  PaymentMethodItem,
  PlatformNotification,
  SecretaryMember,
  ExamSubmission,
  QuestionBankAttemptEntry,
  HonorStudent,
  SupportThread,
} from '../types';
import { normalizeDocType, normalizeGrade } from './courseHelpers';

export const DEFAULT_SUPABASE_URL = 'https://ckduwhxgrleogkhfynuj.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_EZC2fYtKvWOv1jeqaB2OSg_YKogAHkl';

let cachedClient: SupabaseClient | null = null;

/**
 * Normalizes Supabase URL to strip '/rest/v1' or trailing slashes,
 * as Supabase client constructor requires base project domain (e.g. https://xyz.supabase.co)
 */
export function normalizeSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let clean = rawUrl.trim();
  clean = clean.replace(/\/rest\/v1\/?$/i, '');
  clean = clean.replace(/\/+$/, '');
  return clean;
}

/**
 * Returns the exclusive configured Supabase credentials for this platform.
 */
export function getSupabaseCredentials(): { url: string; anonKey: string } {
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
      ? String(import.meta.env.VITE_SUPABASE_URL).trim()
      : '';
  const envKey =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY
      ? String(import.meta.env.VITE_SUPABASE_ANON_KEY).trim()
      : '';

  if (!envUrl || !envKey) {
    console.warn(
      '⚠️ VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in environment variables; using default fallback credentials.'
    );
  }

  return {
    url: envUrl || DEFAULT_SUPABASE_URL,
    anonKey: envKey || DEFAULT_SUPABASE_ANON_KEY,
  };
}

/**
 * Generates a unique, strictly ASCII English path without spaces for Supabase Storage.
 * Example: uploads/1763210000000_x7k2p9_lesson_notes.pdf
 */
export function buildSafeStoragePath(fileName: string, folder: string = 'uploads'): string {
  const parts = fileName.split('.');
  const rawExt = parts.length > 1 ? parts.pop() || '' : '';
  const safeExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin';

  const rawBase = parts.join('.');
  const asciiBase = rawBase
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

  const uniquePrefix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const finalBase = asciiBase || 'file';
  const cleanFolder = folder.replace(/[^a-zA-Z0-9_/-]/g, '').replace(/^\/+|\/+$/g, '') || 'uploads';

  return `${cleanFolder}/${uniquePrefix}_${finalBase}.${safeExt}`;
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseCredentials();

  if (!url || !anonKey || !url.startsWith('http')) {
    return null;
  }

  const cleanUrl = normalizeSupabaseUrl(url);

  if (!cachedClient) {
    try {
      cachedClient = createClient(cleanUrl, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
      return null;
    }
  }

  return cachedClient;
}

export function saveSupabaseCredentials(url: string, anonKey: string) {
  try {
    const cleanUrl = normalizeSupabaseUrl(url || DEFAULT_SUPABASE_URL);
    localStorage.setItem(
      'amr_platform_supabase_config',
      JSON.stringify({ url: cleanUrl, anonKey: (anonKey || DEFAULT_SUPABASE_ANON_KEY).trim() })
    );
    cachedClient = null;
  } catch (e) {
    console.error('Error saving Supabase config to localStorage:', e);
  }
}

export async function testSupabaseConnection(
  rawUrl?: string,
  anonKey?: string
): Promise<{ success: boolean; message: string }> {
  const { getTranslations } = await import('./translations');
  const t = getTranslations();
  try {
    const cleanUrl = normalizeSupabaseUrl(rawUrl || DEFAULT_SUPABASE_URL);
    const key = (anonKey || DEFAULT_SUPABASE_ANON_KEY).trim();
    const client = createClient(cleanUrl, key);

    const tables = ['profiles', 'courses', 'documents', 'assignments', 'exam_results'];
    const results = await Promise.all(
      tables.map((tbl) => client.from(tbl).select('id', { count: 'exact', head: true }))
    );

    const failed = results.find((r) => r.error && r.error.code !== 'PGRST116');
    if (failed?.error) {
      return { success: false, message: `${t.lib.supabaseNotConnected}: ${failed.error.message}` };
    }

    return {
      success: true,
      message: t.lib.supabaseTablesOk,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `${t.lib.supabaseConnErrPrefix} ${err.message || ''}`,
    };
  }
}

export type SupabaseSyncResult = {
  success: boolean;
  isLocalFallback?: boolean;
  error?: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deterministically converts any legacy ID (e.g. "std-1", "exam-17000") into a valid UUID
 * so Postgres UUID columns never fail with 22P02 and repeated upserts update the exact same row.
 */
export function toValidUuid(rawId?: string): string {
  if (!rawId) return generateUuid();
  const trimmed = rawId.trim();
  if (UUID_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const hexParts = seeds.map((seed, passIdx) => {
    let h = seed >>> 0;
    const input = `${passIdx}:${trimmed}`;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  });

  const combined = hexParts.join('');
  const part1 = combined.slice(0, 8);
  const part2 = combined.slice(8, 12);
  const part3 = `4${combined.slice(13, 16)}`;
  const variantNibble = (8 + (parseInt(combined[16], 16) & 0x3)).toString(16);
  const part4 = `${variantNibble}${combined.slice(17, 20)}`;
  const part5 = combined.slice(20, 32);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

function handleSupabaseError(context: string, error: any): SupabaseSyncResult {
  if (!error) return { success: true };
  if (error.code === '42501') {
    console.warn(`Supabase RLS active on ${context}:`, error.message);
    return {
      success: false,
      isLocalFallback: true,
      error: `Supabase permissions (RLS) prevented saving to ${context}. Please enable read and write policies.`,
    };
  }
  console.warn(`Supabase ${context} warning:`, error.message || error);
  return { success: false, error: error.message || `Failed to sync with ${context}` };
}

function inferVideoSource(url: string, provider?: string): CourseLecture['videoSource'] {
  if (provider === 'drive' || url?.includes('drive.google.com') || url?.includes('drive.usercontent.google.com')) {
    return 'drive';
  }
  if (provider === 'youtube' || url?.includes('youtube.com') || url?.includes('youtu.be')) {
    return 'youtube';
  }
  if (provider === 'telegram' || url?.includes('t.me') || url?.includes('/api/telegram-stream')) {
    return 'telegram';
  }
  if (url?.includes('/storage/v1/object/')) {
    return 'supabase';
  }
  return 'direct';
}

// ==========================================
// 1. COURSES & LECTURES CRUD (table: courses)
// Live columns: id, title, description, video_url, provider, external_id, original_url, price, duration, grade, created_at
// ==========================================
export async function fetchCoursesFromSupabase(): Promise<CourseLecture[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const [coursesRes, structRes] = await Promise.all([
      client.from('courses').select('*').order('created_at', { ascending: false }),
      client.from('assignments').select('*').eq('type', 'course_structure'),
    ]);

    if (coursesRes.error || !coursesRes.data) return null;

    const structureMap = new Map<string, any>();
    if (!structRes.error && Array.isArray(structRes.data)) {
      structRes.data.forEach((row: any) => {
        const meta = row?.questions;
        if (meta && typeof meta === 'object' && meta.courseId) {
          structureMap.set(String(meta.courseId), meta);
        }
      });
    }

    return coursesRes.data.map((row: any) => {
      const meta = structureMap.get(String(row.id)) || {};
      const priceNum = Number(row.price) || 0;
      const isFreeVal = meta.isFree !== undefined ? Boolean(meta.isFree) : row.is_free !== undefined ? Boolean(row.is_free) : priceNum === 0;
      const resolvedSec = Number(row.duration_seconds) || Number(meta.durationSeconds) || 0;
      const resolvedMin =
        Number(row.duration ?? row.duration_minutes) ||
        (resolvedSec > 0 ? Math.max(1, Math.round(resolvedSec / 60)) : 0);
      return {
        id: row.id,
        title: row.title,
        chapter: meta.chapter || row.chapter || 'General Curriculum',
        description: row.description || '',
        coverUrl: meta.coverUrl || row.cover_url || undefined,
        instructions: meta.instructions || undefined,
        scheduleText: meta.scheduleText || undefined,
        lessons: Array.isArray(meta.lessons) ? meta.lessons : undefined,
        draftLessons: Array.isArray(meta.draftLessons) ? meta.draftLessons : undefined,
        videoUrl: row.video_url || '',
        videoSource: row.video_source || inferVideoSource(row.video_url || '', row.provider),
        provider: row.provider || undefined,
        external_id: row.external_id || undefined,
        original_url: row.original_url || undefined,
        price: priceNum,
        isFree: isFreeVal,
        grade: normalizeGrade(row.grade || '3rd Secondary'),
        durationMinutes: resolvedMin,
        durationSeconds: resolvedSec > 0 ? resolvedSec : undefined,
        viewsCount: Number(row.views_count) || 0,
        attachedPdfUrl: meta.attachedPdfUrl || undefined,
        attachedExamId: meta.attachedExamId || undefined,
        createdAt: row.created_at || new Date().toISOString(),
      };
    });
  } catch (e) {
    console.warn('Supabase fetch courses error:', e);
    return null;
  }
}

export async function syncCourseToSupabase(course: CourseLecture): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true, error: 'Supabase client not found' };
  try {
    const safeId = toValidUuid(course.id);

    const payload: any = {
      id: safeId,
      title: course.title,
      description: course.description || '',
      video_url: course.videoUrl || '',
      provider: course.provider || course.videoSource || null,
      external_id: course.external_id || null,
      original_url: course.original_url || course.videoUrl || null,
      price: course.isFree ? 0 : Number(course.price) || 0,
      duration: Math.max(0, Math.round(Number(course.durationMinutes) || 0)),
      grade: course.grade || '3rd Secondary',
      created_at: course.createdAt || new Date().toISOString(),
    };

    const { error } = await client.from('courses').upsert(payload);
    if (error) {
      return handleSupabaseError('courses', error);
    }

    // Persist full hierarchical curriculum (published lessons, unpublished draftLessons, cover, schedule, instructions, exact durationSeconds)
    const curriculumPayload = {
      id: toValidUuid(`curriculum:${safeId}`),
      title: course.title,
      type: 'course_structure',
      grade: course.grade || '3rd Secondary',
      questions: {
        courseId: safeId,
        chapter: course.chapter || 'General Curriculum',
        coverUrl: course.coverUrl || '',
        instructions: course.instructions || '',
        scheduleText: course.scheduleText || '',
        isFree: Boolean(course.isFree),
        durationSeconds: course.durationSeconds && course.durationSeconds > 0 ? Math.round(course.durationSeconds) : 0,
        attachedPdfUrl: course.attachedPdfUrl || '',
        attachedExamId: course.attachedExamId || '',
        lessons: Array.isArray(course.lessons) ? course.lessons : [],
        draftLessons: Array.isArray(course.draftLessons) ? course.draftLessons : undefined,
      },
      created_at: course.createdAt || new Date().toISOString(),
    };

    const { error: currErr } = await client.from('assignments').upsert(curriculumPayload);
    if (currErr) {
      console.warn('Supabase course curriculum sync warning:', currErr.message);
    }

    return { success: true };
  } catch (e: any) {
    console.warn('Supabase sync course notice:', e?.message || e);
    return { success: false, isLocalFallback: true, error: e?.message || 'Supabase connection error' };
  }
}

export async function deleteCourseFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const safeId = toValidUuid(id);
    const [{ error }] = await Promise.all([
      client.from('courses').delete().eq('id', safeId),
      client.from('assignments').delete().eq('id', toValidUuid(`curriculum:${safeId}`)),
    ]);
    if (error) {
      console.warn('Supabase delete course warning:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Supabase delete course error:', e);
    return false;
  }
}

// ==========================================
// 2. PROFILES & STUDENTS CRUD (table: profiles)
// Live columns: id, student_code, full_name, phone, parent_phone, email, governorate, grade, role, wallet_balance, avatar_url, created_at, updated_at
// ==========================================
const INTERNAL_ASSIGNMENT_TYPES = new Set([
  'course_structure',
  'payment_request',
  'student_permissions',
  'document_meta',
  'exam_meta',
  'exam_progress',
  'submission_meta',
  'question_bank_progress',
  'payment_methods_config',
  'platform_notification',
  'secretaries_config',
  'redeem_code_meta',
  'support_ticket',
  'honor_student',
  'platform_settings_meta',
]);

function mapProfileRow(row: any, perms?: any): UserProfile {
  const meta = perms || {};
  return {
    id: row.id,
    studentCode: row.student_code,
    fullName: row.full_name,
    phone: row.phone,
    parentPhone: row.parent_phone || '',
    email: row.email || '',
    password: row.password || meta.password || undefined,
    governorate: row.governorate || 'Cairo',
    grade: normalizeGrade(row.grade || '3rd Secondary'),
    role: row.role || 'student',
    balance: Number(row.wallet_balance ?? row.balance ?? 0),
    completedLectures: Array.isArray(meta.completedLectures)
      ? meta.completedLectures
      : Array.isArray(row.completed_lectures)
      ? row.completed_lectures
      : [],
    enrolledCourses: Array.isArray(meta.enrolledCourses)
      ? meta.enrolledCourses
      : Array.isArray(row.enrolled_courses)
      ? row.enrolled_courses
      : [],
    grantedDocuments: Array.isArray(meta.grantedDocuments) ? meta.grantedDocuments : [],
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export async function fetchProfilesFromSupabase(): Promise<UserProfile[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const [profRes, permsRes] = await Promise.all([
      client.from('profiles').select('*').order('created_at', { ascending: false }),
      client.from('assignments').select('questions').eq('type', 'student_permissions'),
    ]);
    if (profRes.error || !profRes.data) return null;

    const permsByKey = new Map<string, any>();
    if (!permsRes.error && Array.isArray(permsRes.data)) {
      permsRes.data.forEach((pRow: any) => {
        const meta = pRow?.questions;
        if (meta && typeof meta === 'object') {
          if (meta.studentId) permsByKey.set(String(meta.studentId), meta);
          if (meta.phone) permsByKey.set(`phone:${String(meta.phone).trim()}`, meta);
          if (meta.studentCode) permsByKey.set(`code:${String(meta.studentCode).trim().toUpperCase()}`, meta);
        }
      });
    }

    return profRes.data.map((row: any) => {
      const perms =
        permsByKey.get(String(row.id)) ||
        (row.phone ? permsByKey.get(`phone:${String(row.phone).trim()}`) : undefined) ||
        (row.student_code ? permsByKey.get(`code:${String(row.student_code).trim().toUpperCase()}`) : undefined);
      return mapProfileRow(row, perms);
    });
  } catch (e) {
    console.warn('Supabase fetch profiles error:', e);
    return null;
  }
}

export async function findProfileInSupabaseWithStatus(
  identifier: string
): Promise<{ profile: UserProfile | null; error?: string }> {
  const client = getSupabaseClient();
  const trimmed = identifier.trim();
  if (!client) {
    return { profile: null, error: 'Unable to initialize Supabase client' };
  }
  if (!trimmed) {
    return { profile: null };
  }
  try {
    const safeVal = trimmed.replace(/"/g, '');
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .or(`phone.eq."${safeVal}",student_code.ilike."${safeVal}",email.ilike."${safeVal}"`)
      .limit(1);

    if (error) {
      return { profile: null, error: error.message || 'Unable to query student profile from Supabase' };
    }
    if (data && data.length > 0) {
      const row = data[0];
      let perms: any = undefined;
      try {
        const { data: permRows } = await client
          .from('assignments')
          .select('questions')
          .eq('type', 'student_permissions');
        if (Array.isArray(permRows)) {
          const foundPerm = permRows.find((r: any) => {
            const q = r?.questions;
            return (
              q &&
              (q.studentId === row.id ||
                (row.phone && q.phone === row.phone) ||
                (row.student_code && q.studentCode === row.student_code))
            );
          });
          if (foundPerm) perms = foundPerm.questions;
        }
      } catch {
        // Ignore permissions lookup fallback error
      }
      return { profile: mapProfileRow(row, perms) };
    }
    return { profile: null };
  } catch (e: any) {
    console.warn('Supabase find profile error:', e);
    return { profile: null, error: e?.message || 'Unable to connect to Supabase server' };
  }
}

export async function findProfileInSupabase(identifier: string): Promise<UserProfile | null> {
  const { profile } = await findProfileInSupabaseWithStatus(identifier);
  return profile;
}

function isMissingColumnError(error: any, colName: string): boolean {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    (msg.includes(colName.toLowerCase()) && (msg.includes('column') || msg.includes('schema cache')))
  );
}

export async function syncStudentPermissionsToSupabase(user: UserProfile, resolvedId?: string): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true };
  try {
    const safeId = toValidUuid(resolvedId || user.id);
    const permPayload = {
      id: toValidUuid(`perms:${safeId}`),
      title: user.fullName || 'Student Permissions',
      type: 'student_permissions',
      grade: user.grade || '3rd Secondary',
      questions: {
        studentId: safeId,
        phone: user.phone,
        studentCode: user.studentCode,
        ...(user.password !== undefined ? { password: user.password || '' } : {}),
        enrolledCourses: Array.isArray(user.enrolledCourses) ? user.enrolledCourses : [],
        grantedDocuments: Array.isArray(user.grantedDocuments) ? user.grantedDocuments : [],
        completedLectures: Array.isArray(user.completedLectures) ? user.completedLectures : [],
        updatedAt: new Date().toISOString(),
      },
      created_at: user.createdAt || new Date().toISOString(),
    };
    const { error } = await client.from('assignments').upsert(permPayload);
    if (error) return handleSupabaseError('student_permissions', error);
    return { success: true };
  } catch (e: any) {
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

export async function syncProfileToSupabase(user: UserProfile): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true, error: 'Supabase client not found' };
  try {
    let resolvedId = toValidUuid(user.id);
    const basePayload: Record<string, any> = {
      id: resolvedId,
      student_code: user.studentCode,
      full_name: user.fullName,
      phone: user.phone,
      parent_phone: user.parentPhone || null,
      email: user.email || null,
      governorate: user.governorate || 'Cairo',
      grade: user.grade || '3rd Secondary',
      role: user.role || 'student',
      wallet_balance: Number(user.balance) || 0,
      created_at: user.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const payloadWithPassword =
      user.password !== undefined ? { ...basePayload, password: user.password || null } : basePayload;

    let { error } = await client.from('profiles').upsert(payloadWithPassword);

    // If `password` column doesn't exist yet on live `profiles` table, retry cleanly without it
    if (error && user.password !== undefined && isMissingColumnError(error, 'password')) {
      const retryRes = await client.from('profiles').upsert(basePayload);
      error = retryRes.error;
    }

    if (error) {
      if (error.code === '42501') {
        return handleSupabaseError('profiles', error);
      }
      // If unique phone or student_code conflict with an existing row, update matching row cleanly
      if (error.code === '23505') {
        const updateBase: Record<string, any> = {
          full_name: user.fullName,
          parent_phone: user.parentPhone || null,
          email: user.email || null,
          governorate: user.governorate || 'Cairo',
          grade: user.grade || '3rd Secondary',
          role: user.role || 'student',
          wallet_balance: Number(user.balance) || 0,
          updated_at: new Date().toISOString(),
        };
        const updateWithPassword =
          user.password !== undefined ? { ...updateBase, password: user.password || null } : updateBase;

        let { data: updatedRows, error: updateErr } = await client
          .from('profiles')
          .update(updateWithPassword)
          .eq('phone', user.phone)
          .select('id');
        if (updateErr && user.password !== undefined && isMissingColumnError(updateErr, 'password')) {
          const retryUpdate = await client.from('profiles').update(updateBase).eq('phone', user.phone).select('id');
          updateErr = retryUpdate.error;
          updatedRows = retryUpdate.data;
        }
        if (!updateErr) {
          if (updatedRows && updatedRows[0]?.id) resolvedId = updatedRows[0].id;
          await syncStudentPermissionsToSupabase(user, resolvedId);
          return { success: true };
        }

        const codeUpdateBase = { ...updateBase, phone: user.phone };
        const codeUpdateWithPassword =
          user.password !== undefined ? { ...codeUpdateBase, password: user.password || null } : codeUpdateBase;
        let { data: codeRows, error: codeErr } = await client
          .from('profiles')
          .update(codeUpdateWithPassword)
          .eq('student_code', user.studentCode)
          .select('id');
        if (codeErr && user.password !== undefined && isMissingColumnError(codeErr, 'password')) {
          const retryCodeUpdate = await client
            .from('profiles')
            .update(codeUpdateBase)
            .eq('student_code', user.studentCode)
            .select('id');
          codeErr = retryCodeUpdate.error;
          codeRows = retryCodeUpdate.data;
        }
        if (!codeErr) {
          if (codeRows && codeRows[0]?.id) resolvedId = codeRows[0].id;
          await syncStudentPermissionsToSupabase(user, resolvedId);
          return { success: true };
        }
      }
      return handleSupabaseError('profiles', error);
    }

    await syncStudentPermissionsToSupabase(user, resolvedId);
    return { success: true };
  } catch (e: any) {
    console.warn('Supabase sync profile error:', e);
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

export async function deleteProfileFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const safeId = toValidUuid(id);
    const { error } = await client.from('profiles').delete().eq('id', safeId);
    if (error) {
      console.warn('Supabase delete profile warning:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Supabase delete profile error:', e);
    return false;
  }
}

// ==========================================
// 3. DOCUMENTS CRUD (table: documents)
// Live columns: id, title, grade, file_url, provider, external_id, original_url, created_at
// ==========================================
export async function fetchDocumentsFromSupabase(): Promise<ChemistryDocument[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const [docsRes, metaRes] = await Promise.all([
      client.from('documents').select('*').order('created_at', { ascending: false }),
      client.from('assignments').select('questions').eq('type', 'document_meta'),
    ]);
    if (docsRes.error || !docsRes.data) return null;

    const metaById = new Map<string, any>();
    if (!metaRes.error && Array.isArray(metaRes.data)) {
      metaRes.data.forEach((r: any) => {
        if (r?.questions?.docId) metaById.set(String(r.questions.docId), r.questions);
      });
    }

    return docsRes.data.map((row: any) => {
      const meta = metaById.get(String(row.id)) || {};
      const priceVal = Number(meta.price ?? row.price ?? 0);
      const isFreeVal = meta.isFree !== undefined ? Boolean(meta.isFree) : row.is_free !== undefined ? Boolean(row.is_free) : priceVal === 0;
      return {
        id: row.id,
        title: row.title,
        docType: normalizeDocType(meta.docType || row.doc_type),
        grade: normalizeGrade(row.grade || '3rd Secondary'),
        fileUrl: row.file_url || '',
        fileSize: meta.fileSize || row.file_size || 'PDF',
        pagesCount: Number(meta.pagesCount ?? row.pages_count) || 30,
        downloadsCount: Number(row.downloads_count) || 0,
        price: priceVal,
        isFree: isFreeVal,
        provider: row.provider || undefined,
        external_id: row.external_id || undefined,
        original_url: row.original_url || undefined,
        createdAt: row.created_at || new Date().toISOString(),
      };
    });
  } catch (e) {
    console.warn('Supabase fetch documents error:', e);
    return null;
  }
}

export async function syncDocumentToSupabase(doc: ChemistryDocument): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true, error: 'Supabase client not found' };
  try {
    const safeId = toValidUuid(doc.id);

    const payload: any = {
      id: safeId,
      title: doc.title,
      grade: doc.grade || '3rd Secondary',
      file_url: doc.fileUrl,
      provider: doc.provider || null,
      external_id: doc.external_id || null,
      original_url: doc.original_url || doc.fileUrl,
      created_at: doc.createdAt || new Date().toISOString(),
    };

    const { error } = await client.from('documents').upsert(payload);
    if (error) {
      return handleSupabaseError('documents', error);
    }

    await client.from('assignments').upsert({
      id: toValidUuid(`doc:${safeId}`),
      title: doc.title,
      type: 'document_meta',
      grade: doc.grade || '3rd Secondary',
      questions: {
        docId: safeId,
        docType: doc.docType || 'Study Notes',
        fileSize: doc.fileSize || 'PDF',
        pagesCount: Number(doc.pagesCount) || 30,
        price: doc.isFree === false ? Number(doc.price) || 0 : 0,
        isFree: doc.isFree !== false,
      },
      created_at: doc.createdAt || new Date().toISOString(),
    });

    return { success: true };
  } catch (e: any) {
    console.warn('Supabase sync document notice:', e?.message || e);
    return { success: false, isLocalFallback: true, error: e?.message || 'Supabase connection error' };
  }
}

export async function deleteDocumentFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const safeId = toValidUuid(id);
    const [{ error }] = await Promise.all([
      client.from('documents').delete().eq('id', safeId),
      client.from('assignments').delete().eq('id', toValidUuid(`doc:${safeId}`)),
    ]);
    if (error) {
      console.warn('Supabase delete document warning:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Supabase delete document error:', e);
    return false;
  }
}

// ==========================================
// 4. EXAMS, SHEETS & ASSIGNMENTS CRUD (table: assignments)
// Live columns: id, title, type, grade, questions, created_at
// ==========================================
export async function fetchExamsFromSupabase(): Promise<ExamOrAssignment[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const [examsRes, metaRes] = await Promise.all([
      client
        .from('assignments')
        .select('*')
        .neq('type', 'course_structure')
        .order('created_at', { ascending: false }),
      client.from('assignments').select('questions').eq('type', 'exam_meta'),
    ]);
    if (examsRes.error || !examsRes.data) return null;

    const metaMap = new Map<string, any>();
    if (!metaRes.error && Array.isArray(metaRes.data)) {
      metaRes.data.forEach((r: any) => {
        const m = r?.questions;
        if (m && typeof m === 'object' && m.examId) {
          metaMap.set(String(m.examId), m);
        }
      });
    }

    return examsRes.data
      .filter((row: any) => !INTERNAL_ASSIGNMENT_TYPES.has(String(row.type || '')))
      .map((row: any) => {
        const questions = Array.isArray(row.questions) ? row.questions : [];
        const calculatedPoints = questions.reduce((sum: number, q: any) => sum + (Number(q?.points) || 0), 0);
        const category: ExamOrAssignment['category'] =
          row.type === 'assignment' || row.type === 'sheet' || row.type === 'exam' ? row.type : 'exam';
        const meta = metaMap.get(String(row.id)) || {};
        const defaultMaxHours = category === 'assignment' ? 24 : 5;
        const maxCompletionHours =
          meta.maxCompletionHours !== undefined && Number(meta.maxCompletionHours) > 0
            ? Number(meta.maxCompletionHours)
            : row.max_completion_hours !== undefined && Number(row.max_completion_hours) > 0
            ? Number(row.max_completion_hours)
            : defaultMaxHours;

        const rawDurationMinutes =
          row.duration_minutes !== undefined && row.duration_minutes !== null
            ? Number(row.duration_minutes)
            : meta.durationMinutes !== undefined && meta.durationMinutes !== null
            ? Number(meta.durationMinutes)
            : undefined;
        const durationMinutes =
          rawDurationMinutes && rawDurationMinutes > 0 ? rawDurationMinutes : undefined;

        const rawResumeMinutes =
          row.resume_window_minutes !== undefined && row.resume_window_minutes !== null
            ? Number(row.resume_window_minutes)
            : meta.resumeWindowMinutes !== undefined && meta.resumeWindowMinutes !== null
            ? Number(meta.resumeWindowMinutes)
            : undefined;
        const resumeWindowMinutes =
          rawResumeMinutes && rawResumeMinutes > 0 ? rawResumeMinutes : undefined;

        const rawMaxAttempts =
          row.max_attempts !== undefined && row.max_attempts !== null
            ? Number(row.max_attempts)
            : meta.maxAttempts !== undefined && meta.maxAttempts !== null
            ? Number(meta.maxAttempts)
            : undefined;
        const maxAttempts = rawMaxAttempts && rawMaxAttempts > 0 ? rawMaxAttempts : undefined;

        const shuffleForStudents =
          row.shuffle_for_students !== undefined && row.shuffle_for_students !== null
            ? Boolean(row.shuffle_for_students)
            : meta.shuffleForStudents !== undefined
            ? Boolean(meta.shuffleForStudents)
            : true;

        return {
          id: row.id,
          title: row.title,
          category,
          grade: normalizeGrade(row.grade || '3rd Secondary'),
          durationMinutes,
          durationUnit: row.duration_unit || meta.durationUnit || 'minutes',
          resumeWindowMinutes,
          resumeWindowUnit: row.resume_window_unit || meta.resumeWindowUnit || 'hours',
          maxAttempts,
          shuffleForStudents,
          totalPoints: Number(meta.totalPoints ?? row.total_points) || calculatedPoints || 60,
          deadline: meta.deadline || row.deadline || 'Available immediately',
          lessonTitle: meta.lessonTitle || row.lesson_title || undefined,
          lessonNumber: meta.lessonNumber ?? row.lesson_number ?? undefined,
          maxCompletionHours,
          chapter: meta.chapter || row.chapter || undefined,
          isCustomForStudentId: meta.isCustomForStudentId || row.is_custom_for_student_id || undefined,
          questions,
          createdAt: row.created_at || new Date().toISOString(),
        };
      });
  } catch (e) {
    console.warn('Supabase fetch assignments error:', e);
    return null;
  }
}

export async function syncExamToSupabase(exam: ExamOrAssignment): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true, error: 'Supabase client not found' };
  try {
    const safeId = toValidUuid(exam.id);
    const defaultMaxHours = exam.category === 'assignment' ? 24 : 5;
    const maxHours =
      exam.maxCompletionHours && exam.maxCompletionHours > 0
        ? exam.maxCompletionHours
        : exam.resumeWindowMinutes && exam.resumeWindowMinutes > 0
        ? Number((exam.resumeWindowMinutes / 60).toFixed(2))
        : defaultMaxHours;

    const basePayload = {
      id: safeId,
      title: exam.title,
      type: exam.category || 'exam',
      grade: exam.grade || '3rd Secondary',
      questions: exam.questions || [],
      created_at: exam.createdAt || new Date().toISOString(),
    };

    const extendedPayload = {
      ...basePayload,
      duration_minutes: exam.durationMinutes && exam.durationMinutes > 0 ? exam.durationMinutes : null,
      duration_unit: exam.durationUnit || 'minutes',
      resume_window_minutes:
        exam.resumeWindowMinutes && exam.resumeWindowMinutes > 0 ? exam.resumeWindowMinutes : null,
      resume_window_unit: exam.resumeWindowUnit || 'hours',
      max_attempts: exam.maxAttempts && exam.maxAttempts > 0 ? exam.maxAttempts : null,
      shuffle_for_students: exam.shuffleForStudents !== false,
      lesson_number: exam.lessonNumber ?? null,
      lesson_title: exam.lessonTitle || null,
      total_points: exam.totalPoints || 60,
      deadline: exam.deadline || 'Available immediately',
      chapter: exam.chapter || null,
      max_completion_hours: maxHours,
    };

    let { error } = await client.from('assignments').upsert(extendedPayload);
    if (error && (error.code === 'PGRST204' || error.code === '42703' || String(error.message || '').includes('column'))) {
      const retry = await client.from('assignments').upsert(basePayload);
      error = retry.error;
    }
    if (error) {
      return handleSupabaseError('assignments', error);
    }

    await client.from('assignments').upsert({
      id: toValidUuid(`exam_meta:${safeId}`),
      title: exam.title,
      type: 'exam_meta',
      grade: exam.grade || '3rd Secondary',
      questions: {
        examId: safeId,
        maxCompletionHours: maxHours,
        durationMinutes: exam.durationMinutes && exam.durationMinutes > 0 ? exam.durationMinutes : null,
        durationUnit: exam.durationUnit || 'minutes',
        resumeWindowMinutes:
          exam.resumeWindowMinutes && exam.resumeWindowMinutes > 0 ? exam.resumeWindowMinutes : null,
        resumeWindowUnit: exam.resumeWindowUnit || 'hours',
        maxAttempts: exam.maxAttempts && exam.maxAttempts > 0 ? exam.maxAttempts : null,
        shuffleForStudents: exam.shuffleForStudents !== false,
        totalPoints: exam.totalPoints || 60,
        deadline: exam.deadline || 'Available immediately',
        lessonTitle: exam.lessonTitle || null,
        lessonNumber: exam.lessonNumber ?? null,
        chapter: exam.chapter || null,
        isCustomForStudentId: exam.isCustomForStudentId || null,
      },
      created_at: exam.createdAt || new Date().toISOString(),
    });

    return { success: true };
  } catch (e: any) {
    console.warn('Supabase sync assignment error:', e);
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

export async function deleteExamFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const safeId = toValidUuid(id);
    const [{ error }] = await Promise.all([
      client.from('assignments').delete().eq('id', safeId),
      client.from('assignments').delete().eq('id', toValidUuid(`exam_meta:${safeId}`)),
    ]);
    if (error) {
      console.warn('Supabase delete assignment warning:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Supabase delete assignment error:', e);
    return false;
  }
}

// ==========================================
// 4B. PER-STUDENT EXAM PROGRESS & TIMER STATE (type: exam_progress)
// ==========================================
export async function syncExamProgressToSupabase(progress: ExamProgress): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true };
  try {
    const examUuid = toValidUuid(progress.examId);
    const studentUuid = toValidUuid(progress.studentId);
    const rowId = toValidUuid(`progress:${examUuid}:${studentUuid}`);

    const { error } = await client.from('assignments').upsert({
      id: rowId,
      title: `progress:${examUuid}`,
      type: 'exam_progress',
      grade: studentUuid,
      questions: {
        ...progress,
        examUuid,
        studentUuid,
        lastUpdated: progress.lastUpdated || new Date().toISOString(),
      },
      created_at: progress.startedAt || progress.lastUpdated || new Date().toISOString(),
    });

    if (error) {
      return handleSupabaseError('exam_progress', error);
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

export async function fetchExamProgressFromSupabase(
  examId: string,
  studentId: string
): Promise<ExamProgress | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const examUuid = toValidUuid(examId);
    const studentUuid = toValidUuid(studentId);
    const rowId = toValidUuid(`progress:${examUuid}:${studentUuid}`);

    const { data, error } = await client
      .from('assignments')
      .select('questions')
      .eq('id', rowId)
      .limit(1);

    if (error || !data || data.length === 0) return null;
    const raw = data[0]?.questions;
    if (!raw || typeof raw !== 'object' || !raw.startedAt) return null;
    return {
      examId: raw.examId || examId,
      studentId: raw.studentId || studentId,
      category: raw.category || 'exam',
      answers: raw.answers || {},
      visitedQuestionIndices: Array.isArray(raw.visitedQuestionIndices) ? raw.visitedQuestionIndices : [0],
      secondsElapsed: Number(raw.secondsElapsed) || 0,
      remainingSeconds: Number(raw.remainingSeconds) || 0,
      startedAt: raw.startedAt,
      expiresAt: raw.expiresAt,
      lastUpdated: raw.lastUpdated || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function fetchStudentExamProgressListFromSupabase(
  studentId: string
): Promise<ExamProgress[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const studentUuid = toValidUuid(studentId);
    const { data, error } = await client
      .from('assignments')
      .select('questions')
      .eq('type', 'exam_progress')
      .eq('grade', studentUuid);

    if (error || !data) return null;
    return data
      .map((r: any) => r?.questions)
      .filter((raw: any) => raw && typeof raw === 'object' && raw.examId && raw.startedAt)
      .map((raw: any) => ({
        examId: raw.examId,
        studentId: raw.studentId || studentId,
        category: raw.category || 'exam',
        answers: raw.answers || {},
        visitedQuestionIndices: Array.isArray(raw.visitedQuestionIndices) ? raw.visitedQuestionIndices : [0],
        secondsElapsed: Number(raw.secondsElapsed) || 0,
        remainingSeconds: Number(raw.remainingSeconds) || 0,
        startedAt: raw.startedAt,
        expiresAt: raw.expiresAt,
        lastUpdated: raw.lastUpdated || new Date().toISOString(),
      }));
  } catch {
    return null;
  }
}

export async function deleteExamProgressFromSupabase(examId: string, studentId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const examUuid = toValidUuid(examId);
    const studentUuid = toValidUuid(studentId);
    const rowId = toValidUuid(`progress:${examUuid}:${studentUuid}`);
    const { error } = await client.from('assignments').delete().eq('id', rowId);
    return !error;
  } catch {
    return false;
  }
}

// ==========================================
// 5. EXAM & ASSIGNMENT RESULTS (table: exam_results + submission_meta relay)
// Live columns: id, assignment_id, student_id, score, total_score, submitted_at
// ==========================================
export async function fetchSubmissionsFromSupabase(): Promise<ExamSubmission[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const [resQuery, metaQuery] = await Promise.all([
      client.from('exam_results').select('*').order('submitted_at', { ascending: false }),
      client.from('assignments').select('questions').eq('type', 'submission_meta'),
    ]);
    if (resQuery.error || !resQuery.data) return null;

    const metaMap = new Map<string, any>();
    if (!metaQuery.error && Array.isArray(metaQuery.data)) {
      metaQuery.data.forEach((r: any) => {
        const m = r?.questions;
        if (m && typeof m === 'object' && m.submissionId) {
          metaMap.set(String(m.submissionId), m);
        }
      });
    }

    return resQuery.data.map((row: any) => {
      const meta = metaMap.get(String(row.id)) || {};
      return {
        id: row.id,
        examId: row.assignment_id || row.exam_id || meta.examId || '',
        studentId: row.student_id || meta.studentId || 'guest',
        studentName: meta.studentName || row.student_name || 'English Student',
        studentCode: meta.studentCode || row.student_code || 'ENG',
        score: meta.score !== undefined ? Number(meta.score) : Number(row.score) || 0,
        totalPoints: meta.totalPoints !== undefined ? Number(meta.totalPoints) : Number(row.total_score ?? row.total_points) || 0,
        answers: meta.answers || row.answers || {},
        hasEssayQuestions: meta.hasEssayQuestions ?? Boolean(row.has_essay_questions),
        mcqScore: meta.mcqScore ?? row.mcq_score ?? undefined,
        mcqTotal: meta.mcqTotal ?? row.mcq_total ?? undefined,
        essayGradingPending: meta.essayGradingPending ?? Boolean(row.essay_grading_pending),
        questionGrades: meta.questionGrades || row.question_grades || undefined,
        autoZeroedQuestions: meta.autoZeroedQuestions || row.auto_zeroed_questions || undefined,
        teacherFeedback: meta.teacherFeedback || row.teacher_feedback || undefined,
        gradedAt: meta.gradedAt || row.graded_at || undefined,
        gradedBy: meta.gradedBy || row.graded_by || undefined,
        startedAt: meta.startedAt || row.started_at || undefined,
        attemptNumber: meta.attemptNumber !== undefined ? Number(meta.attemptNumber) : undefined,
        solvedCount: meta.solvedCount !== undefined ? Number(meta.solvedCount) : undefined,
        correctCount: meta.correctCount !== undefined ? Number(meta.correctCount) : undefined,
        submittedAt: meta.submittedAt || row.submitted_at || new Date().toISOString(),
      };
    });
  } catch (e) {
    console.warn('Supabase fetch exam_results error:', e);
    return null;
  }
}

export async function syncSubmissionToSupabase(
  sub: ExamSubmission,
  context?: { exam?: ExamOrAssignment; student?: UserProfile | null }
): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true, error: 'Supabase client not found' };
  try {
    const safeId = toValidUuid(sub.id);
    const safeExamId = sub.examId ? toValidUuid(sub.examId) : null;
    const isRealStudent =
      Boolean(sub.studentId) && sub.studentId !== 'guest' && sub.studentId !== 'admin-amr';
    const safeStudentId = isRealStudent ? toValidUuid(sub.studentId) : null;

    // Ensure parent rows exist if context was provided so FK constraints never fail
    if (context?.exam && safeExamId) {
      await syncExamToSupabase(context.exam);
    }
    if (context?.student && isRealStudent && context.student.role !== 'admin') {
      await syncProfileToSupabase(context.student);
    }

    const syncSubmissionMeta = async () => {
      try {
        await client.from('assignments').upsert({
          id: toValidUuid(`sub_meta:${safeId}`),
          title: `result:${sub.studentName || 'student'}`,
          type: 'submission_meta',
          grade: safeStudentId || sub.studentId || 'guest',
          questions: {
            submissionId: safeId,
            examId: safeExamId || sub.examId,
            studentId: safeStudentId || sub.studentId,
            studentName: sub.studentName,
            studentCode: sub.studentCode,
            score: Number(sub.score) || 0,
            totalPoints: Number(sub.totalPoints) || 0,
            answers: sub.answers || {},
            hasEssayQuestions: sub.hasEssayQuestions,
            mcqScore: sub.mcqScore,
            mcqTotal: sub.mcqTotal,
            essayGradingPending: sub.essayGradingPending,
            questionGrades: sub.questionGrades,
            autoZeroedQuestions: sub.autoZeroedQuestions,
            teacherFeedback: sub.teacherFeedback,
            gradedAt: sub.gradedAt,
            gradedBy: sub.gradedBy,
            startedAt: sub.startedAt,
            attemptNumber: sub.attemptNumber,
            solvedCount: sub.solvedCount,
            correctCount: sub.correctCount,
            submittedAt: sub.submittedAt,
          },
          created_at: sub.submittedAt || new Date().toISOString(),
        });
      } catch {
        // Non-blocking fallback
      }
    };

    const buildPayload = (studentIdValue: string | null, assignmentIdValue: string | null) => ({
      id: safeId,
      assignment_id: assignmentIdValue,
      student_id: studentIdValue,
      score: Math.round(Number(sub.score) || 0),
      total_score: Math.round(Number(sub.totalPoints) || 0),
      submitted_at: sub.submittedAt || new Date().toISOString(),
    });

    let { error } = await client.from('exam_results').upsert(buildPayload(safeStudentId, safeExamId));

    // If FK failed because parent wasn't synced yet, try syncing or fallback safely
    if (error && error.code === '23503') {
      if (error.message?.includes('assignment_id') && context?.exam) {
        await syncExamToSupabase(context.exam);
      }
      if (error.message?.includes('student_id')) {
        if (context?.student && isRealStudent) {
          await syncProfileToSupabase(context.student);
        }
        // Retry once with parent ensured; if still blocked by FK, save with null student_id rather than losing result
        const retry1 = await client.from('exam_results').upsert(buildPayload(safeStudentId, safeExamId));
        if (!retry1.error) {
          await syncSubmissionMeta();
          return { success: true };
        }
        if (retry1.error.code === '23503' && retry1.error.message?.includes('student_id')) {
          const retryNullStudent = await client.from('exam_results').upsert(buildPayload(null, safeExamId));
          if (!retryNullStudent.error) {
            await syncSubmissionMeta();
            return { success: true };
          }
          error = retryNullStudent.error;
        } else {
          error = retry1.error;
        }
      } else {
        const retry2 = await client.from('exam_results').upsert(buildPayload(safeStudentId, safeExamId));
        if (!retry2.error) {
          await syncSubmissionMeta();
          return { success: true };
        }
        error = retry2.error;
      }
    }

    if (error) {
      return handleSupabaseError('exam_results', error);
    }
    await syncSubmissionMeta();
    return { success: true };
  } catch (e: any) {
    console.warn('Supabase sync exam_results error:', e);
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

export async function syncQuestionBankProgressToSupabase(
  studentId: string,
  attempts: Record<string, QuestionBankAttemptEntry>
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !studentId || studentId === 'guest') return false;
  try {
    const safeStudent = toValidUuid(studentId);
    const { error } = await client.from('assignments').upsert({
      id: toValidUuid(`qb_progress:${safeStudent}`),
      title: `qb:${safeStudent}`,
      type: 'question_bank_progress',
      grade: safeStudent,
      questions: {
        studentId: safeStudent,
        attempts,
        updatedAt: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchQuestionBankProgressFromSupabase(
  studentId: string
): Promise<Record<string, QuestionBankAttemptEntry> | null> {
  const client = getSupabaseClient();
  if (!client || !studentId || studentId === 'guest') return null;
  try {
    const safeStudent = toValidUuid(studentId);
    const { data, error } = await client
      .from('assignments')
      .select('questions')
      .eq('id', toValidUuid(`qb_progress:${safeStudent}`))
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const raw = data[0]?.questions;
    if (raw && typeof raw === 'object' && raw.attempts && typeof raw.attempts === 'object') {
      return raw.attempts as Record<string, QuestionBankAttemptEntry>;
    }
    return null;
  } catch {
    return null;
  }
}

// ==========================================
// 6. REDEEM CODES CRUD (table: redeem_codes + full meta relay in assignments)
// Live columns: id, code, amount, is_used, used_by, created_at
// ==========================================
export async function fetchRedeemCodesFromSupabase(): Promise<RedeemCode[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const [codesRes, metaRes] = await Promise.all([
      client.from('redeem_codes').select('*').order('created_at', { ascending: false }),
      client.from('assignments').select('*').eq('type', 'redeem_code_meta'),
    ]);
    if (codesRes.error && metaRes.error) return null;

    const metaMap = new Map<string, Partial<RedeemCode>>();
    if (!metaRes.error && Array.isArray(metaRes.data)) {
      metaRes.data.forEach((row: any) => {
        const q = row?.questions;
        if (q && typeof q === 'object' && q.code) {
          metaMap.set(String(q.code).trim().toUpperCase(), q as Partial<RedeemCode>);
        }
      });
    }

    const baseRows = Array.isArray(codesRes.data) ? codesRes.data : [];
    const seenCodes = new Set<string>();
    const combined: RedeemCode[] = baseRows.map((row: any) => {
      const upper = String(row.code || '').trim().toUpperCase();
      seenCodes.add(upper);
      const m = metaMap.get(upper);
      const rowUsed = row.used_count !== undefined ? Number(row.used_count) : row.is_used ? 1 : 0;
      const metaUsed = m?.usedCount !== undefined ? Number(m.usedCount) : 0;
      return {
        code: row.code,
        amount: Number(m?.amount ?? row.amount) || 0,
        maxUses: Number(m?.maxUses ?? row.max_uses ?? 1) || 1,
        usedCount: Math.max(rowUsed, metaUsed),
        codeType: m?.codeType || (m?.courseId || row.course_id ? 'course' : 'balance'),
        courseId: m?.courseId || row.course_id || undefined,
        targetCourseTitle: m?.targetCourseTitle || undefined,
        paymentMethodId: m?.paymentMethodId || undefined,
        paymentMethodName: m?.paymentMethodName || undefined,
        createdBy: m?.createdBy || row.created_by || 'General Admin',
        createdAt: m?.createdAt || row.created_at || new Date().toISOString(),
      };
    });

    // Include any meta-only codes in case redeem_codes RLS blocked an insert
    metaMap.forEach((m, upper) => {
      if (!seenCodes.has(upper) && m.code) {
        combined.push({
          code: m.code,
          amount: Number(m.amount) || 0,
          maxUses: Number(m.maxUses) || 1,
          usedCount: Number(m.usedCount) || 0,
          codeType: m.codeType || (m.courseId ? 'course' : 'balance'),
          courseId: m.courseId,
          targetCourseTitle: m.targetCourseTitle,
          paymentMethodId: m.paymentMethodId,
          paymentMethodName: m.paymentMethodName,
          createdBy: m.createdBy || 'General Admin',
          createdAt: m.createdAt || new Date().toISOString(),
        });
      }
    });

    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (e) {
    console.warn('Supabase fetch codes error:', e);
    return null;
  }
}

export async function syncRedeemCodeToSupabase(code: RedeemCode, usedByStudentId?: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const cleanCode = code.code.trim().toUpperCase();
    const payload: any = {
      id: toValidUuid(`redeem:${cleanCode}`),
      code: cleanCode,
      amount: Number(code.amount) || 0,
      is_used: code.usedCount >= code.maxUses,
      created_at: code.createdAt || new Date().toISOString(),
    };
    if (usedByStudentId && usedByStudentId !== 'guest' && usedByStudentId !== 'admin-amr') {
      payload.used_by = toValidUuid(usedByStudentId);
    }
    const metaPayload = {
      id: toValidUuid(`redeem_meta:${cleanCode}`),
      title: cleanCode,
      type: 'redeem_code_meta',
      grade: code.codeType || 'balance',
      questions: {
        ...code,
        code: cleanCode,
      },
      created_at: code.createdAt || new Date().toISOString(),
    };
    const [r1, r2] = await Promise.all([
      client.from('redeem_codes').upsert(payload),
      client.from('assignments').upsert(metaPayload),
    ]);
    return !r1.error || !r2.error;
  } catch {
    return false;
  }
}

export async function syncRedeemCodesBulkToSupabase(codes: RedeemCode[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || codes.length === 0) return false;
  try {
    // Process in chunks of 250 so bulk batches stay fast & reliable
    for (let i = 0; i < codes.length; i += 250) {
      const chunk = codes.slice(i, i + 250);
      const formatted = chunk.map((c) => {
        const cleanCode = c.code.trim().toUpperCase();
        return {
          id: toValidUuid(`redeem:${cleanCode}`),
          code: cleanCode,
          amount: Number(c.amount) || 0,
          is_used: c.usedCount >= c.maxUses,
          created_at: c.createdAt || new Date().toISOString(),
        };
      });
      const metaRows = chunk.map((c) => {
        const cleanCode = c.code.trim().toUpperCase();
        return {
          id: toValidUuid(`redeem_meta:${cleanCode}`),
          title: cleanCode,
          type: 'redeem_code_meta',
          grade: c.codeType || 'balance',
          questions: { ...c, code: cleanCode },
          created_at: c.createdAt || new Date().toISOString(),
        };
      });
      await Promise.all([
        client.from('redeem_codes').upsert(formatted),
        client.from('assignments').upsert(metaRows),
      ]);
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteRedeemCodeFromSupabase(codeStr: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const cleanCode = codeStr.trim().toUpperCase();
    await Promise.all([
      client.from('redeem_codes').delete().eq('code', codeStr),
      client.from('redeem_codes').delete().eq('code', cleanCode),
      client.from('assignments').delete().eq('id', toValidUuid(`redeem_meta:${cleanCode}`)),
    ]);
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// 7. PAYMENT REQUESTS CRUD (table: payment_requests + Supabase assignments relay)
// ==========================================
export async function fetchPaymentsFromSupabase(): Promise<PaymentRequest[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const [prRes, asgRes, profRes] = await Promise.all([
      client.from('payment_requests').select('*').order('created_at', { ascending: false }),
      client
        .from('assignments')
        .select('*')
        .eq('type', 'payment_request')
        .order('created_at', { ascending: false }),
      client.from('profiles').select('id, full_name, phone, student_code'),
    ]);

    if (prRes.error && asgRes.error) return null;

    const profById = new Map<string, any>();
    if (!profRes.error && Array.isArray(profRes.data)) {
      profRes.data.forEach((p: any) => profById.set(String(p.id), p));
    }

    const mergedMap = new Map<string, PaymentRequest>();

    if (!prRes.error && Array.isArray(prRes.data)) {
      prRes.data.forEach((row: any) => {
        const sid = row.user_id || row.student_id || '';
        const matchedProf = sid ? profById.get(String(sid)) : undefined;
        const normId = toValidUuid(row.id);
        mergedMap.set(normId, {
          id: normId,
          studentId: sid,
          studentName: row.student_name || matchedProf?.full_name || 'English Student',
          studentPhone: row.student_phone || matchedProf?.phone || '',
          studentCode: row.student_code || matchedProf?.student_code || 'ENG',
          method: row.payment_method || row.method || 'vodafone_cash',
          amount: Number(row.amount) || 0,
          receiptImage: row.receipt_url || row.receipt_image || '',
          referenceNumber: row.reference_number || '',
          status: row.status || 'pending',
          notes: row.notes || '',
          createdAt: row.created_at || new Date().toISOString(),
          reviewedAt: row.reviewed_at || undefined,
        });
      });
    }

    if (!asgRes.error && Array.isArray(asgRes.data)) {
      asgRes.data.forEach((row: any) => {
        const meta = row?.questions;
        if (!meta || typeof meta !== 'object') return;
        const normId = toValidUuid(meta.id || row.id);
        const existing = mergedMap.get(normId);
        const sid = meta.studentId || existing?.studentId || '';
        const matchedProf = sid ? profById.get(String(sid)) : undefined;
        mergedMap.set(normId, {
          id: normId,
          studentId: sid,
          studentName: meta.studentName || existing?.studentName || matchedProf?.full_name || row.title || 'English Student',
          studentPhone: meta.studentPhone || existing?.studentPhone || matchedProf?.phone || '',
          studentCode: meta.studentCode || existing?.studentCode || matchedProf?.student_code || 'ENG',
          method: meta.method || existing?.method || 'vodafone_cash',
          amount: Number(meta.amount ?? existing?.amount ?? 0),
          receiptImage: meta.receiptImage || existing?.receiptImage || '',
          referenceNumber: meta.referenceNumber || existing?.referenceNumber || '',
          status: existing?.status && existing.status !== 'pending' && meta.status === 'pending' ? existing.status : meta.status || existing?.status || 'pending',
          notes: meta.notes || existing?.notes || '',
          createdAt: meta.createdAt || existing?.createdAt || row.created_at || new Date().toISOString(),
          reviewedAt: meta.reviewedAt || existing?.reviewedAt || undefined,
        });
      });
    }

    return Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (e) {
    console.warn('Supabase fetch payments error:', e);
    return null;
  }
}

export async function syncPaymentToSupabase(pay: PaymentRequest): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true, error: 'Supabase client not found' };
  try {
    const safeId = toValidUuid(pay.id);
    const normalizedStudentId = pay.studentId && pay.studentId !== 'guest' ? toValidUuid(pay.studentId) : '';

    // 1. Primary persistent full-metadata record in Supabase `assignments` (type: 'payment_request')
    const relayPayload = {
      id: toValidUuid(`payment:${safeId}`),
      title: pay.studentName || 'Balance Top-up Request',
      type: 'payment_request',
      grade: pay.method || 'vodafone_cash',
      questions: {
        ...pay,
        id: safeId,
        studentId: normalizedStudentId || pay.studentId,
      },
      created_at: pay.createdAt || new Date().toISOString(),
    };
    const { error: relayErr } = await client.from('assignments').upsert(relayPayload);

    // 2. Also attempt direct upsert to `payment_requests` table
    const { error: prErr } = await client.from('payment_requests').upsert({
      id: safeId,
      user_id: normalizedStudentId || null,
      amount: Number(pay.amount) || 0,
      payment_method: pay.method,
      receipt_url: pay.receiptImage || null,
      status: pay.status,
      created_at: pay.createdAt || new Date().toISOString(),
    });

    if (!relayErr) {
      return { success: true };
    }
    if (!prErr) {
      return { success: true };
    }
    return handleSupabaseError('payment_requests', prErr || relayErr);
  } catch (e: any) {
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

export async function deletePaymentFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const safeId = toValidUuid(id);
    await Promise.all([
      client.from('payment_requests').delete().eq('id', safeId),
      client.from('assignments').delete().eq('id', toValidUuid(`payment:${safeId}`)),
    ]);
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// 8. PLATFORM SETTINGS (table: platform_settings + assignments metadata)
// Live columns: id (int), academic_year, logo_url, updated_at
// ==========================================
export async function fetchSettingsFromSupabase(): Promise<Record<string, string> | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const [psRes, metaRes] = await Promise.all([
      client.from('platform_settings').select('*').limit(1),
      client
        .from('assignments')
        .select('questions')
        .eq('id', toValidUuid('system:platform_settings'))
        .limit(1),
    ]);

    const map: Record<string, string> = {};
    if (!psRes.error && Array.isArray(psRes.data) && psRes.data.length > 0) {
      const row: any = psRes.data[0];
      if (row.academic_year) map.academicYear = String(row.academic_year);
    }

    if (!metaRes.error && Array.isArray(metaRes.data) && metaRes.data.length > 0) {
      const meta = metaRes.data[0]?.questions;
      if (meta && typeof meta === 'object') {
        Object.entries(meta).forEach(([k, v]) => {
          if (v !== undefined && v !== null && k !== 'supabaseUrl' && k !== 'supabaseAnonKey') {
            map[k] = String(v);
          }
        });
      }
    }

    return Object.keys(map).length > 0 ? map : null;
  } catch {
    return null;
  }
}

export async function syncSettingsToSupabase(settings: Record<string, string>): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true };
  try {
    const safeMeta: Record<string, string> = {};
    Object.entries(settings).forEach(([k, v]) => {
      if (v !== undefined && v !== null && k !== 'supabaseUrl' && k !== 'supabaseAnonKey') {
        safeMeta[k] = String(v);
      }
    });

    const [psRes, metaRes] = await Promise.all([
      client.from('platform_settings').upsert({
        id: 1,
        academic_year: settings.academicYear || '2026',
        updated_at: new Date().toISOString(),
      }),
      client.from('assignments').upsert({
        id: toValidUuid('system:platform_settings'),
        title: settings.platformName || 'Platform General Settings',
        type: 'platform_settings_meta',
        grade: 'All',
        questions: {
          ...safeMeta,
          updatedAt: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      }),
    ]);

    if (metaRes.error && psRes.error) {
      return handleSupabaseError('platform_settings', metaRes.error || psRes.error);
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

// ==========================================
// 8B. PAYMENT METHODS CONFIG, NOTIFICATIONS (VOICE + TEXT) & SECRETARIES
// ==========================================
export async function fetchPaymentMethodsFromSupabase(): Promise<PaymentMethodItem[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('assignments')
      .select('questions')
      .eq('id', toValidUuid('system:payment_methods'))
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const raw = data[0]?.questions;
    if (raw && typeof raw === 'object' && Array.isArray(raw.methods)) {
      return raw.methods as PaymentMethodItem[];
    }
    return null;
  } catch {
    return null;
  }
}

export async function syncPaymentMethodsToSupabase(methods: PaymentMethodItem[]): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true };
  try {
    const { error } = await client.from('assignments').upsert({
      id: toValidUuid('system:payment_methods'),
      title: 'Payment Methods Settings',
      type: 'payment_methods_config',
      grade: 'All',
      questions: {
        methods,
        updatedAt: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    });
    if (error) return handleSupabaseError('payment_methods_config', error);
    return { success: true };
  } catch (e: any) {
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

export async function fetchNotificationsFromSupabase(): Promise<PlatformNotification[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('assignments')
      .select('*')
      .eq('type', 'platform_notification')
      .order('created_at', { ascending: false });
    if (error || !data) return null;
    return data
      .map((row: any) => {
        const q = row?.questions;
        if (!q || typeof q !== 'object') return null;
        return {
          id: q.id || row.id,
          title: q.title || row.title || 'Important Notification',
          content: q.content || '',
          targetGrade: normalizeGrade(q.targetGrade || row.grade || 'All'),
          isUrgent: Boolean(q.isUrgent),
          audioUrl: q.audioUrl || undefined,
          audioDurationSeconds: q.audioDurationSeconds || undefined,
          createdBy: q.createdBy || 'Miss Asmaa',
          createdAt: q.createdAt || row.created_at || new Date().toISOString(),
          isRead: false,
        } as PlatformNotification;
      })
      .filter(Boolean) as PlatformNotification[];
  } catch {
    return null;
  }
}

export async function syncNotificationToSupabase(notif: PlatformNotification): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true };
  try {
    const safeId = toValidUuid(`notif:${notif.id}`);
    const { error } = await client.from('assignments').upsert({
      id: safeId,
      title: notif.title,
      type: 'platform_notification',
      grade: notif.targetGrade || 'All',
      questions: notif,
      created_at: notif.createdAt || new Date().toISOString(),
    });
    if (error) return handleSupabaseError('platform_notification', error);
    return { success: true };
  } catch (e: any) {
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

export async function deleteNotificationFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    await client.from('assignments').delete().eq('id', toValidUuid(`notif:${id}`));
    return true;
  } catch {
    return false;
  }
}

export async function fetchSecretariesFromSupabase(): Promise<SecretaryMember[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('assignments')
      .select('questions')
      .eq('id', toValidUuid('system:secretaries_list'))
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const raw = data[0]?.questions;
    if (raw && typeof raw === 'object' && Array.isArray(raw.secretaries)) {
      return raw.secretaries as SecretaryMember[];
    }
    return null;
  } catch {
    return null;
  }
}

export async function syncSecretariesToSupabase(secretaries: SecretaryMember[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('assignments').upsert({
      id: toValidUuid('system:secretaries_list'),
      title: 'Secretaries List',
      type: 'secretaries_config',
      grade: 'All',
      questions: {
        secretaries,
        updatedAt: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

// ==========================================
// 8C. HONOR BOARD CRUD (assignments type: 'honor_student')
// ==========================================
export async function fetchHonorStudentsFromSupabase(): Promise<HonorStudent[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('assignments')
      .select('*')
      .eq('type', 'honor_student')
      .order('created_at', { ascending: false });
    if (error || !data) return null;
    return data
      .map((row: any) => {
        const q = row?.questions;
        if (!q || typeof q !== 'object') return null;
        return {
          id: q.id || row.id,
          studentName: q.studentName || row.title || 'Top Student',
          governorate: q.governorate || row.grade || 'Cairo',
          score: Number(q.score ?? 60),
          maxScore: Number(q.maxScore ?? 60),
          rank: Number(q.rank ?? 1),
          titleBadge: q.titleBadge || 'Top Achiever 🏆',
          notes: q.notes || undefined,
          createdAt: q.createdAt || row.created_at || new Date().toISOString(),
        } as HonorStudent;
      })
      .filter(Boolean)
      .sort((a, b) => (a as HonorStudent).rank - (b as HonorStudent).rank) as HonorStudent[];
  } catch {
    return null;
  }
}

export async function syncHonorStudentToSupabase(item: HonorStudent): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { success: false, isLocalFallback: true, error: 'Unable to connect to Supabase' };
  try {
    const safeId = toValidUuid(item.id);
    const { error } = await client.from('assignments').upsert({
      id: toValidUuid(`honor:${safeId}`),
      title: item.studentName,
      type: 'honor_student',
      grade: item.governorate || 'Cairo',
      questions: { ...item, id: safeId },
      created_at: item.createdAt || new Date().toISOString(),
    });
    if (error) return handleSupabaseError('honor_student', error);
    return { success: true };
  } catch (e: any) {
    return { success: false, isLocalFallback: true, error: e?.message };
  }
}

export async function deleteHonorStudentFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const safeId = toValidUuid(id);
    await Promise.all([
      client.from('assignments').delete().eq('id', toValidUuid(`honor:${safeId}`)),
      client.from('assignments').delete().eq('id', toValidUuid(`honor:${id}`)),
    ]);
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// 8D. PRIVATE TECHNICAL SUPPORT & Q&A THREADS (Supabase Table + Files Storage Cleanup)
// ==========================================
let supportMessagesTableProbeResult: boolean | null = null;

async function checkSupportMessagesTableExists(client: SupabaseClient): Promise<boolean> {
  if (supportMessagesTableProbeResult !== null) return supportMessagesTableProbeResult;
  try {
    const { error } = await client.from('support_messages').select('id').limit(1);
    if (error && (error.code === 'PGRST205' || error.code === '42P01' || /not find the table|does not exist/i.test(error.message || ''))) {
      supportMessagesTableProbeResult = false;
      return false;
    }
    supportMessagesTableProbeResult = !error;
    return !error;
  } catch {
    supportMessagesTableProbeResult = false;
    return false;
  }
}

function extractFilesBucketPathFromUrl(publicUrl?: string): string | null {
  if (!publicUrl || typeof publicUrl !== 'string') return null;
  const marker = '/storage/v1/object/public/Files/';
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  const rawPath = publicUrl.slice(idx + marker.length).split('?')[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

export async function fetchSupportThreadsFromSupabase(): Promise<SupportThread[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const hasDedicated = await checkSupportMessagesTableExists(client);
    const [asgRes, dedicatedRes] = await Promise.all([
      client
        .from('assignments')
        .select('*')
        .eq('type', 'support_ticket')
        .order('created_at', { ascending: false }),
      hasDedicated
        ? client.from('support_messages').select('*').order('updated_at', { ascending: false })
        : Promise.resolve({ data: null, error: null } as any),
    ]);

    if (asgRes.error && (!hasDedicated || dedicatedRes?.error)) {
      return null;
    }

    const merged = new Map<string, SupportThread>();

    if (!asgRes.error && Array.isArray(asgRes.data)) {
      asgRes.data.forEach((row: any) => {
        const q = row?.questions;
        if (!q || typeof q !== 'object') return;
        const id = String(q.id || row.id);
        merged.set(id, {
          id,
          ownerKey: String(q.ownerKey || row.grade || ''),
          studentId: q.studentId || undefined,
          studentName: q.studentName || row.title || 'Student / Visitor',
          studentCode: q.studentCode || undefined,
          studentPhone: q.studentPhone || undefined,
          studentGrade: q.studentGrade || undefined,
          pageNumber: q.pageNumber || undefined,
          questionNumber: q.questionNumber || undefined,
          status: q.status === 'answered' ? 'answered' : 'open',
          messages: Array.isArray(q.messages) ? q.messages : [],
          createdAt: q.createdAt || row.created_at || new Date().toISOString(),
          updatedAt: q.updatedAt || q.createdAt || row.created_at || new Date().toISOString(),
        });
      });
    }

    if (hasDedicated && !dedicatedRes?.error && Array.isArray(dedicatedRes.data)) {
      dedicatedRes.data.forEach((row: any) => {
        const id = String(row.id);
        const existing = merged.get(id);
        const rowUpdated = new Date(row.updated_at || row.created_at || 0).getTime();
        const existingUpdated = existing ? new Date(existing.updatedAt || existing.createdAt || 0).getTime() : 0;
        if (!existing || rowUpdated >= existingUpdated) {
          merged.set(id, {
            id,
            ownerKey: String(row.owner_key || existing?.ownerKey || ''),
            studentId: row.student_id || existing?.studentId || undefined,
            studentName: row.student_name || existing?.studentName || 'Student / Visitor',
            studentCode: row.student_code || existing?.studentCode || undefined,
            studentPhone: row.student_phone || existing?.studentPhone || undefined,
            studentGrade: row.student_grade || existing?.studentGrade || undefined,
            pageNumber: row.page_number || existing?.pageNumber || undefined,
            questionNumber: row.question_number || existing?.questionNumber || undefined,
            status: row.status === 'answered' ? 'answered' : 'open',
            messages: Array.isArray(row.messages) ? row.messages : existing?.messages || [],
            createdAt: row.created_at || existing?.createdAt || new Date().toISOString(),
            updatedAt: row.updated_at || row.created_at || existing?.updatedAt || new Date().toISOString(),
          });
        }
      });
    }

    return Array.from(merged.values()).sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );
  } catch (e) {
    console.warn('Supabase fetch support threads error:', e);
    return null;
  }
}

export async function syncSupportThreadToSupabase(thread: SupportThread): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, isLocalFallback: true, error: 'Unable to connect to Supabase database.' };
  }
  try {
    const safeId = toValidUuid(thread.id);
    const normalizedThread: SupportThread = {
      ...thread,
      id: safeId,
      updatedAt: thread.updatedAt || new Date().toISOString(),
    };

    const hasDedicated = await checkSupportMessagesTableExists(client);

    const assignmentsPromise = client.from('assignments').upsert({
      id: toValidUuid(`support:${safeId}`),
      title: normalizedThread.studentName || 'Support Question',
      type: 'support_ticket',
      grade: normalizedThread.ownerKey || 'guest',
      questions: normalizedThread,
      created_at: normalizedThread.createdAt || new Date().toISOString(),
    });

    const dedicatedPromise = hasDedicated
      ? client.from('support_messages').upsert({
          id: safeId,
          owner_key: normalizedThread.ownerKey,
          student_id: normalizedThread.studentId ? toValidUuid(normalizedThread.studentId) : null,
          student_name: normalizedThread.studentName,
          student_code: normalizedThread.studentCode || null,
          student_phone: normalizedThread.studentPhone || null,
          student_grade: normalizedThread.studentGrade || null,
          page_number: normalizedThread.pageNumber || null,
          question_number: normalizedThread.questionNumber || null,
          status: normalizedThread.status,
          messages: normalizedThread.messages,
          created_at: normalizedThread.createdAt || new Date().toISOString(),
          updated_at: normalizedThread.updatedAt || new Date().toISOString(),
        })
      : Promise.resolve({ error: null } as any);

    const [asgRes, dedRes] = await Promise.all([assignmentsPromise, dedicatedPromise]);

    if (asgRes.error && (!hasDedicated || dedRes?.error)) {
      return handleSupabaseError('support_ticket', asgRes.error || dedRes?.error);
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, isLocalFallback: true, error: e?.message || 'Failed to save to Supabase' };
  }
}

export async function deleteSupportThreadFromSupabase(
  threadOrId: string | Pick<SupportThread, 'id' | 'messages'>
): Promise<SupabaseSyncResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, isLocalFallback: true, error: 'Unable to connect to Supabase database.' };
  }
  try {
    const rawId = typeof threadOrId === 'string' ? threadOrId : threadOrId.id;
    const safeId = toValidUuid(rawId);
    const hasDedicated = await checkSupportMessagesTableExists(client);

    // 1. Collect any uploaded Storage media files (images & voice notes) to clean up from 'Files' bucket
    const storagePaths: string[] = [];
    if (typeof threadOrId !== 'string' && Array.isArray(threadOrId.messages)) {
      threadOrId.messages.forEach((msg) => {
        const imgPath = extractFilesBucketPathFromUrl(msg.imageUrl);
        if (imgPath) storagePaths.push(imgPath);
        const audioPath = extractFilesBucketPathFromUrl(msg.audioUrl);
        if (audioPath) storagePaths.push(audioPath);
      });
    }

    const ops: PromiseLike<any>[] = [
      client.from('assignments').delete().eq('id', toValidUuid(`support:${safeId}`)),
      client.from('assignments').delete().eq('id', toValidUuid(`support:${rawId}`)),
      client.from('assignments').delete().eq('id', safeId),
    ];

    if (hasDedicated) {
      ops.push(client.from('support_messages').delete().eq('id', safeId));
    }

    if (storagePaths.length > 0) {
      ops.push(client.storage.from('Files').remove(storagePaths));
    }

    const results = await Promise.all(ops);
    const primaryDeleteErr = results[0]?.error;
    if (primaryDeleteErr) {
      return handleSupabaseError('support_ticket', primaryDeleteErr);
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to delete from Supabase' };
  }
}

// ==========================================
// 9. REAL-TIME SUBSCRIPTION ACROSS ALL CORE TABLES
// ==========================================
export function subscribeToSupabaseRealtime(onRemoteChange: (table: string) => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const tables = ['profiles', 'courses', 'documents', 'assignments', 'exam_results', 'payment_requests'];
  const channel: RealtimeChannel = client.channel('amr-platform-realtime-sync');

  tables.forEach((table) => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => {
        onRemoteChange(table);
      }
    );
  });

  channel.subscribe();

  return () => {
    try {
      client.removeChannel(channel);
    } catch {
      // Ignore cleanup errors
    }
  };
}

// ==========================================
// 10. DIRECT SUPABASE STORAGE UPLOADER
// ==========================================
export async function uploadFileToSupabaseStorage(
  file: File,
  bucketName: 'Files' | 'Lectures' = 'Files'
): Promise<{ success: boolean; url: string; bucket?: string; path?: string; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    const errMsg = 'Unable to connect to Supabase: Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured.';
    console.error('❌ Supabase Storage client not initialized:', errMsg);
    return { success: false, url: '', bucket: bucketName, error: errMsg };
  }

  const filePath = buildSafeStoragePath(file.name, 'uploads');

  try {
    const { data, error: uploadError } = await client.storage
      .from(bucketName)
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type || 'application/octet-stream',
      });

    if (uploadError) {
      console.error(`❌ Upload failed to ${bucketName}/${filePath}:`, uploadError);
      return {
        success: false,
        url: '',
        bucket: bucketName,
        path: filePath,
        error: uploadError.message || 'Failed to upload file to Supabase Storage',
      };
    }

    const uploadedPath = data?.path || filePath;
    const { data: publicData } = client.storage.from(bucketName).getPublicUrl(uploadedPath);
    const publicUrl = publicData?.publicUrl || '';

    if (!publicUrl) {
      const urlErr = 'Uploaded successfully, but failed to retrieve the public URL from getPublicUrl.';
      console.error(`❌ ${urlErr}`, { bucket: bucketName, path: uploadedPath });
      return { success: false, url: '', bucket: bucketName, path: uploadedPath, error: urlErr };
    }

    console.log(`✅ Uploaded to ${bucketName}/${uploadedPath}`, { publicUrl });
    return { success: true, url: publicUrl, bucket: bucketName, path: uploadedPath };
  } catch (err: any) {
    const errMsg = err?.message || 'An unexpected error occurred while uploading to Supabase Storage';
    console.error(`❌ Exception during upload to ${bucketName}/${filePath}:`, err);
    return { success: false, url: '', bucket: bucketName, path: filePath, error: errMsg };
  }
}
