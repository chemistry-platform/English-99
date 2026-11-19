/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Database } from 'lucide-react';
import { getTranslations } from '../lib/translations';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  origin: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    origin: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      origin: error.stack?.split('\n')[1]?.trim() || 'Supabase / React runtime',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error.message, error, errorInfo);
    this.setState({
      error,
      errorInfo,
      origin: error.stack?.split('\n')[1]?.trim() || errorInfo.componentStack?.split('\n')[1]?.trim() || 'React runtime',
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, origin: '' });
  };

  public render() {
    if (this.state.hasError) {
      const t = getTranslations();
      const errorMessage = this.state.error?.message || t.errorBoundary.unknownError;
      const sourceOrigin = this.state.origin || t.errorBoundary.checkingConnection;

      return (
        <div className="min-h-dvh bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5 animate-in fade-in">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {t.errorBoundary.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.errorBoundary.subtitle}
              </p>
            </div>

            {/* Real Error Message and Origin Display in Small Font */}
            <div dir="ltr" className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 text-left space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold font-sans">
                <Database className="w-3.5 h-3.5" />
                <span>{t.errorBoundary.detailsLabel}</span>
              </div>
              <p className="text-rose-600 dark:text-rose-400 break-all text-[11px] leading-relaxed">
                {errorMessage}
              </p>
              <div className="text-[10px] text-slate-500 break-all pt-1 border-t border-slate-200 dark:border-slate-800/80">
                <span className="text-slate-600 dark:text-slate-400 font-sans">{t.errorBoundary.sourceLabel}</span> {sourceOrigin}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t.errorBoundary.retryContinue}</span>
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs border border-slate-300 dark:border-slate-700 transition-all cursor-pointer"
              >
                {t.errorBoundary.refreshPage}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
