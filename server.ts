/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { PDFDocument } from 'pdf-lib';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure process doesn't die on transient errors
process.on('uncaughtException', (err) => {
  console.error('Server Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Server Unhandled Rejection:', reason);
});

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Body parsing with generous limit for image/document uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Official stable Gemini models (per gemini-api guidelines)
const PRIMARY_GEMINI_MODEL = 'gemini-4-hydrogen';
const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite';

function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err: any = new Error(
      'Gemini API key is not configured in server settings (Settings > Secrets). Please check the key and try again.'
    );
    err.status = 400;
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function classifyGeminiError(error: any): {
  status: number;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
} {
  if (error?.code === 'MISSING_API_KEY') {
    return {
      status: 400,
      message: error.message,
      retryable: false,
    };
  }

  const rawMsg = String(error?.message || error || '');
  const status = Number(error?.status || error?.statusCode || 0);

  if (
    status === 429 ||
    /RESOURCE_EXHAUSTED|quota|rate limit|429/i.test(rawMsg)
  ) {
    return {
      status: 429,
      message:
        'Temporary AI service usage limit exceeded (Quota / Rate Limit). Please wait a few seconds and try again, or upgrade your key plan in Settings > Secrets.',
      retryable: true,
      retryAfterSeconds: 5,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|PERMISSION_DENIED|expired|unauthorized/i.test(rawMsg)
  ) {
    return {
      status: status || 403,
      message:
        'Gemini API key is invalid or expired. Please check or update the key in Settings > Secrets.',
      retryable: false,
    };
  }

  if (status === 404 || /NOT_FOUND|not found|deprecated/i.test(rawMsg)) {
    return {
      status: 404,
      message:
        'Unable to reach the requested AI model. Please try again shortly.',
      retryable: true,
      retryAfterSeconds: 2,
    };
  }

  if (
    status >= 500 ||
    /UNAVAILABLE|DEADLINE_EXCEEDED|timeout|fetch failed|ECONNRESET|ETIMEDOUT/i.test(rawMsg)
  ) {
    return {
      status: 503,
      message:
        'The AI server is temporarily busy or network is slow. Retrying or please try again in a few seconds.',
      retryable: true,
      retryAfterSeconds: 3,
    };
  }

  return {
    status: 500,
    message: rawMsg || 'An unexpected error occurred while communicating with the AI service.',
    retryable: true,
    retryAfterSeconds: 3,
  };
}

let aiResetNonce = 0;

async function callGeminiWithRetry(
  params: {
    contents: any;
    config?: Record<string, any>;
    preferredModel?: string;
  },
  maxRetries = 2
) {
  const aiClient = getGeminiClient();
  const modelsToTry = [
    params.preferredModel || PRIMARY_GEMINI_MODEL,
    FALLBACK_GEMINI_MODEL,
  ];

  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await aiClient.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
      } catch (err: any) {
        lastError = err;
        const info = classifyGeminiError(err);

        // Do not retry invalid/missing API keys
        if (!info.retryable && info.status !== 404) {
          throw err;
        }

        // Exponential backoff before retrying same model (except 404 -> skip to fallback)
        if (info.status !== 404 && attempt < maxRetries) {
          const delayMs = 1000 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        break;
      }
    }
  }

  throw lastError;
}

// API Routes
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    platform: 'English with Miss Asmaa',
    timestamp: new Date().toISOString(),
  });
});

// Route: Emergency Reset & Re-initialize Gemini AI Connection
app.post('/api/gemini/reset', async (_req, res) => {
  try {
    dotenv.config({ override: true });
    aiResetNonce += 1;

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error:
          'Gemini API key is not configured in server settings (Settings > Secrets). Please check the key and reset again.',
      });
    }

    const pingResponse = await callGeminiWithRetry(
      {
        contents: [{ role: 'user', parts: [{ text: 'Reply with one word only: Ready' }] }],
        config: { maxOutputTokens: 16 },
        preferredModel: PRIMARY_GEMINI_MODEL,
      },
      1
    );

    const okText = (pingResponse?.text || '').trim();
    res.json({
      success: true,
      resetCount: aiResetNonce,
      model: PRIMARY_GEMINI_MODEL,
      reply: okText || 'Ready',
      message: 'AI engine reset and connection activated successfully ⚡',
    });
  } catch (error: any) {
    console.error('Error in Gemini emergency reset:', error);
    const info = classifyGeminiError(error);
    res.status(info.status).json({
      success: false,
      error: info.message,
      retryable: info.retryable,
      retryAfterSeconds: info.retryAfterSeconds,
    });
  }
});

// Helper to normalize AI-extracted questions with immutable choice_id and exact full correctAnswer
function normalizeAiExtractedQuestions(rawQuestions: any[]) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const legacyArabicLetters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  return (Array.isArray(rawQuestions) ? rawQuestions : []).map((q: any, idx: number) => {
    const qId = String(q?.id || '').trim() || `ai-q-${Date.now()}-${idx + 1}`;
    const qType: 'mcq' | 'essay' = q?.type === 'essay' ? 'essay' : 'mcq';
    if (qType === 'essay') {
      return {
        id: qId,
        type: 'essay',
        question: String(q?.question || '').trim(),
        correctAnswer: String(q?.correctAnswer || q?.explanation || '').trim(),
        explanation: String(q?.explanation || q?.correctAnswer || '').trim(),
        points: Math.max(0.5, Number(q?.points) || 2),
        chapter: q?.chapter ? String(q.chapter) : undefined,
      };
    }

    const rawOptions: string[] = Array.isArray(q?.options)
      ? q.options.map((o: any) =>
          String(o || '')
            .replace(/^\s*[أاآبجدهـوزحطيA-Ja-j0-9]\s*[\)\.\-:]\s*/u, '')
            .trim()
        )
      : ['Option 1', 'Option 2', 'Option 3', 'Option 4'];

    const choices = rawOptions.map((txt, cIdx) => ({
      id: `${qId}-c${cIdx + 1}`,
      text: txt || `Option ${cIdx + 1}`,
    }));

    let correctIdx = -1;
    if (Number.isInteger(q?.correctChoiceIndex) && q.correctChoiceIndex >= 0 && q.correctChoiceIndex < choices.length) {
      correctIdx = Number(q.correctChoiceIndex);
    } else if (typeof q?.correctAnswer === 'string') {
      const rawAns = q.correctAnswer.trim();
      const stripped = rawAns.replace(/^\s*[أاآبجدهـوزحطيA-Ja-j0-9]\s*[\)\.\-:]\s*/u, '').trim();
      correctIdx = choices.findIndex((c) => c.text === rawAns || c.text === stripped);
      if (correctIdx === -1) {
        const cleanChar = rawAns.replace(/[\)\.\-:\s]/g, '');
        correctIdx = letters.findIndex(
          (l, i) =>
            l.toLowerCase() === cleanChar.toLowerCase() ||
            legacyArabicLetters[i] === cleanChar ||
            (i === 0 && cleanChar === 'ا')
        );
      }
    }
    if (correctIdx < 0 || correctIdx >= choices.length) correctIdx = 0;

    const correctChoice = choices[correctIdx];
    return {
      id: qId,
      type: 'mcq',
      question: String(q?.question || '').trim(),
      choices,
      correctChoiceIds: [correctChoice.id],
      options: choices.map((c, cIdx) => `${letters[cIdx] || cIdx + 1}) ${c.text}`),
      correctAnswer: correctChoice.text,
      explanation: String(q?.explanation || '').trim(),
      points: Math.max(0.5, Number(q?.points) || 2),
      chapter: q?.chapter ? String(q.chapter) : undefined,
    };
  });
}

// Route: Extract or generate questions from image / imageUrl / text using Gemini
app.post('/api/gemini/extract-questions', async (req, res) => {
  try {
    const {
      imageBase64,
      imageUrl,
      mimeType = 'image/jpeg',
      promptText = '',
      grade = '3rd Secondary',
      subject = 'English Language',
    } = req.body;

    const parts: any[] = [];

    if (imageBase64) {
      const mimeMatch = String(imageBase64).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
      const resolvedMime = mimeMatch?.[1] || mimeType;
      const cleanedBase64 = String(imageBase64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: resolvedMime,
          data: cleanedBase64,
        },
      });
    } else if (imageUrl && /^https?:\/\//i.test(String(imageUrl))) {
      const imgResp = await fetch(String(imageUrl));
      if (imgResp.ok) {
        const arrBuf = await imgResp.arrayBuffer();
        const resolvedMime = imgResp.headers.get('content-type') || mimeType;
        parts.push({
          inlineData: {
            mimeType: resolvedMime,
            data: Buffer.from(arrBuf).toString('base64'),
          },
        });
      }
    }

    const systemPrompt = `You are the specialized AI assistant for the 'English with Miss Asmaa' educational platform for General and Azhar Secondary students.
Your mission is to extract or generate high-precision English language exam questions (grammar, vocabulary, reading comprehension, writing, and quizzes) from any provided image, worksheet, book page, or prompt.
Important formatting rules for choices:
- Write each option text cleanly inside the options array without any prefix letters such as A) or B).
- Specify the exact 0-based index of the correct option (0 for 1st, 1 for 2nd, 2 for 3rd, 3 for 4th) in correctChoiceIndex.
- Also include the full text of the correct option in correctAnswer.

You must return JSON strictly in this format:
{
  "title": "Exam or Worksheet Title",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "Clear question text",
      "options": ["First option", "Second option", "Third option", "Fourth option"],
      "correctChoiceIndex": 0,
      "correctAnswer": "First option",
      "explanation": "Model grammatical/lexical explanation of the answer",
      "points": 2,
      "chapter": "Unit or Lesson Name"
    }
  ]
}`;

    const userPrompt = `Subject & Grade: ${subject} - ${grade}.
Miss Asmaa's Instructions: ${promptText || 'Extract or generate all English language questions accurately with model answers and clear explanations.'}
Return the questions in JSON format immediately.`;

    parts.push({ text: userPrompt });

    const response = await callGeminiWithRetry({
      contents: { parts },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';

    let parsedData: any;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      parsedData = match ? JSON.parse(match[0]) : { questions: [] };
    }

    parsedData.questions = normalizeAiExtractedQuestions(parsedData.questions || []);

    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error('Error generating questions with Gemini:', error);
    const info = classifyGeminiError(error);
    res.status(info.status).json({
      success: false,
      error: info.message,
      retryable: info.retryable,
      retryAfterSeconds: info.retryAfterSeconds,
    });
  }
});

// Route: Generate a balanced parallel Assessment Form (Form B / C ...) matching source form specs
app.post('/api/gemini/generate-form', async (req, res) => {
  try {
    const {
      sourceQuestions = [],
      targetFormName = 'Form B',
      title = '',
      grade = '3rd Secondary',
      promptText = '',
    } = req.body;

    const specsSummary = (Array.isArray(sourceQuestions) ? sourceQuestions : []).map((q: any, i: number) => ({
      index: i + 1,
      type: q.type === 'essay' ? 'essay' : 'mcq',
      points: Number(q.points) || 2,
      choicesCount: Array.isArray(q.choices) ? q.choices.length : Array.isArray(q.options) ? q.options.length : 4,
      topicHint: String(q.question || '').slice(0, 120),
    }));

    const systemPrompt = `You are an expert in creating equivalent English exam forms for 'English with Miss Asmaa'.
Your task is to generate an equivalent parallel form (${targetFormName}) that matches the exact specifications (exact same number of questions, exact same question type order MCQ/essay, exact points per question, and same grammar/vocabulary/reading level), using fresh, non-duplicated sentences and questions to prevent cheating.
Write clean option texts without A) B) C) D) prefixes, and specify correctChoiceIndex accurately.
Reply in JSON strictly:
{
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctChoiceIndex": 0,
      "correctAnswer": "...",
      "explanation": "...",
      "points": 2
    }
  ]
}`;

    const userPrompt = `Assessment Title: ${title || 'English Assessment'} - Grade: ${grade}.
Target Form to Generate: ${targetFormName}.
Additional Teacher Instructions: ${promptText || 'Generate brand-new questions equivalent in difficulty and topics to the following specifications.'}
Exact specifications for each question in the reference form:
${JSON.stringify(specsSummary, null, 2)}`;

    const response = await callGeminiWithRetry({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let parsedData: any;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      parsedData = match ? JSON.parse(match[0]) : { questions: [] };
    }

    const generated = normalizeAiExtractedQuestions(parsedData.questions || []).map((q, idx) => ({
      ...q,
      points: specsSummary[idx]?.points || q.points,
      type: specsSummary[idx]?.type || q.type,
    }));

    res.json({ success: true, questions: generated });
  } catch (error: any) {
    console.error('Error generating parallel form with Gemini:', error);
    const info = classifyGeminiError(error);
    res.status(info.status).json({
      success: false,
      error: info.message,
      retryable: info.retryable,
      retryAfterSeconds: info.retryAfterSeconds,
    });
  }
});

// Route: Universal AI Chat (English grammar, vocabulary, reading, translation, rephrasing, image recognition)
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { message, history = [], context = '', imageBase64, mimeType = 'image/jpeg' } = req.body;

    const systemInstruction = `You are 'Miss Asmaa AI' - the smart educational assistant for the 'English with Miss Asmaa' platform.
You are an expert in all areas of English language learning:
- English Grammar & Syntax (tenses, conditionals, passive voice, reported speech, relative clauses, modals, etc.).
- Vocabulary, Idioms, Phrasal Verbs, Collocations, Synonyms & Antonyms.
- Reading Comprehension passages, critical thinking questions, and inference skills.
- Writing Skills (essays, paragraphs, emails, punctuation) and Translation.
You can:
1. Answer clearly and accurately with helpful examples.
2. Extract and explain any question from uploaded images or text.
3. Rephrase any question into multiple formats (MCQ, fill-in-the-blank, essay, critical thinking).
4. Help the teacher craft quizzes and help students learn step by step.
Respond in clear, polite, encouraging English with clean formatting.
Official platform contact: 01069780486.`;

    const contents: any[] = [];
    if (context) {
      contents.push({ role: 'user', parts: [{ text: `Context: ${context}` }] });
    }
    for (const h of history) {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      });
    }

    const currentParts: any[] = [];
    if (imageBase64) {
      const cleaned = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      currentParts.push({
        inlineData: {
          mimeType,
          data: cleaned,
        },
      });
    }
    currentParts.push({ text: message });

    contents.push({
      role: 'user',
      parts: currentParts,
    });

    const response = await callGeminiWithRetry({
      contents,
      config: {
        systemInstruction,
      },
    });

    const resultText = response.text || '';
    res.json({ success: true, text: resultText });
  } catch (error: any) {
    console.error('Error in universal AI chat:', error);
    const info = classifyGeminiError(error);
    res.status(info.status).json({
      success: false,
      error: info.message,
      retryable: info.retryable,
      retryAfterSeconds: info.retryAfterSeconds,
    });
  }
});

// Route: Rephrase or Transform Question
app.post('/api/gemini/rephrase-question', async (req, res) => {
  try {
    const { question, targetFormat = 'mcq', subject = 'English Language (Grammar, Vocabulary, Reading)' } = req.body;

    const prompt = `Rephrase the following question in (${subject}) to become (${targetFormat === 'mcq' ? 'a multiple-choice question with 4 options, the correct answer, and an explanation' : 'an open-ended / essay critical-thinking question with a model answer'}):
Original question: "${question}"
Reply in JSON strictly:
{
  "question": "New rephrased question text",
  "type": "${targetFormat}",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctAnswer": "A",
  "explanation": "Model explanation"
}`;

    const response = await callGeminiWithRetry({
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, data: parsed });
  } catch (err: any) {
    const info = classifyGeminiError(err);
    res.status(info.status).json({
      success: false,
      error: info.message,
      retryable: info.retryable,
      retryAfterSeconds: info.retryAfterSeconds,
    });
  }
});

// Helper: Format total seconds cleanly into strict HH:MM:SS + rounded minutes
function buildFormattedDuration(totalSecondsRaw: number): {
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
} {
  if (!Number.isFinite(totalSecondsRaw) || totalSecondsRaw <= 0) {
    return {
      totalSeconds: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      formatted: '--:--:--',
    };
  }
  const totalSeconds = Math.max(0, Math.round(totalSecondsRaw));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const formatted = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return {
    totalSeconds,
    hours,
    minutes: totalSeconds > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : 0,
    seconds: secs,
    formatted,
  };
}

// Helper: Parse duration string like "1:01", "0:59", "45:20", "1:15:30" accurately
function parseDurationString(str: string): {
  totalSeconds: number;
  minutes: number;
  seconds: number;
  hours: number;
  formatted: string;
} {
  if (!str) return { totalSeconds: 0, minutes: 0, seconds: 0, hours: 0, formatted: '--:--:--' };
  const cleaned = str.trim().replace(/[^\d:]/g, '');
  const parts = cleaned.split(':').map((p) => parseInt(p, 10)).filter((n) => !isNaN(n));
  let totalSeconds = 0;

  if (parts.length === 3) {
    totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    totalSeconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    totalSeconds = parts[0];
  }

  if (totalSeconds <= 0) {
    return { totalSeconds: 0, minutes: 0, seconds: 0, hours: 0, formatted: '--:--:--' };
  }
  const built = buildFormattedDuration(totalSeconds);
  return {
    totalSeconds: built.totalSeconds,
    minutes: built.minutes,
    seconds: built.seconds,
    hours: built.hours,
    formatted: built.formatted,
  };
}

// Helper: Parse ISO-8601 YouTube duration like "PT1H12M30S"
function parseIsoDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + s;
}

// Helper: Extract exact duration in seconds from MP4 / MOV mvhd box
function extractMp4DurationFromBuffer(buf: Buffer): number | null {
  const sig = Buffer.from('mvhd');
  let offset = 0;
  while (offset < buf.length - 36) {
    const idx = buf.indexOf(sig, offset);
    if (idx < 0 || idx + 28 >= buf.length) break;
    // 'mvhd' is immediately preceded by 4-byte box size
    if (idx >= 4) {
      const boxSize = buf.readUInt32BE(idx - 4);
      const version = buf[idx + 4];
      if (boxSize >= 100 && boxSize <= 200 && (version === 0 || version === 1)) {
        if (version === 0 && idx + 24 <= buf.length) {
          const timescale = buf.readUInt32BE(idx + 16);
          const duration = buf.readUInt32BE(idx + 20);
          if (timescale > 0 && duration > 0) {
            const secs = duration / timescale;
            if (secs > 0.5 && secs < 86400 * 3) return secs;
          }
        } else if (version === 1 && idx + 36 <= buf.length) {
          const timescale = buf.readUInt32BE(idx + 24);
          const high = buf.readUInt32BE(idx + 28);
          const low = buf.readUInt32BE(idx + 32);
          const duration = high * 4294967296 + low;
          if (timescale > 0 && duration > 0) {
            const secs = duration / timescale;
            if (secs > 0.5 && secs < 86400 * 3) return secs;
          }
        }
      }
    }
    offset = idx + 4;
  }
  return null;
}

// Helper: Extract exact duration in seconds from WebM / MKV EBML header
function extractWebmDurationFromBuffer(buf: Buffer): number | null {
  try {
    let timecodeScale = 1000000; // default 1ms in ns
    const tsIdx = buf.indexOf(Buffer.from([0x2a, 0xd7, 0xb1]));
    if (tsIdx >= 0 && tsIdx + 4 < buf.length) {
      const sizeByte = buf[tsIdx + 3];
      const len = sizeByte & 0x0f;
      if (len >= 1 && len <= 4 && tsIdx + 4 + len <= buf.length) {
        let val = 0;
        for (let i = 0; i < len; i++) val = (val << 8) | buf[tsIdx + 4 + i];
        if (val > 0) timecodeScale = val;
      }
    }

    const durIdx = buf.indexOf(Buffer.from([0x44, 0x89]));
    if (durIdx >= 0 && durIdx + 3 < buf.length) {
      const sizeByte = buf[durIdx + 2];
      const len = sizeByte & 0x7f;
      if (len === 4 && durIdx + 7 <= buf.length) {
        const d = buf.readFloatBE(durIdx + 3);
        const secs = (d * timecodeScale) / 1e9;
        if (secs > 0.5 && secs < 86400 * 3) return secs;
      } else if (len === 8 && durIdx + 11 <= buf.length) {
        const d = buf.readDoubleBE(durIdx + 3);
        const secs = (d * timecodeScale) / 1e9;
        if (secs > 0.5 && secs < 86400 * 3) return secs;
      }
    }
  } catch {}
  return null;
}

// Helper: Probe remote MP4/MOV/WebM video duration using lightweight HTTP Range requests (head + tail 512KB)
async function probeRemoteVideoDuration(videoUrl: string): Promise<number | null> {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Range: 'bytes=0-524287',
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const headRes = await fetch(videoUrl, { headers, redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);

    if (!headRes.ok && headRes.status !== 206) return null;

    const ct = (headRes.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) return null;

    const contentRange = headRes.headers.get('content-range') || '';
    const contentLengthHeader = headRes.headers.get('content-length') || '';
    const headBuf = Buffer.from(await headRes.arrayBuffer());

    const mp4Head = extractMp4DurationFromBuffer(headBuf);
    if (mp4Head !== null) return mp4Head;

    const webmHead = extractWebmDurationFromBuffer(headBuf);
    if (webmHead !== null) return webmHead;

    // Many phone-recorded MP4/MOV files place moov/mvhd at the END of the file!
    let totalBytes = 0;
    const rangeMatch = contentRange.match(/\/(\d+)$/);
    if (rangeMatch) {
      totalBytes = parseInt(rangeMatch[1], 10);
    } else if (contentLengthHeader) {
      totalBytes = parseInt(contentLengthHeader, 10);
    }

    if (totalBytes > 524288) {
      const start = Math.max(0, totalBytes - 524288);
      const tailCtrl = new AbortController();
      const tailTimer = setTimeout(() => tailCtrl.abort(), 9000);
      const tailRes = await fetch(videoUrl, {
        headers: {
          ...headers,
          Range: `bytes=${start}-${totalBytes - 1}`,
        },
        redirect: 'follow',
        signal: tailCtrl.signal,
      });
      clearTimeout(tailTimer);

      if (tailRes.ok || tailRes.status === 206) {
        const tailBuf = Buffer.from(await tailRes.arrayBuffer());
        const mp4Tail = extractMp4DurationFromBuffer(tailBuf);
        if (mp4Tail !== null) return mp4Tail;
      }
    }
  } catch (err) {
    console.warn('probeRemoteVideoDuration error:', err);
  }
  return null;
}

// Helper: Count exact PDF pages from Buffer using pdf-lib + multi-pattern fallback
async function countPdfPagesFromBuffer(buf: Buffer): Promise<{ pagesCount: number; accurate: boolean }> {
  // Verify PDF magic header (%PDF-)
  const headerProbe = buf.subarray(0, Math.min(buf.length, 1024)).toString('latin1');
  if (!headerProbe.includes('%PDF-')) {
    return { pagesCount: 0, accurate: false };
  }

  // Primary: real PDF structural parser via pdf-lib (handles PDF 1.5+ ObjStm, XRef streams, encrypted headers)
  try {
    const pdfDoc = await PDFDocument.load(buf, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
    const count = pdfDoc.getPageCount();
    if (count > 0 && count < 50000) {
      return { pagesCount: count, accurate: true };
    }
  } catch (pdfLibErr) {
    console.warn('pdf-lib server parse fallback:', pdfLibErr);
  }

  // Fallback 1: Bidirectional /Type /Pages and /Count regex within object dictionary bounds
  const str = buf.toString('latin1');
  const candidateCounts: number[] = [];

  for (const m of str.matchAll(/<<[^<>]{0,800}?\/Type\s*\/Pages\b[^<>]{0,800}?\/Count\s+(\d+)/g)) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > 0 && n < 50000) candidateCounts.push(n);
  }
  for (const m of str.matchAll(/<<[^<>]{0,800}?\/Count\s+(\d+)[^<>]{0,800}?\/Type\s*\/Pages\b/g)) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > 0 && n < 50000) candidateCounts.push(n);
  }
  if (candidateCounts.length > 0) {
    return { pagesCount: Math.max(...candidateCounts), accurate: true };
  }

  // Fallback 2: Individual /Type /Page objects (not /Pages)
  const pageMatches = str.match(/\/Type\s*\/Page\b(?!s)/g);
  if (pageMatches && pageMatches.length > 0) {
    return { pagesCount: pageMatches.length, accurate: true };
  }

  return { pagesCount: 0, accurate: false };
}

// Route: Real Media Prober (Accurate Video Duration & PDF Page Detection)
app.post('/api/probe-media', async (req, res) => {
  try {
    const { url, type } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid link' });
    }

    let cleanUrl = url.trim();
    if (cleanUrl.includes('/api/') || cleanUrl.startsWith('api/')) {
      const match = cleanUrl.match(/[?&]url=([^&]+)/);
      if (match && match[1]) {
        try {
          cleanUrl = decodeURIComponent(match[1]);
        } catch {
          cleanUrl = match[1];
        }
      } else {
        cleanUrl = cleanUrl.replace(/^\/?api\/[a-zA-Z0-9_.-]+\/?/, '');
      }
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    // ===================== 1. VIDEO PROBING =====================
    if (type === 'video') {
      // 1A. Telegram Video Extraction (t.me / telegram.me)
      if (cleanUrl.includes('t.me') || cleanUrl.includes('telegram.me')) {
        const tgMatch = cleanUrl.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_+]+)\/(\d+)/i);
        const channel = tgMatch ? tgMatch[1] : '';
        const postId = tgMatch ? tgMatch[2] : '';

        let embedUrl = cleanUrl;
        if (!embedUrl.includes('embed=1')) {
          embedUrl = embedUrl.includes('?') ? `${embedUrl}&embed=1` : `${embedUrl}?embed=1`;
        }

        let title = 'Telegram Video';
        let streamUrl = '';
        let thumbUrl = '';
        let durStr = '';
        let totalSeconds = 0;
        let minutes = 0;
        let seconds = 0;
        let formattedDuration = '--:--:--';
        let accurate = false;

        try {
          const tgRes = await fetch(embedUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });

          if (tgRes.ok) {
            const html = await tgRes.text();

            const videoMatch = html.match(/<video[^>]*src="([^"]+)"/i);
            if (videoMatch && videoMatch[1]) {
              streamUrl = videoMatch[1];
            }

            const thumbMatch =
              html.match(/background-image:url\('([^']+)'\)/i) ||
              html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (thumbMatch && thumbMatch[1]) {
              thumbUrl = thumbMatch[1];
            }

            const durMatch =
              html.match(/<time[^>]*class="[^"]*duration[^"]*"[^>]*>([^<]+)<\/time>/i) ||
              html.match(/class="[^"]*duration[^"]*"[^>]*>([^<]+)</i);
            if (durMatch && durMatch[1]) {
              durStr = durMatch[1].trim();
              const parsed = parseDurationString(durStr);
              if (parsed.totalSeconds > 0) {
                totalSeconds = parsed.totalSeconds;
                minutes = parsed.minutes;
                seconds = parsed.seconds;
                formattedDuration = parsed.formatted;
                accurate = true;
              }
            }

            // If Telegram HTML lacked <time class="duration">, probe the direct telesco.pe stream via Range
            if (!accurate && streamUrl) {
              const probedSecs = await probeRemoteVideoDuration(streamUrl);
              if (probedSecs !== null) {
                const built = buildFormattedDuration(probedSecs);
                totalSeconds = built.totalSeconds;
                minutes = built.minutes;
                seconds = built.seconds;
                formattedDuration = built.formatted;
                accurate = true;
              }
            }

            const textMatch =
              html.match(/<div class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
              html.match(/<meta property="og:description" content="([^"]+)"/i) ||
              html.match(/<meta property="og:title" content="([^"]+)"/i);
            if (textMatch && textMatch[1]) {
              const rawText = textMatch[1]
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .trim();
              if (rawText) {
                title = rawText.split('\n')[0].slice(0, 90).trim();
              }
            } else if (channel && postId) {
              title = `Telegram Lecture (${channel} #${postId})`;
            }
          }
        } catch (tgErr) {
          console.warn('Telegram probe error:', tgErr);
        }

        const finalStreamUrl =
          streamUrl || (channel && postId ? `/api/telegram-stream?channel=${channel}&id=${postId}` : cleanUrl);

        return res.json({
          success: true,
          valid: true,
          accurate,
          provider: 'Telegram Video (Protected Stream)',
          title,
          streamUrl: finalStreamUrl,
          directVideoUrl: streamUrl,
          thumbnail: thumbUrl,
          totalSeconds,
          minutes,
          seconds,
          formattedDuration,
          rawDuration: durStr,
          cleanUrl: channel && postId ? `https://t.me/${channel}/${postId}?embed=1` : cleanUrl,
        });
      }

      // 1B. YouTube Video Extraction
      if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
        const idMatch =
          cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/) ||
          cleanUrl.match(/[?&]v=([^&]+)/);
        const videoId = idMatch ? idMatch[1] : null;

        if (videoId) {
          let totalSeconds = 0;
          let title = 'English Lecture';

          try {
            const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+667;',
              },
            });
            const html = await ytRes.text();

            const approxMatch = html.match(/"approxDurationMs":"(\d+)"/);
            const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);
            const isoMatch = html.match(/<meta\s+itemprop="duration"\s+content="(PT[^"]+)"/i);

            if (approxMatch) {
              totalSeconds = Math.round(parseInt(approxMatch[1], 10) / 1000);
            } else if (lengthMatch) {
              totalSeconds = parseInt(lengthMatch[1], 10);
            } else if (isoMatch) {
              totalSeconds = parseIsoDurationSeconds(isoMatch[1]);
            }

            const titleMatch =
              html.match(/<title>(.*?) - YouTube<\/title>/) ||
              html.match(/<meta name="title" content="(.*?)">/) ||
              html.match(/"title":"(.*?)"/);
            if (titleMatch && titleMatch[1]) {
              title = titleMatch[1]
                .replace(/\\u0026/g, '&')
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"');
            }
          } catch (ytErr) {
            console.warn('YouTube watch probe error:', ytErr);
          }

          // Fallback via YouTube Innertube player API if HTML missed duration
          if (totalSeconds <= 0) {
            try {
              const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  videoId,
                  context: {
                    client: {
                      clientName: 'WEB',
                      clientVersion: '2.20240101.00.00',
                    },
                  },
                }),
              });
              if (playerRes.ok) {
                const playerJson: any = await playerRes.json();
                const lenSec = Number(playerJson?.videoDetails?.lengthSeconds || 0);
                if (lenSec > 0) totalSeconds = lenSec;
                if (playerJson?.videoDetails?.title && title === 'English Lecture') {
                  title = String(playerJson.videoDetails.title);
                }
              }
            } catch {}
          }

          if (totalSeconds > 0) {
            const built = buildFormattedDuration(totalSeconds);
            return res.json({
              success: true,
              valid: true,
              accurate: true,
              provider: 'YouTube (Secure Player)',
              title,
              totalSeconds: built.totalSeconds,
              minutes: built.minutes,
              seconds: built.seconds,
              formattedDuration: built.formatted,
              cleanUrl: `https://www.youtube.com/watch?v=${videoId}`,
            });
          }
        }
      }

      // 1C. Google Drive Video Extraction (Real duration via get_video_info + Range MP4/WebM header probe)
      if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('drive.usercontent.google.com')) {
        const idMatch =
          cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const fileId = idMatch ? idMatch[1] : null;

        let title = 'Google Drive Lecture';
        let totalSeconds = 0;

        if (fileId) {
          // Probe 1: Google Drive get_video_info (returns length_seconds=...)
          try {
            const infoRes = await fetch(`https://drive.google.com/get_video_info?docid=${fileId}`, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              },
            });
            if (infoRes.ok) {
              const rawInfo = await infoRes.text();
              const params = new URLSearchParams(rawInfo);
              const lenParam = Number(params.get('length_seconds') || 0);
              if (lenParam > 0) {
                totalSeconds = lenParam;
              }
              const titleParam = params.get('title');
              if (titleParam) {
                title = titleParam.replace(/\.[^/.]+$/, '');
              }
            }
          } catch {}

          // Probe 2: Direct stream head/tail Range MP4/MOV/WebM header probe
          const directStreamUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
          if (totalSeconds <= 0) {
            const probedSecs = await probeRemoteVideoDuration(directStreamUrl);
            if (probedSecs !== null) {
              totalSeconds = Math.round(probedSecs);
            }
          }

          // Probe 3: Fallback view page metadata for title & any duration field
          if (title === 'Google Drive Lecture' || totalSeconds <= 0) {
            try {
              const gRes = await fetch(`https://drive.google.com/file/d/${fileId}/view`, {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
              });
              const html = await gRes.text();
              const tMatch =
                html.match(/<meta property="og:title" content="(.*?)">/) ||
                html.match(/<title>(.*?) - Google Drive<\/title>/);
              if (tMatch && tMatch[1] && title === 'Google Drive Lecture') {
                title = tMatch[1].replace(/\.[^/.]+$/, '');
              }
              if (totalSeconds <= 0) {
                const durMsMatch = html.match(/\\?"duration_ms\\?":\s*(\d+)/) || html.match(/"length_seconds":\s*"?(\d+)"?/);
                if (durMsMatch) {
                  const val = parseInt(durMsMatch[1], 10);
                  totalSeconds = durMsMatch[0].includes('duration_ms') ? Math.round(val / 1000) : val;
                }
              }
            } catch {}
          }

          const built = totalSeconds > 0 ? buildFormattedDuration(totalSeconds) : null;
          return res.json({
            success: true,
            valid: true,
            accurate: built !== null,
            provider: 'Google Drive Video',
            title,
            streamUrl: directStreamUrl,
            totalSeconds: built ? built.totalSeconds : 0,
            minutes: built ? built.minutes : 0,
            seconds: built ? built.seconds : 0,
            formattedDuration: built ? built.formatted : '--:--:--',
            cleanUrl: directStreamUrl,
          });
        }
      }

      // 1D. Direct Video Stream (MP4, MOV, WebM, Supabase Storage)
      try {
        const rawFileName = cleanUrl.split('/').pop()?.split('?')[0] || 'Direct Video';
        const title = decodeURIComponent(rawFileName).replace(/\.[^/.]+$/, '');

        const probedSecs = await probeRemoteVideoDuration(cleanUrl);
        if (probedSecs !== null) {
          const built = buildFormattedDuration(probedSecs);
          return res.json({
            success: true,
            valid: true,
            accurate: true,
            provider: 'Direct Video (MP4 / Stream)',
            title,
            streamUrl: cleanUrl,
            totalSeconds: built.totalSeconds,
            minutes: built.minutes,
            seconds: built.seconds,
            formattedDuration: built.formatted,
            cleanUrl,
          });
        }

        return res.json({
          success: true,
          valid: true,
          accurate: false,
          provider: 'Direct Video (MP4 / Stream)',
          title,
          streamUrl: cleanUrl,
          totalSeconds: 0,
          minutes: 0,
          seconds: 0,
          formattedDuration: '--:--:--',
          cleanUrl,
        });
      } catch {
        return res.json({
          success: true,
          valid: true,
          accurate: false,
          provider: 'External Video Link',
          title: 'English Lecture',
          totalSeconds: 0,
          minutes: 0,
          seconds: 0,
          formattedDuration: '--:--:--',
          cleanUrl,
        });
      }
    }

    // ===================== 2. DOCUMENT / PDF PROBING =====================
    if (type === 'document') {
      let targetPdfUrl = cleanUrl;
      let title = 'Official English Study Notes';
      let pagesCount = 1;
      let formattedSize = '12 MB';
      let accurate = false;

      // 2A. Telegram Document Extraction
      if (cleanUrl.includes('t.me') || cleanUrl.includes('telegram.me')) {
        const tgMatch = cleanUrl.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_+]+)\/(\d+)/i);
        const channel = tgMatch ? tgMatch[1] : '';
        const postId = tgMatch ? tgMatch[2] : '';
        const embedUrl = cleanUrl.includes('?embed=1') ? cleanUrl : `${cleanUrl}?embed=1`;
        try {
          const tgRes = await fetch(embedUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          });
          if (tgRes.ok) {
            const html = await tgRes.text();
            const docTitleMatch =
              html.match(/<div class="[^"]*tgme_widget_message_document_title[^"]*">([^<]+)<\/div>/i) ||
              html.match(/<div class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (docTitleMatch && docTitleMatch[1]) {
              title = docTitleMatch[1].replace(/<[^>]+>/g, '').trim().split('\n')[0].slice(0, 80);
            }

            const extraMatch = html.match(/<div class="[^"]*tgme_widget_message_document_extra[^"]*">([^<]+)<\/div>/i);
            if (extraMatch && extraMatch[1]) {
              formattedSize = extraMatch[1].trim();
              if (formattedSize.includes('MB')) {
                const mb = parseFloat(formattedSize) || 5;
                pagesCount = Math.max(1, Math.round(mb * 8));
              } else if (formattedSize.includes('KB')) {
                const kb = parseFloat(formattedSize) || 500;
                pagesCount = Math.max(1, Math.round(kb / 120));
              }
            } else {
              pagesCount = 15;
            }
          }
        } catch (tgErr) {
          console.warn('Telegram doc error:', tgErr);
        }

        return res.json({
          success: true,
          valid: true,
          accurate,
          provider: 'Telegram Document',
          title,
          pagesCount,
          formattedSize,
          cleanUrl: channel && postId ? `https://t.me/${channel}/${postId}` : cleanUrl,
        });
      }

      // 2B. Google Docs / Slides / Drive links
      const docsMatch = cleanUrl.match(/docs\.google\.com\/(document|presentation)\/d\/([a-zA-Z0-9_-]+)/i);
      const driveIdMatch =
        cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      const driveFileId = driveIdMatch ? driveIdMatch[1] : null;

      if (docsMatch) {
        targetPdfUrl = `https://docs.google.com/${docsMatch[1]}/d/${docsMatch[2]}/export?format=pdf`;
      } else if (cleanUrl.includes('drive.google.com') && driveFileId) {
        targetPdfUrl = `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&confirm=t`;
        try {
          const gRes = await fetch(`https://drive.google.com/file/d/${driveFileId}/view`, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });
          const html = await gRes.text();
          const tMatch =
            html.match(/<meta property="og:title" content="(.*?)">/) ||
            html.match(/<title>(.*?) - Google Drive<\/title>/);
          if (tMatch && tMatch[1]) {
            title = tMatch[1].replace(/\.[^/.]+$/, '');
          }
        } catch {}
      } else {
        const lastPart = cleanUrl.split('/').pop()?.split('?')[0] || '';
        if (lastPart) {
          try {
            title = decodeURIComponent(lastPart).replace(/\.[^/.]+$/, '');
          } catch {}
        }
      }

      // Fetch real PDF bytes and count pages with pdf-lib
      const tryFetchPdfBuffer = async (downloadUrl: string): Promise<{ buf: Buffer; totalBytes: number } | null> => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 18000);
          const pdfRes = await fetch(downloadUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'application/pdf,application/octet-stream,*/*',
            },
            redirect: 'follow',
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!pdfRes.ok) return null;

          const cl = pdfRes.headers.get('content-length');
          const arrayBuf = await pdfRes.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          const totalBytes = cl ? parseInt(cl, 10) : buf.byteLength;
          return { buf, totalBytes };
        } catch {
          return null;
        }
      };

      let fetched = await tryFetchPdfBuffer(targetPdfUrl);
      // If usercontent Drive endpoint failed or returned HTML virus-scan page, retry classic uc?export=download
      if (
        driveFileId &&
        (!fetched || !fetched.buf.subarray(0, 64).toString('latin1').includes('%PDF-'))
      ) {
        if (fetched) {
          const htmlText = fetched.buf.toString('utf8');
          const confirmMatch = htmlText.match(/confirm=([a-zA-Z0-9_-]+)/);
          const uuidMatch = htmlText.match(/name="uuid"\s+value="([^"]+)"/);
          if (confirmMatch || uuidMatch) {
            const retryUrl = `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&confirm=${confirmMatch?.[1] || 't'}${uuidMatch ? `&uuid=${uuidMatch[1]}` : ''}`;
            const retried = await tryFetchPdfBuffer(retryUrl);
            if (retried) fetched = retried;
          }
        }
        if (!fetched || !fetched.buf.subarray(0, 64).toString('latin1').includes('%PDF-')) {
          const classic = await tryFetchPdfBuffer(`https://drive.google.com/uc?export=download&confirm=t&id=${driveFileId}`);
          if (classic && classic.buf.subarray(0, 64).toString('latin1').includes('%PDF-')) {
            fetched = classic;
          }
        }
      }

      if (fetched && fetched.buf.byteLength > 0) {
        const totalBytes = fetched.totalBytes || fetched.buf.byteLength;
        if (totalBytes < 1024 * 1024) {
          formattedSize = `${Math.max(1, Math.round(totalBytes / 1024))} KB`;
        } else {
          formattedSize = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        }

        const pdfCheck = await countPdfPagesFromBuffer(fetched.buf);
        if (pdfCheck.accurate && pdfCheck.pagesCount > 0) {
          pagesCount = pdfCheck.pagesCount;
          accurate = true;
        } else if (totalBytes > 100000) {
          pagesCount = Math.max(1, Math.round(totalBytes / (120 * 1024)));
        }
      }

      const finalDocCleanUrl = driveFileId
        ? `https://drive.google.com/file/d/${driveFileId}/preview`
        : cleanUrl;

      return res.json({
        success: true,
        valid: true,
        accurate,
        provider: cleanUrl.includes('drive.google.com') ? 'Google Drive Document' : 'Direct PDF File',
        title,
        pagesCount,
        formattedSize,
        cleanUrl: finalDocCleanUrl,
      });
    }

    res.status(400).json({ success: false, error: 'Unsupported link type' });
  } catch (err: any) {
    console.error('Probe media error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to inspect link' });
  }
});

// Route: Stream or Redirect Telegram Video
app.get('/api/telegram-stream', async (req, res) => {
  try {
    const rawUrl = (req.query.url as string) || '';
    const channel = (req.query.channel as string) || '';
    const id = (req.query.id as string) || '';

    let embedUrl = '';
    if (channel && id) {
      embedUrl = `https://t.me/${channel}/${id}?embed=1`;
    } else if (rawUrl) {
      embedUrl = rawUrl.includes('?embed=1') ? rawUrl : `${rawUrl}?embed=1`;
    } else {
      return res.status(400).send('Missing url or channel/id');
    }

    const tgRes = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const html = await tgRes.text();
    const videoMatch = html.match(/<video[^>]*src="([^"]+)"/i);
    if (videoMatch && videoMatch[1]) {
      return res.redirect(302, videoMatch[1]);
    }

    return res.status(404).send('Direct video stream not found in Telegram embed');
  } catch (err: any) {
    res.status(500).send('Error resolving Telegram stream');
  }
});

// Route: Native Google Drive Video Stream Proxy (forwards Range headers & strips Drive logos/UI)
app.get('/api/drive-stream', async (req, res) => {
  try {
    const fileId = String(req.query.id || '').trim();
    if (!fileId || !/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
      return res.status(400).send('Invalid Drive file ID');
    }

    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const rangeHeader = req.headers.range;
    const reqHeaders: Record<string, string> = { 'User-Agent': ua };
    if (rangeHeader) reqHeaders.Range = rangeHeader;

    let candidateUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    let upstream = await fetch(candidateUrl, { headers: reqHeaders, redirect: 'follow' });
    let ct = (upstream.headers.get('content-type') || '').toLowerCase();

    // Handle virus-scan confirmation HTML page if Drive returns text/html
    if (ct.includes('text/html')) {
      const htmlText = await upstream.text();
      const setCookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
      if (setCookies.length > 0) {
        reqHeaders.Cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
      }

      const formMatch = htmlText.match(/<form[^>]*id=["']download-form["'][^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i);
      if (formMatch) {
        const formAction = formMatch[1].replace(/&amp;/g, '&');
        const formBody = formMatch[2];
        const params = new URLSearchParams();
        const inputRegex = /<input[^>]+name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi;
        let m: RegExpExecArray | null;
        while ((m = inputRegex.exec(formBody)) !== null) {
          params.set(m[1], m[2]);
        }
        if (!params.has('id')) params.set('id', fileId);
        if (!params.has('confirm')) params.set('confirm', 't');
        const baseAction = formAction.startsWith('http')
          ? formAction
          : `https://drive.usercontent.google.com${formAction.startsWith('/') ? '' : '/'}${formAction}`;
        const joiner = baseAction.includes('?') ? '&' : '?';
        candidateUrl = `${baseAction}${joiner}${params.toString()}`;
      } else {
        const confirmMatch = htmlText.match(/confirm=([a-zA-Z0-9_-]+)/);
        const uuidMatch = htmlText.match(/name="uuid"\s+value="([^"]+)"/);
        if (confirmMatch || uuidMatch) {
          candidateUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmMatch?.[1] || 't'}${uuidMatch ? `&uuid=${uuidMatch[1]}` : ''}`;
        } else {
          candidateUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
        }
      }
      upstream = await fetch(candidateUrl, { headers: reqHeaders, redirect: 'follow' });
      ct = (upstream.headers.get('content-type') || '').toLowerCase();
    }

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).send('Drive stream unavailable');
    }
    if (ct.includes('text/html') || !upstream.body) {
      return res.status(404).send('Direct video stream unavailable for this Drive file');
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', ct && ct !== 'application/octet-stream' ? ct : 'video/mp4');
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const contentLen = upstream.headers.get('content-length');
    if (contentLen) res.setHeader('Content-Length', contentLen);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const reader = upstream.body.getReader();
    req.on('close', () => {
      reader.cancel().catch(() => {});
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.writableEnded) {
        res.write(Buffer.from(value));
      }
    }
    if (!res.writableEnded) res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).send('Error streaming Drive video');
    }
  }
});


// Route: Scan students from roster sheet / attendance photo
app.post('/api/gemini/scan-students', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No student roster image provided' });
    }

    const cleanedBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const response = await callGeminiWithRetry({
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanedBase64,
            },
          },
          {
            text: `Extract the list of students accurately from this roster sheet or image.
Return the result strictly in the following JSON format:
{
  "students": [
    {
      "name": "Student Full Name",
      "phone": "010xxxxxxxx",
      "parentPhone": "011xxxxxxxx",
      "governorate": "Cairo",
      "grade": "3rd Secondary"
    }
  ]
}`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{"students":[]}');
    res.json({ success: true, students: parsed.students || [] });
  } catch (error: any) {
    console.error('Error scanning students:', error);
    const info = classifyGeminiError(error);
    res.status(info.status).json({
      success: false,
      error: info.message,
      retryable: info.retryable,
      retryAfterSeconds: info.retryAfterSeconds,
    });
  }
});

// Route: Gemini AI Student Attendance & Analytics
app.post('/api/gemini/analyze-students', async (req, res) => {
  try {
    const { question = 'Who logged in or registered today?', students = [] } = req.body;

    const systemInstruction = `You are the smart administrative assistant for Miss Asmaa and the secretaries of the 'English with Miss Asmaa' platform for General and Azhar Secondary students.
Your task is to inspect student records (names, student codes, phone numbers, parent phone numbers, governorates, balances, and registration dates) and answer any inquiry from the teacher in English with high accuracy.
If asked "Who logged in or registered today?" or about a specific student or governorate, respond clearly in organized bullet points with exact numbers.`;

    const promptText = `Teacher's inquiry: "${question}"

Current student records (${students.length} students):
${JSON.stringify(students, null, 2)}

Answer the inquiry clearly in English.`;

    const response = await callGeminiWithRetry({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      config: {
        systemInstruction,
      },
    });

    res.json({ success: true, answer: response.text });
  } catch (error: any) {
    console.error('Error analyzing students with Gemini:', error);
    const info = classifyGeminiError(error);
    res.status(info.status).json({
      success: false,
      error: info.message,
      retryable: info.retryable,
      retryAfterSeconds: info.retryAfterSeconds,
    });
  }
});

// Route: Gemini AI Payment & Receipts Analyzer
app.post('/api/gemini/analyze-payments', async (req, res) => {
  try {
    const { question = 'Who paid today?', payments = [] } = req.body;

    const systemInstruction = `You are the certified financial assistant for Miss Asmaa ('English with Miss Asmaa' platform).
Your task is to inspect payment requests and transfer receipts (Vodafone Cash, InstaPay, Fawry) and answer inquiries from the teacher and secretaries accurately in English.
Provide concise, clear reports including:
- Student names and phone numbers.
- Paid amounts in EGP, and total amounts.
- Payment method used (Vodafone Cash, InstaPay, Fawry).
- Request status (Approved, Pending, Rejected).
- Dates and receipt reference numbers.
If asked "Who paid today?" or about specific amounts or receipts, analyze dates and receipt details and reply in clear bullet points.`;

    const promptText = `Teacher's question: "${question}"

Current payment requests and receipts (${payments.length} requests):
${JSON.stringify(payments, null, 2)}

Answer clearly in English with full details.`;

    const response = await callGeminiWithRetry({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      config: {
        systemInstruction,
      },
    });

    res.json({ success: true, answer: response.text });
  } catch (error: any) {
    console.error('Error analyzing payments with Gemini:', error);
    const info = classifyGeminiError(error);
    res.status(info.status).json({
      success: false,
      error: info.message,
      retryable: info.retryable,
      retryAfterSeconds: info.retryAfterSeconds,
    });
  }
});

// Route: Serve local pdf.js CMaps, Standard Fonts, ICCs & WASM for accurate Arabic PDF rendering
const pdfjsDistDir = path.resolve(__dirname, 'node_modules', 'pdfjs-dist');
app.use('/pdfjs/cmaps', express.static(path.join(pdfjsDistDir, 'cmaps'), { maxAge: '7d' }));
app.use('/pdfjs/standard_fonts', express.static(path.join(pdfjsDistDir, 'standard_fonts'), { maxAge: '7d' }));
app.use('/pdfjs/iccs', express.static(path.join(pdfjsDistDir, 'iccs'), { maxAge: '7d' }));
app.use('/pdfjs/wasm', express.static(path.join(pdfjsDistDir, 'wasm'), { maxAge: '7d' }));

// Route: Stream Google Drive / external PDF or document binary for in-platform viewer
app.get(['/api/doc-stream', '/api/proxy-file'], async (req, res) => {
  try {
    const rawDriveId = typeof req.query.driveId === 'string' ? req.query.driveId.trim() : '';
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const forceDownload = req.query.download === '1';
    const requestedFilename =
      typeof req.query.filename === 'string' && req.query.filename.trim()
        ? req.query.filename.trim().replace(/[^\w\u0600-\u06FF.\-_ ]+/g, '_')
        : 'document.pdf';

    if (!rawDriveId && !rawUrl) {
      return res.status(400).json({ success: false, error: 'File link or Google Drive ID is required' });
    }

    const extractDriveIdFromText = (input: string): string => {
      if (/^[A-Za-z0-9_-]{20,}$/.test(input)) return input;
      const m1 = input.match(/\/d\/([A-Za-z0-9_-]{15,})/);
      if (m1?.[1]) return m1[1];
      const m2 = input.match(/[?&]id=([A-Za-z0-9_-]{15,})/);
      if (m2?.[1]) return m2[1];
      return '';
    };

    const driveId = rawDriveId || (rawUrl.includes('drive.google.com') || rawUrl.includes('docs.google.com') ? extractDriveIdFromText(rawUrl) : '');

    const browserHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'application/pdf,application/octet-stream,image/*,*/*;q=0.8',
    };

    const streamBinaryResponse = async (upstream: globalThis.Response, fallbackName: string) => {
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const arrayBuf = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length === 0) {
        return false;
      }

      // Check PDF magic header if content-type is ambiguous
      const isPdfMagic = buffer.subarray(0, 5).toString('utf8') === '%PDF-';
      const resolvedContentType = isPdfMagic
        ? 'application/pdf'
        : contentType.split(';')[0].trim() || 'application/octet-stream';

      if (resolvedContentType.includes('text/html')) {
        return false;
      }

      res.setHeader('Content-Type', resolvedContentType);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (forceDownload) {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(fallbackName)}`
        );
      } else {
        res.setHeader('Content-Disposition', 'inline');
      }
      res.status(200).send(buffer);
      return true;
    };

    if (driveId) {
      const candidateUrls = [
        `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`,
        `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(driveId)}`,
        `https://docs.google.com/document/d/${encodeURIComponent(driveId)}/export?format=pdf`,
        `https://docs.google.com/presentation/d/${encodeURIComponent(driveId)}/export/pdf`,
      ];

      for (const candidate of candidateUrls) {
        try {
          const upstream = await fetch(candidate, {
            headers: browserHeaders,
            redirect: 'follow',
            signal: AbortSignal.timeout(20000),
          });
          if (!upstream.ok) continue;

          const ct = (upstream.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('text/html')) {
            // Check if Drive gave a virus-scan confirmation page with confirm/uuid inputs
            const html = await upstream.text();
            const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/i) || html.match(/[?&]confirm=([^&"']+)/i);
            const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/i) || html.match(/[?&]uuid=([^&"']+)/i);
            if (confirmMatch?.[1]) {
              const confirmUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
                driveId
              )}&export=download&confirm=${encodeURIComponent(confirmMatch[1])}${
                uuidMatch?.[1] ? `&uuid=${encodeURIComponent(uuidMatch[1])}` : ''
              }`;
              const confirmedResp = await fetch(confirmUrl, {
                headers: browserHeaders,
                redirect: 'follow',
                signal: AbortSignal.timeout(25000),
              });
              if (confirmedResp.ok && (await streamBinaryResponse(confirmedResp, requestedFilename))) {
                return;
              }
            }
            continue;
          }

          if (await streamBinaryResponse(upstream, requestedFilename)) {
            return;
          }
        } catch {
          // Try next candidate
        }
      }

      return res.status(403).json({
        success: false,
        error:
          'Unable to fetch the file directly from Google Drive. Make sure the file link is public (Anyone with the link) or try again.',
      });
    }

    // Standard external http(s) URL proxy (basic SSRF guard)
    let parsedTarget: URL;
    try {
      parsedTarget = new URL(rawUrl);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid file URL' });
    }

    if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
      return res.status(400).json({ success: false, error: 'Unsupported URL protocol' });
    }

    const host = parsedTarget.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.')
    ) {
      return res.status(403).json({ success: false, error: 'URL not allowed' });
    }

    const upstream = await fetch(parsedTarget.toString(), {
      headers: browserHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        success: false,
        error: `Failed to download file from source (${upstream.status})`,
      });
    }

    if (await streamBinaryResponse(upstream, requestedFilename)) {
      return;
    }

    return res.status(415).json({
      success: false,
      error: 'The source returned a web page rather than a direct PDF or document file',
    });
  } catch (error: any) {
    console.error('Error in /api/proxy-file:', error?.message || error);
    return res.status(502).json({
      success: false,
      error: 'An error occurred while loading the file, please try again',
    });
  }
});

// Route: Get Supabase SQL Schema for easy database setup
app.get('/api/supabase-schema', (_req, res) => {
  const schemaSQL = `-- ====================================================================
-- Database Script for "English with Miss Asmaa" on Supabase
-- Includes tables, RLS security policies, and admin account
-- ====================================================================

-- 1. User Profiles Table (profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    parent_phone VARCHAR(20),
    email VARCHAR(150),
    governorate VARCHAR(50) DEFAULT 'Cairo',
    grade VARCHAR(50) NOT NULL,
    role VARCHAR(20) DEFAULT 'student', -- 'student' | 'admin' | 'secretary'
    balance NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Courses & Lectures Table (courses)
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    chapter VARCHAR(150) NOT NULL,
    description TEXT,
    video_url TEXT NOT NULL,
    video_source VARCHAR(30) DEFAULT 'direct', -- 'direct' | 'youtube' | 'drive' | 'supabase'
    price NUMERIC(10, 2) DEFAULT 0.00,
    is_free BOOLEAN DEFAULT FALSE,
    grade VARCHAR(50) NOT NULL,
    duration_minutes INT DEFAULT 0,
    duration_seconds INT DEFAULT 0,
    views_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Files & Study Notes Table (documents)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    doc_type VARCHAR(50) DEFAULT 'Study Notes', -- 'Study Notes' | 'Question Sheet' | 'Grammar & Rules Summary'
    grade VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    file_size VARCHAR(30) DEFAULT '5 MB',
    downloads_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Assignments & Exams Table (exams)
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) DEFAULT 'exam', -- 'exam' | 'assignment' | 'sheet'
    grade VARCHAR(50) NOT NULL,
    duration_minutes INT DEFAULT 45,
    total_points INT DEFAULT 60,
    deadline VARCHAR(100),
    questions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Student Exam Submissions Table (exam_submissions)
CREATE TABLE IF NOT EXISTS public.exam_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_name VARCHAR(150),
    score INT NOT NULL,
    total_points INT NOT NULL,
    answers JSONB,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Bulk Redeem & Activation Codes Table (redeem_codes)
CREATE TABLE IF NOT EXISTS public.redeem_codes (
    code VARCHAR(50) PRIMARY KEY,
    amount NUMERIC(10, 2) NOT NULL,
    max_uses INT DEFAULT 1,
    used_count INT DEFAULT 0,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    created_by VARCHAR(50) DEFAULT 'General Admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Payment Requests & Transfer Receipts Table (payment_requests)
CREATE TABLE IF NOT EXISTS public.payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_name VARCHAR(150) NOT NULL,
    student_phone VARCHAR(20) NOT NULL,
    method VARCHAR(50) NOT NULL, -- 'vodafone_cash' | 'instapay' | 'fawry'
    amount NUMERIC(10, 2) NOT NULL,
    receipt_image TEXT,
    reference_number VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- 8. Platform Notifications Table (notifications)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    target_grade VARCHAR(50) DEFAULT 'All',
    is_urgent BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(100) DEFAULT 'Miss Asmaa',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Honor Board & Top Students Table (honor_board)
CREATE TABLE IF NOT EXISTS public.honor_board (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name VARCHAR(150) NOT NULL,
    governorate VARCHAR(50) NOT NULL,
    score INT NOT NULL,
    max_score INT DEFAULT 60,
    rank INT DEFAULT 1,
    title_badge VARCHAR(150) DEFAULT '1st Place Nationwide 🥇',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Secretaries & Assistants Table (secretaries)
CREATE TABLE IF NOT EXISTS public.secretaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'Secretaries & Assistants',
    permissions JSONB DEFAULT '{"manage_students": true, "manage_exams": true, "manage_payments": true}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Platform Settings Table (platform_settings)
CREATE TABLE IF NOT EXISTS public.platform_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO public.platform_settings (key, value) VALUES
    ('academic_year', '2026'),
    ('platform_name', 'English with Miss Asmaa'),
    ('contact_phone', '01069780486'),
    ('theme_color', 'golden')
ON CONFLICT (key) DO NOTHING;

-- 12. Student Private Support Messages Table (support_messages)
CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_key VARCHAR(150) NOT NULL,
    student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    student_name VARCHAR(150) NOT NULL,
    student_code VARCHAR(30),
    student_phone VARCHAR(30),
    student_grade VARCHAR(60),
    page_number VARCHAR(40),
    question_number VARCHAR(40),
    status VARCHAR(20) DEFAULT 'open',
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on support_messages" ON public.support_messages;
CREATE POLICY "Enable all on support_messages" ON public.support_messages FOR ALL USING (true) WITH CHECK (true);
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(schemaSQL);
});

// Setup Vite middleware in dev or static server in prod
async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: isHmrDisabled ? false : { server: httpServer },
        hmr: isHmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    if (isHmrDisabled) {
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const transformed = await vite.transformRequest('/@vite/client');
          if (!transformed?.code) return next();
          const patchedCode = transformed.code.replace(
            /let wsTransport = createWebSocketModuleRunnerTransport\(\{[\s\S]*?\}\);/,
            'let wsTransport = { async connect() {}, async disconnect() {}, send() {} }; /* HMR disabled (DISABLE_HMR=true): no-op transport */'
          );
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          return res.send(patchedCode);
        } catch {
          return next();
        }
      });
    }
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
