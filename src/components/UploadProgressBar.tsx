/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, CloudUpload } from 'lucide-react';
import { UploadProgressInfo } from '../lib/uploadManager';
import { useLanguage } from '../lib/translations';

interface UploadProgressBarProps {
  info: UploadProgressInfo | null;
  onCancel?: () => void;
  className?: string;
}

export const UploadProgressBar: React.FC<UploadProgressBarProps> = ({ info, className = '' }) => {
  const { t } = useLanguage();
  if (!info) return null;

  const isError = !!info.error;
  const isComplete = !isError && (info.isComplete || info.percent >= 100);

  return (
    <div
      className={`p-4 rounded-2xl border ${
        isError
          ? 'border-red-300 dark:border-red-500/50 bg-red-50 dark:bg-red-950/20'
          : isComplete
          ? 'border-emerald-300 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20'
          : 'border-amber-300 dark:border-amber-500/40 bg-slate-50 dark:bg-slate-950/80'
      } shadow-xl space-y-3 transition-all ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {isError ? (
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          ) : isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <CloudUpload className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-pulse shrink-0" />
          )}
          <span
            className={`font-bold break-words ${
              isError
                ? 'text-red-700 dark:text-red-300'
                : isComplete
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {isError ? `${t.upload.uploadFailed} ${info.error}` : info.statusText || t.upload.uploadCompleted}
          </span>
        </div>

        {/* Real Percentage */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`font-mono text-sm font-extrabold ${
              isError ? 'text-red-600 dark:text-red-400' : isComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {info.percent}%
          </span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-700/60 relative">
        <div
          className={`h-full rounded-full transition-all duration-300 relative overflow-hidden ${
            isError
              ? 'bg-red-500'
              : isComplete
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
              : 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, info.percent))}%` }}
        >
          {/* Shimmer animation */}
          {!isComplete && !isError && (
            <div className="absolute inset-0 bg-white/25 w-full animate-pulse" />
          )}
        </div>
      </div>

      {/* Sub Info: Size and Speed */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
        <span>
          {info.loadedFormatted} / {info.totalFormatted}
        </span>
        <span className={`${isError ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400/90'} font-sans`}>
          {info.speedText}
        </span>
      </div>
    </div>
  );
};
