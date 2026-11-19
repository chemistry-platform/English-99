/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Paperclip,
  Image as ImageIcon,
  Copy,
  Check,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  image?: string;
  isError?: boolean;
  timestamp: string;
}

interface GeminiChatPanelProps {
  onAddQuestionToExam?: (questionData: any) => void;
  className?: string;
}

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  sender: 'ai',
  text: `Welcome, Miss Asmaa! I am your Super AI Assistant (Gemini 4 Hydrogen).
I am ready and calibrated with high precision for all English language teaching needs:
• English Grammar & Sentence Structure (Tenses, Clauses, Conditionals, Reported Speech).
• Vocabulary, Phrasal Verbs, Collocations & Idioms.
• Reading Comprehension, Essay Writing, Translation & Exam/Homework Design.
Type any question, attach an image from a workbook or worksheet, or ask to rephrase an exam item and I will respond right away! ⚡`,
  timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
};

export const GeminiChatPanel: React.FC<GeminiChatPanelProps> = ({
  className = '',
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME_MESSAGE]);

  const [inputMessage, setInputMessage] = useState('');
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleEmergencyReset = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setResetStatus(null);
    setIsLoading(false);

    // Clear stale error messages and local image/input errors
    setMessages((prev) => prev.filter((m) => !m.isError));

    try {
      const res = await fetch('/api/gemini/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setResetStatus({
          success: true,
          message: data.message || `AI engine (${data.model || 'Gemini 4 Hydrogen'}) reset and connection refreshed successfully ✅`,
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `ai_reset_${Date.now()}`,
            sender: 'ai',
            text: `🔄 Emergency reset completed! Connection is stable and ready via ${data.model || 'Gemini 4 Hydrogen'}. You may continue now ⚡`,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        setResetStatus({
          success: false,
          message: data.error || 'Could not refresh the AI connection. Please verify your API key in Settings (Secrets).',
        });
      }
    } catch (err: any) {
      setResetStatus({
        success: false,
        message: err?.message || 'A network error occurred during the AI emergency reset.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() && !selectedImageBase64) return;

    const userMsgId = `usr_${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: textToSend,
      image: selectedImageBase64 || undefined,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputMessage('');
    const curImg = selectedImageBase64;
    setSelectedImageBase64(null);
    setSelectedImageName(null);
    setResetStatus(null);
    setIsLoading(true);

    try {
      const history = messages
        .filter((m) => !m.isError)
        .slice(-10)
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
          text: m.text,
        }));

      const sendRequest = async () => {
        const res = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            history,
            imageBase64: curImg,
          }),
        });
        const data = await res.json();
        return { res, data };
      };

      let { res, data } = await sendRequest();

      if ((!res.ok || !data.success) && data?.retryable) {
        const waitMs = Math.min(5000, Math.max(1500, (data.retryAfterSeconds || 2) * 1000));
        await new Promise((r) => setTimeout(r, waitMs));
        const retryResult = await sendRequest();
        res = retryResult.res;
        data = retryResult.data;
      }

      if (res.ok && data.success && data.text) {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            sender: 'ai',
            text: data.text,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        throw new Error(data?.error || 'Could not reach the AI service right now.');
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_err_${Date.now()}`,
          sender: 'ai',
          isError: true,
          text: `⚠️ ${err?.message || 'Unable to connect to the AI service right now. Please try again or use the Emergency Reset button.'}`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSelectedImageBase64(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputMessage(prompt);
  };

  return (
    <div className={`flex flex-col h-[650px] bg-white dark:bg-[#0A0F1D] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Super AI Assistant (Gemini 4 Hydrogen)</h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                Ultra-Fast ⚡
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Live chat for drafting English grammar, vocabulary, reading comprehension, and exam questions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleEmergencyReset}
            disabled={isResetting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-bold transition-colors disabled:opacity-60"
            title="Clear cache and verify/re-activate AI connection"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>{isResetting ? 'Resetting...' : 'Emergency Reset'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setResetStatus(null);
              setMessages([
                {
                  id: 'reset',
                  sender: 'ai',
                  text: 'New chat session started! How can I help you today with your English lessons or exams? ✨',
                  timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                },
              ]);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            title="Start a new conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {/* Emergency Reset Status Banner */}
      {resetStatus && (
        <div
          className={`px-4 py-2 text-xs font-semibold border-b flex items-center justify-between gap-2 ${
            resetStatus.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {resetStatus.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{resetStatus.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setResetStatus(null)}
            className="text-[11px] opacity-75 hover:opacity-100 underline"
          >
            Hide
          </button>
        </div>
      )}

      {/* Quick Prompts Bar */}
      <div className="px-4 py-2 bg-slate-100 dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
        {[
          { label: '⚡ 3rd Secondary Grammar MCQs', prompt: 'Generate 3 high-level 3rd Secondary English MCQs on Past Perfect vs. Past Simple and Passive Voice with full explanations.' },
          { label: '🔄 Rephrase This Question', prompt: 'I will give you a question and I want you to rephrase it into a higher-order thinking MCQ: ' },
          { label: '📚 Vocabulary & Phrasal Verbs', prompt: 'Create an advanced vocabulary practice exercise covering phrasal verbs and collocations with model answers.' },
          { label: '📝 Design a Full Homework Sheet', prompt: 'Design a 5-question English homework sheet mixing MCQs and essay writing prompts with model answers and explanations.' },
          { label: '📖 Reading Comprehension Passage', prompt: 'Write a short 3rd Secondary English reading passage with 3 inference and vocabulary questions and answers.' },
        ].map((item, idx) => (
          <button
            key={idx}
            onClick={() => handleQuickPrompt(item.prompt)}
            className="px-3 py-1 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-purple-50 dark:hover:bg-purple-600/30 hover:border-purple-500/50 border border-slate-300 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:text-purple-700 dark:hover:text-white whitespace-nowrap transition-all text-[11px]"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Message History Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-transparent">
        {messages.map((msg) => {
          const isAi = msg.sender === 'ai';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isAi ? 'flex-row' : 'flex-row-reverse'}`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isAi
                    ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white'
                    : 'bg-amber-500 text-slate-950 font-bold'
                }`}
              >
                {isAi ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                  msg.isError
                    ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-500/40 shadow-md'
                    : isAi
                    ? 'bg-white dark:bg-[#131C31] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 shadow-md'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-medium shadow-lg'
                }`}
              >
                {msg.image && (
                  <div className="mb-2 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700">
                    <img src={msg.image} alt="Attached image" className="max-h-48 w-auto object-contain bg-slate-900/20" />
                  </div>
                )}

                <div className="whitespace-pre-wrap font-sans">{msg.text}</div>

                <div
                  className={`flex items-center justify-between gap-4 mt-2 pt-2 border-t ${
                    isAi ? 'border-slate-200 dark:border-slate-800 text-slate-500' : 'border-amber-600/40 text-slate-900/80'
                  } text-[10px]`}
                >
                  <span>{msg.timestamp}</span>

                  {isAi && (
                    <div className="flex items-center gap-3">
                      {msg.isError && (
                        <button
                          type="button"
                          onClick={handleEmergencyReset}
                          className="text-rose-600 dark:text-rose-300 hover:underline font-bold flex items-center gap-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${isResetting ? 'animate-spin' : ''}`} />
                          <span>Reset</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors"
                        title="Copy response"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                            <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600 dark:text-purple-400" />
              <span>Analyzing and drafting response accurately via Gemini...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Image Preview if selected */}
      {selectedImageBase64 && (
        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <ImageIcon className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <span>Selected image for analysis: <strong>{selectedImageName}</strong></span>
          </div>
          <button
            onClick={() => {
              setSelectedImageBase64(null);
              setSelectedImageName(null);
            }}
            className="text-red-600 dark:text-red-400 hover:text-red-500 text-xs font-semibold"
          >
            Remove Image
          </button>
        </div>
      )}

      {/* Input Bar */}
      <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            title="Attach question image or exam sheet"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your English question, grammar rule, or ask to generate exam questions..."
            className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />

          <button
            type="submit"
            disabled={(!inputMessage.trim() && !selectedImageBase64) || isLoading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg flex items-center gap-1.5 transition-all"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
