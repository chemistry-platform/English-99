/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AssessmentForm,
  DurationUnit,
  ExamChoice,
  ExamQuestion,
  QuestionAuditEntry,
} from '../types';
import { getChoiceLetter, getCurrentLanguage, getTranslations } from './translations';

const ARABIC_LETTER_POOL = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
const LATIN_LETTER_POOL = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

const LEADING_OPTION_PREFIX_RE =
  /^\s*(?:[\(\[\{]?\s*[أاآبجدهـوزحطيA-Ja-j0-9]{1,2}\s*[\)\.\-:\]\}])\s*/u;

export function stripOptionPrefix(raw: string): string {
  return String(raw || '')
    .replace(LEADING_OPTION_PREFIX_RE, '')
    .trim();
}

export function normalizeArabicText(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) return '';
  // Remove Arabic diacritics / tatweel
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  // Convert Eastern Arabic digits to Western digits
  s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  // Normalize Arabic letters
  s = s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  // Normalize purely numeric answers ("05" === "5", "5.0" === "5")
  if (/^[+-]?\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(n);
  }
  return s;
}

export function getArabicChoiceLetter(index: number): string {
  return getChoiceLetter(index, getCurrentLanguage());
}

export function isAllOfTheAboveChoice(text: string): boolean {
  const norm = normalizeArabicText(stripOptionPrefix(text));
  return (
    norm.includes('جميع ما سبق') ||
    norm.includes('كل ما سبق') ||
    norm.includes('كل ما ذكر') ||
    norm.includes('جميع الاجابات') ||
    norm.includes('all of the above')
  );
}

function matchLetterIndex(raw: string, totalChoices: number): number {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[\(\)\.\-:\[\]\s]/g, '')
    .replace(/[أإآٱ]/g, 'ا');
  if (!cleaned) return -1;

  for (let i = 0; i < totalChoices; i++) {
    const ar = (ARABIC_LETTER_POOL[i] || '').replace(/[أإآٱ]/g, 'ا');
    const en = LATIN_LETTER_POOL[i] || '';
    if (
      cleaned === ar ||
      (i === 0 && (cleaned === 'ا' || cleaned === 'أ')) ||
      (i === 4 && (cleaned === 'ه' || cleaned === 'هـ')) ||
      cleaned.toLowerCase() === en ||
      cleaned === String(i + 1)
    ) {
      return i;
    }
  }
  return -1;
}

export function extractQuestionImageUrls(q: Partial<ExamQuestion>): string[] {
  const urls: string[] = [];
  if (Array.isArray(q.imageUrls)) {
    q.imageUrls.forEach((u) => {
      const trimmed = String(u || '').trim();
      if (trimmed && !urls.includes(trimmed)) urls.push(trimmed);
    });
  }
  if (q.imageUrl) {
    const single = String(q.imageUrl).trim();
    if (single && !urls.includes(single)) urls.push(single);
  }
  return urls;
}

/**
 * Normalizes any new or legacy ExamQuestion so every MCQ option has an immutable choice_id
 * and correctChoiceIds is always reliably resolved.
 */
export function normalizeQuestion(q: ExamQuestion, fallbackIdx = 0): ExamQuestion {
  const qId = String(q.id || '').trim() || `q-${fallbackIdx + 1}`;
  const type: 'mcq' | 'essay' = q.type === 'essay' ? 'essay' : 'mcq';
  const imageUrls = extractQuestionImageUrls(q);
  const points = Number.isFinite(Number(q.points)) && Number(q.points) > 0 ? Number(q.points) : 2;

  if (type === 'essay') {
    return {
      ...q,
      id: qId,
      type: 'essay',
      question: String(q.question || '').trim(),
      correctAnswer: String(q.correctAnswer || q.explanation || '').trim(),
      explanation: String(q.explanation || q.correctAnswer || '').trim(),
      points,
      imageUrl: imageUrls[0] || undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      options: undefined,
      choices: undefined,
      correctChoiceIds: undefined,
    };
  }

  let choices: ExamChoice[] = [];
  if (Array.isArray(q.choices) && q.choices.length > 0) {
    choices = q.choices.map((c, idx) => ({
      id: String(c.id || '').trim() || `${qId}-c${idx + 1}`,
      text: stripOptionPrefix(c.text) || String(c.text || '').trim() || `Option ${idx + 1}`,
      imageUrl: c.imageUrl ? String(c.imageUrl).trim() : undefined,
    }));
  } else {
    const rawOpts = Array.isArray(q.options) && q.options.length > 0 ? q.options : [];
    choices = rawOpts.map((opt, idx) => ({
      id: `${qId}-c${idx + 1}`,
      text: stripOptionPrefix(opt) || String(opt || '').trim() || `Option ${idx + 1}`,
    }));
  }

  // Ensure at least 2 choices exist for MCQ
  if (choices.length === 0) {
    choices = [
      { id: `${qId}-c1`, text: 'Option 1' },
      { id: `${qId}-c2`, text: 'Option 2' },
      { id: `${qId}-c3`, text: 'Option 3' },
      { id: `${qId}-c4`, text: 'Option 4' },
    ];
  }

  // Resolve correctChoiceIds accurately from existing correctChoiceIds OR legacy correctAnswer
  const validIds = new Set(choices.map((c) => c.id));
  let correctChoiceIds: string[] = Array.isArray(q.correctChoiceIds)
    ? q.correctChoiceIds.filter((id) => validIds.has(id))
    : [];

  const rawCorrect = String(q.correctAnswer || '').trim();
  if (correctChoiceIds.length === 0 && rawCorrect) {
    // Direct choice_id match
    if (validIds.has(rawCorrect)) {
      correctChoiceIds = [rawCorrect];
    } else {
      // Exact or prefix-stripped or Arabic-normalized text match
      const normRaw = normalizeArabicText(rawCorrect);
      const normStripped = normalizeArabicText(stripOptionPrefix(rawCorrect));

      const matched = choices.filter((c) => {
        const normC = normalizeArabicText(c.text);
        return (
          normC === normRaw ||
          (normStripped !== '' && normC === normStripped) ||
          (q.options || []).some(
            (legacyOpt, idx) =>
              choices[idx]?.id === c.id && normalizeArabicText(legacyOpt) === normRaw
          )
        );
      });

      if (matched.length > 0) {
        correctChoiceIds = matched.map((m) => m.id);
      } else {
        // Fallback: letter / index match ("أ", "أ)", "B", "2")
        const letterIdx = matchLetterIndex(rawCorrect, choices.length);
        if (letterIdx >= 0 && choices[letterIdx]) {
          correctChoiceIds = [choices[letterIdx].id];
        } else {
          // Prefix-of-choice fallback (e.g. correctAnswer truncated or starts with same text)
          const startsMatch = choices.find((c) => {
            const normC = normalizeArabicText(c.text);
            return normStripped.length >= 2 && (normC.includes(normStripped) || normStripped.includes(normC));
          });
          if (startsMatch) {
            correctChoiceIds = [startsMatch.id];
          }
        }
      }
    }
  }

  if (correctChoiceIds.length === 0 && choices.length > 0) {
    correctChoiceIds = [choices[0].id];
  }

  const primaryCorrectText =
    choices
      .filter((c) => correctChoiceIds.includes(c.id))
      .map((c) => c.text)
      .join(', ') ||
    rawCorrect ||
    choices[0].text;

  const normalizedOptions = choices.map(
    (c, idx) => `${getArabicChoiceLetter(idx)}) ${c.text}`
  );

  return {
    ...q,
    id: qId,
    type: 'mcq',
    question: String(q.question || '').trim(),
    choices,
    correctChoiceIds,
    options: normalizedOptions,
    correctAnswer: primaryCorrectText,
    explanation: String(q.explanation || '').trim(),
    points,
    imageUrl: imageUrls[0] || undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
  };
}

export function normalizeQuestionsList(questions: ExamQuestion[]): ExamQuestion[] {
  return (Array.isArray(questions) ? questions : []).map((q, idx) => normalizeQuestion(q, idx));
}

/**
 * Parses a student's stored answer into one or more choice_ids.
 * Supports single choice_id, JSON array of choice_ids, legacy full option string, or letter.
 */
export function resolveSelectedChoiceIds(question: ExamQuestion, rawAnswer: unknown): string[] {
  const normQ = normalizeQuestion(question);
  const choices = normQ.choices || [];
  if (choices.length === 0) return [];
  const validIds = new Set(choices.map((c) => c.id));

  let rawValues: string[] = [];
  if (Array.isArray(rawAnswer)) {
    rawValues = rawAnswer.map((v) => String(v || '').trim()).filter(Boolean);
  } else {
    const str = String(rawAnswer ?? '').trim();
    if (!str) return [];
    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          rawValues = parsed.map((v) => String(v || '').trim()).filter(Boolean);
        }
      } catch {
        rawValues = [str];
      }
    } else {
      rawValues = [str];
    }
  }

  const resolved: string[] = [];
  rawValues.forEach((val) => {
    if (validIds.has(val)) {
      if (!resolved.includes(val)) resolved.push(val);
      return;
    }
    const normVal = normalizeArabicText(val);
    const normStripped = normalizeArabicText(stripOptionPrefix(val));
    const foundByText = choices.find((c, idx) => {
      const nc = normalizeArabicText(c.text);
      const legacyOpt = normQ.options?.[idx] ? normalizeArabicText(normQ.options[idx]) : '';
      return nc === normVal || (normStripped !== '' && nc === normStripped) || (legacyOpt !== '' && legacyOpt === normVal);
    });
    if (foundByText) {
      if (!resolved.includes(foundByText.id)) resolved.push(foundByText.id);
      return;
    }
    const letterIdx = matchLetterIndex(val, choices.length);
    if (letterIdx >= 0 && choices[letterIdx] && !resolved.includes(choices[letterIdx].id)) {
      resolved.push(choices[letterIdx].id);
    }
  });

  return resolved;
}

export function encodeSelectedChoiceIds(choiceIds: string[]): string {
  const unique = Array.from(new Set(choiceIds.filter(Boolean)));
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return JSON.stringify(unique);
}

export function getStudentAnswerDisplay(question: ExamQuestion, rawAnswer: unknown): string {
  if (question.type === 'essay') {
    return String(rawAnswer ?? '').trim();
  }
  const normQ = normalizeQuestion(question);
  const selectedIds = resolveSelectedChoiceIds(normQ, rawAnswer);
  if (selectedIds.length === 0) {
    return String(rawAnswer ?? '').trim();
  }
  const choices = normQ.choices || [];
  return selectedIds
    .map((id) => choices.find((c) => c.id === id)?.text || id)
    .join(', ');
}

export function getCorrectAnswerDisplay(question: ExamQuestion): string {
  if (question.type === 'essay') {
    return String(question.explanation || question.correctAnswer || '').trim();
  }
  const normQ = normalizeQuestion(question);
  const choices = normQ.choices || [];
  const ids = normQ.correctChoiceIds || [];
  const texts = ids.map((id) => choices.find((c) => c.id === id)?.text).filter(Boolean);
  return texts.length > 0 ? texts.join(', ') : String(normQ.correctAnswer || '').trim();
}

export function gradeQuestion(
  question: ExamQuestion,
  rawAnswer: unknown
): { isCorrect: boolean; awardedPoints: number; maxPoints: number } {
  const normQ = normalizeQuestion(question);
  const maxPoints = Number(normQ.points) || 0;

  if (normQ.type === 'essay') {
    // Essay questions are graded manually by the teacher (blank essays are auto-zeroed).
    return { isCorrect: false, awardedPoints: 0, maxPoints };
  }

  const selectedIds = resolveSelectedChoiceIds(normQ, rawAnswer);
  const expectedIds = normQ.correctChoiceIds || [];
  if (selectedIds.length === 0 || expectedIds.length === 0) {
    return { isCorrect: false, awardedPoints: 0, maxPoints };
  }

  if (expectedIds.length === 1 && selectedIds.length === 1) {
    const ok = selectedIds[0] === expectedIds[0];
    return { isCorrect: ok, awardedPoints: ok ? maxPoints : 0, maxPoints };
  }

  // Multi-select exact set equality
  const selectedSet = new Set(selectedIds);
  const expectedSet = new Set(expectedIds);
  const ok =
    selectedSet.size === expectedSet.size &&
    Array.from(expectedSet).every((id) => selectedSet.has(id));
  return { isCorrect: ok, awardedPoints: ok ? maxPoints : 0, maxPoints };
}

export function gradeAttemptQuestions(
  questions: ExamQuestion[],
  answers: Record<string, string>,
  existingGrades?: Record<string, number>
): {
  mcqScore: number;
  mcqTotal: number;
  totalPoints: number;
  correctCount: number;
  solvedCount: number;
  hasEssayQuestions: boolean;
  essayGradingPending: boolean;
  questionGrades: Record<string, number>;
  autoZeroedQuestions: string[];
  score: number;
} {
  const normalized = normalizeQuestionsList(questions);
  let mcqScore = 0;
  let mcqTotal = 0;
  let essayScore = 0;
  let totalPoints = 0;
  let correctCount = 0;
  let solvedCount = 0;
  let hasEssayQuestions = false;
  let nonEmptyEssayCount = 0;
  let gradedNonEmptyEssayCount = 0;
  const questionGrades: Record<string, number> = {};
  const autoZeroedQuestions: string[] = [];

  normalized.forEach((q) => {
    const pts = Number(q.points) || 0;
    totalPoints += pts;
    const rawAns = answers[q.id];
    const hasAns = String(rawAns ?? '').trim().length > 0;
    if (hasAns) solvedCount += 1;

    if (q.type === 'mcq') {
      mcqTotal += pts;
      // If a grievance approved this question earlier, respect explicit override in existingGrades
      if (existingGrades && existingGrades[q.id] !== undefined && existingGrades[q.id] >= pts) {
        questionGrades[q.id] = existingGrades[q.id];
        mcqScore += existingGrades[q.id];
        correctCount += 1;
      } else {
        const res = gradeQuestion(q, rawAns);
        questionGrades[q.id] = res.awardedPoints;
        mcqScore += res.awardedPoints;
        if (res.isCorrect) correctCount += 1;
      }
    } else {
      hasEssayQuestions = true;
      if (!hasAns) {
        autoZeroedQuestions.push(q.id);
        questionGrades[q.id] = 0;
      } else {
        nonEmptyEssayCount += 1;
        if (existingGrades && existingGrades[q.id] !== undefined) {
          const val = Math.min(pts, Math.max(0, Number(existingGrades[q.id]) || 0));
          questionGrades[q.id] = val;
          essayScore += val;
          gradedNonEmptyEssayCount += 1;
          if (val >= pts) correctCount += 1;
        } else {
          questionGrades[q.id] = 0;
        }
      }
    }
  });

  const essayGradingPending = hasEssayQuestions && nonEmptyEssayCount > gradedNonEmptyEssayCount;
  return {
    mcqScore,
    mcqTotal,
    totalPoints,
    correctCount,
    solvedCount,
    hasEssayQuestions,
    essayGradingPending,
    questionGrades,
    autoZeroedQuestions,
    score: mcqScore + essayScore,
  };
}

function fisherYates<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Generates deterministic stored per-student per-attempt question & choice orders,
 * keeping questions with the same groupId together and keeping "جميع ما سبق" last.
 */
export function buildAttemptShuffleOrders(
  questions: ExamQuestion[],
  shuffleEnabled: boolean
): { questionOrder: string[]; choiceOrders: Record<string, string[]> } {
  const normalized = normalizeQuestionsList(questions);

  if (!shuffleEnabled) {
    const choiceOrders: Record<string, string[]> = {};
    normalized.forEach((q) => {
      if (q.type === 'mcq' && q.choices) {
        choiceOrders[q.id] = q.choices.map((c) => c.id);
      }
    });
    return {
      questionOrder: normalized.map((q) => q.id),
      choiceOrders,
    };
  }

  // Group clusters by non-empty groupId while preserving relative order inside each cluster
  const buckets: ExamQuestion[][] = [];
  const groupBucketIdx = new Map<string, number>();

  normalized.forEach((q) => {
    const gKey = (q.groupId || '').trim();
    if (!gKey) {
      buckets.push([q]);
    } else if (groupBucketIdx.has(gKey)) {
      buckets[groupBucketIdx.get(gKey)!].push(q);
    } else {
      groupBucketIdx.set(gKey, buckets.length);
      buckets.push([q]);
    }
  });

  const shuffledBuckets = fisherYates(buckets);
  const questionOrder = shuffledBuckets.flat().map((q) => q.id);

  const choiceOrders: Record<string, string[]> = {};
  normalized.forEach((q) => {
    if (q.type !== 'mcq' || !q.choices) return;
    if (q.lockChoiceOrder) {
      choiceOrders[q.id] = q.choices.map((c) => c.id);
      return;
    }
    const pinnedBottom = q.choices.filter((c) => isAllOfTheAboveChoice(c.text));
    const regular = q.choices.filter((c) => !isAllOfTheAboveChoice(c.text));
    choiceOrders[q.id] = [...fisherYates(regular), ...pinnedBottom].map((c) => c.id);
  });

  return { questionOrder, choiceOrders };
}

export function applyAttemptOrderToQuestions(
  questions: ExamQuestion[],
  questionOrder?: string[],
  choiceOrders?: Record<string, string[]>
): ExamQuestion[] {
  const normalized = normalizeQuestionsList(questions);
  const byId = new Map(normalized.map((q) => [q.id, q]));

  const orderedQuestions: ExamQuestion[] = [];
  if (Array.isArray(questionOrder) && questionOrder.length > 0) {
    questionOrder.forEach((id) => {
      const found = byId.get(id);
      if (found) orderedQuestions.push(found);
    });
    normalized.forEach((q) => {
      if (!orderedQuestions.some((o) => o.id === q.id)) orderedQuestions.push(q);
    });
  } else {
    orderedQuestions.push(...normalized);
  }

  return orderedQuestions.map((q) => {
    if (q.type !== 'mcq' || !q.choices) return q;
    const orderIds = choiceOrders?.[q.id];
    if (!Array.isArray(orderIds) || orderIds.length === 0) return q;
    const cById = new Map(q.choices.map((c) => [c.id, c]));
    const reordered: ExamChoice[] = [];
    orderIds.forEach((cid) => {
      const c = cById.get(cid);
      if (c) reordered.push(c);
    });
    q.choices.forEach((c) => {
      if (!reordered.some((r) => r.id === c.id)) reordered.push(c);
    });
    return {
      ...q,
      choices: reordered,
      options: reordered.map((c, idx) => `${getArabicChoiceLetter(idx)}) ${c.text}`),
    };
  });
}

export function buildTeacherAuditEntries(
  questions: ExamQuestion[],
  answers: Record<string, string>,
  questionGrades?: Record<string, number>,
  autoZeroed?: string[]
): QuestionAuditEntry[] {
  const t = getTranslations();
  return normalizeQuestionsList(questions).map((q) => {
    const rawAns = answers[q.id];
    const studentAnswerDisplay = getStudentAnswerDisplay(q, rawAns) || t.lib.notAnswered;
    const storedCorrectDisplay = getCorrectAnswerDisplay(q) || t.lib.notSpecified;
    const maxPoints = Number(q.points) || 0;

    if (q.type === 'essay') {
      const hasAns = String(rawAns ?? '').trim().length > 0;
      const explicitGrade = questionGrades?.[q.id];
      const isPending = hasAns && explicitGrade === undefined && !autoZeroed?.includes(q.id);
      const awarded = explicitGrade !== undefined ? Number(explicitGrade) : 0;
      return {
        questionId: q.id,
        questionText: q.question,
        studentAnswerDisplay,
        storedCorrectDisplay,
        awardedPoints: awarded,
        maxPoints,
        isCorrect: !isPending && awarded >= maxPoints && maxPoints > 0,
        isPendingEssay: isPending,
      };
    }

    const graded = gradeQuestion(q, rawAns);
    const awarded =
      questionGrades && questionGrades[q.id] !== undefined
        ? Number(questionGrades[q.id])
        : graded.awardedPoints;
    return {
      questionId: q.id,
      questionText: q.question,
      studentAnswerDisplay,
      storedCorrectDisplay,
      awardedPoints: awarded,
      maxPoints,
      isCorrect: awarded >= maxPoints && maxPoints > 0,
    };
  });
}

export function toMinutesFromUnit(value: number, unit: DurationUnit): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  if (unit === 'days') return Math.round(num * 24 * 60);
  if (unit === 'hours') return Math.round(num * 60);
  return Math.round(num);
}

export function fromMinutesToUnitValue(minutes: number | undefined | null, unit: DurationUnit): string {
  if (!minutes || minutes <= 0) return '';
  if (unit === 'days') {
    const days = minutes / (24 * 60);
    return Number.isInteger(days) ? String(days) : String(Number(days.toFixed(2)));
  }
  if (unit === 'hours') {
    const hrs = minutes / 60;
    return Number.isInteger(hrs) ? String(hrs) : String(Number(hrs.toFixed(2)));
  }
  return String(minutes);
}

export function formatDurationArabic(minutes?: number | null, unit?: DurationUnit): string {
  const t = getTranslations();
  if (!minutes || minutes <= 0) return t.common.openUnlimited;
  if (unit === 'days' || minutes % (24 * 60) === 0) {
    const d = minutes / (24 * 60);
    if (d >= 1) {
      const val = Number.isInteger(d) ? d : d.toFixed(1);
      return `${val} ${Number(val) === 1 ? t.common.day : t.common.days}`;
    }
  }
  if (unit === 'hours' || (minutes >= 60 && minutes % 60 === 0)) {
    const h = minutes / 60;
    const val = Number.isInteger(h) ? h : h.toFixed(1);
    return `${val} ${Number(val) === 1 ? t.common.hour : t.common.hours}`;
  }
  return `${minutes} ${minutes === 1 ? t.common.min : t.common.mins}`;
}

export function formatSecondsClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function getNextFormName(existingForms: Pick<AssessmentForm, 'name'>[]): string {
  const t = getTranslations();
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const existingNames = new Set(existingForms.map((f) => f.name.trim()));
  for (const letter of letters) {
    const candidate = `${t.lib.formPrefix} ${letter}`;
    if (!existingNames.has(candidate) && !existingNames.has(`Form ${letter}`) && !existingNames.has(`نموذج ${letter}`)) {
      return candidate;
    }
  }
  return `${t.lib.formPrefix} ${existingForms.length + 1}`;
}
