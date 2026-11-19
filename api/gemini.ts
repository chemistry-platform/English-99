import { GoogleGenAI } from '@google/genai';

const PRIMARY = 'gemini-4-hydrogen';
const FALLBACK = 'gemini-3.1-flash-lite';

function client() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('MISSING_API_KEY');
  return new GoogleGenAI({ apiKey });
}

async function generate(params: { contents: any; config?: any }) {
  const ai = client();
  let lastErr: any;
  for (const model of [PRIMARY, FALLBACK]) {
    try {
      return await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function stripB64(s: string) {
  return s.replace(/^data:image\/[a-z]+;base64,/, '');
}

export default async function handler(req: any, res: any) {
  const action = String(req.query.action || '');
  try {
    const b = req.body || {};

    if (action === 'reset') {
      const r = await generate({
        contents: [{ role: 'user', parts: [{ text: 'Reply with one word only: Ready' }] }],
        config: { maxOutputTokens: 16 },
      });
      return res.status(200).json({
        success: true,
        reply: (r.text || '').trim() || 'Ready',
        message: 'AI engine reset and connection activated successfully ⚡',
      });
    }

    if (action === 'chat') {
      const { message, history = [], context = '', imageBase64, mimeType = 'image/jpeg' } = b;
      const contents: any[] = [];
      if (context) contents.push({ role: 'user', parts: [{ text: `Context: ${context}` }] });
      for (const h of history) {
        contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] });
      }
      const parts: any[] = [];
      if (imageBase64) parts.push({ inlineData: { mimeType, data: stripB64(imageBase64) } });
      parts.push({ text: message });
      contents.push({ role: 'user', parts });

      const r = await generate({
        contents,
        config: {
          systemInstruction:
            "You are 'Miss Asmaa AI' - the smart assistant for the 'English with Miss Asmaa' educational platform. Answer in clear, accurate, encouraging English, specializing in English grammar, vocabulary, reading comprehension, writing, translation, and exam preparation. Official platform contact: 01069780486.",
        },
      });
      return res.status(200).json({ success: true, text: r.text || '' });
    }

    if (action === 'extract-questions') {
      const { imageBase64, mimeType = 'image/jpeg', promptText = '', grade = '3rd Secondary', subject = 'English Language' } = b;
      const parts: any[] = [];
      if (imageBase64) parts.push({ inlineData: { mimeType, data: stripB64(imageBase64) } });
      parts.push({
        text: `Subject and Grade: ${subject} - ${grade}.\nInstructions: ${promptText || 'Extract or generate all English language questions accurately (grammar, vocabulary, reading comprehension, or quizzes) with the model answer and clear explanation.'}\nReturn JSON only.`,
      });
      const r = await generate({
        contents: { parts },
        config: {
          systemInstruction:
            'Extract or generate English language exam questions (grammar, vocabulary, reading comprehension, and quizzes) with high accuracy. Return JSON only in this format: {"title":"...","questions":[{"id":"q1","type":"mcq","question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":"A","explanation":"...","points":2,"chapter":"..."}]}',
          responseMimeType: 'application/json',
        },
      });
      let data;
      try {
        data = JSON.parse(r.text || '{}');
      } catch {
        const m = (r.text || '').match(/\{[\s\S]*\}/);
        data = m ? JSON.parse(m[0]) : { questions: [] };
      }
      return res.status(200).json({ success: true, data });
    }

    if (action === 'rephrase-question') {
      const { question, targetFormat = 'mcq', subject = 'English Language (Grammar, Vocabulary, Reading)' } = b;
      const prompt = `Rephrase the following question in (${subject}) to become (${
        targetFormat === 'mcq' ? 'a multiple-choice question with 4 options, the correct answer, and a clear explanation' : 'an essay/open-ended question with a model answer'
      }):\n"${question}"\nReply with JSON only: {"question":"...","type":"${targetFormat}","options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":"A","explanation":"..."}`;
      const r = await generate({ contents: prompt, config: { responseMimeType: 'application/json' } });
      return res.status(200).json({ success: true, data: JSON.parse(r.text || '{}') });
    }

    if (action === 'scan-students') {
      const { imageBase64, mimeType = 'image/jpeg' } = b;
      if (!imageBase64) return res.status(400).json({ success: false, error: 'No image provided' });
      const r = await generate({
        contents: {
          parts: [
            { inlineData: { mimeType, data: stripB64(imageBase64) } },
            {
              text: 'Extract the list of students from the roster image. Return JSON only: {"students":[{"name":"","phone":"","parentPhone":"","governorate":"","grade":""}]}',
            },
          ],
        },
        config: { responseMimeType: 'application/json' },
      });
      const parsed = JSON.parse(r.text || '{"students":[]}');
      return res.status(200).json({ success: true, students: parsed.students || [] });
    }

    if (action === 'analyze-students') {
      const { question = 'Who logged in or registered today?', students = [] } = b;
      const r = await generate({
        contents: [
          {
            role: 'user',
            parts: [{ text: `Teacher's inquiry: "${question}"\nStudent records (${students.length}):\n${JSON.stringify(students)}\nAnswer clearly in English.` }],
          },
        ],
        config: { systemInstruction: "You are Miss Asmaa's smart administrative assistant. Analyze student records and answer accurately in organized bullet points." },
      });
      return res.status(200).json({ success: true, answer: r.text });
    }

    if (action === 'analyze-payments') {
      const { question = 'Who paid today?', payments = [] } = b;
      const r = await generate({
        contents: [
          {
            role: 'user',
            parts: [{ text: `Teacher's question: "${question}"\nPayment records (${payments.length}):\n${JSON.stringify(payments)}\nAnswer in English with full details.` }],
          },
        ],
        config: { systemInstruction: "You are Miss Asmaa's financial assistant. Analyze payment records and answer in clear bullet points including names, amounts in EGP, payment method, and status." },
      });
      return res.status(200).json({ success: true, answer: r.text });
    }

    return res.status(404).json({ success: false, error: 'Unknown action' });
  } catch (e: any) {
    console.error('Gemini API error:', e);
    const msg = String(e?.message || e);
    const status = msg === 'MISSING_API_KEY' ? 400 : 500;
    return res.status(status).json({
      success: false,
      error: msg === 'MISSING_API_KEY' ? 'Gemini API key is not configured in Vercel' : msg,
    });
  }
}
