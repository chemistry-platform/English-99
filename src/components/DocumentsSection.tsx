/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileText,
  Eye,
  Search,
  Globe,
  HardDrive,
} from 'lucide-react';
import { ChemistryDocument } from '../types';
import { normalizeDocType, normalizeGrade } from '../lib/courseHelpers';
import { requestCrossBrowserFullscreen } from '../lib/fullscreen';
import { getDocTypeDisplayLabel, getGradeDisplayLabel, useLanguage } from '../lib/translations';

interface DocumentsSectionProps {
  documents: ChemistryDocument[];
  selectedGrade: string;
  onOpenDocument: (doc: ChemistryDocument) => void;
  onOpenInBrowserViewer?: (doc: ChemistryDocument) => void;
}

export const DocumentsSection: React.FC<DocumentsSectionProps> = ({
  documents,
  selectedGrade,
  onOpenDocument,
  onOpenInBrowserViewer,
}) => {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('All');

  const normalizedSelectedGrade = normalizeGrade(selectedGrade);

  const filtered = documents.filter((doc) => {
    if (
      normalizedSelectedGrade !== 'All' &&
      normalizeGrade(doc.grade) !== normalizedSelectedGrade
    ) {
      return false;
    }
    if (selectedType !== 'All' && normalizeDocType(doc.docType) !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        normalizeDocType(doc.docType).toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white dark:bg-[#0F172A] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            <h2 className="text-[20px] sm:text-xl font-bold text-slate-900 dark:text-white">{t.documents.approvedTitle}</h2>
          </div>
          <p className="text-[14px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {t.documents.approvedSubtitle}
          </p>
        </div>

        {/* Types Filter */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-[13px] sm:text-xs font-semibold overflow-x-auto max-w-full no-scrollbar">
          {['All', 'Study Notes', 'Question Sheet', 'Grammar & Rules Summary'].map((typeKey) => (
            <button
              key={typeKey}
              onClick={() => setSelectedType(typeKey)}
              className={`min-h-[44px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                selectedType === typeKey
                  ? 'bg-amber-500 text-slate-950 font-bold shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {typeKey === 'All' ? t.documents.filterAllTypes : getDocTypeDisplayLabel(typeKey, t)}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.documents.searchDetailedPlaceholder}
          className="w-full bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3.5 ps-11 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 shadow-inner"
        />
        <Search className="w-5 h-5 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
      </div>

      {/* Documents Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-slate-800/80 p-8">
          <FileText className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <h4 className="text-slate-900 dark:text-white font-bold text-base">{t.documents.emptyGradeTitle}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.documents.emptyGradeDesc}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 hover:border-amber-500/50 shadow-xl transition-all flex flex-col justify-between group"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-blue-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                    <FileText className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    {getDocTypeDisplayLabel(normalizeDocType(doc.docType), t)}
                  </span>
                </div>

                <div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                      <HardDrive className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span>{t.documents.driveBadge}</span>
                    </span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                      {doc.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 dark:text-slate-400 mt-2">
                    <span>{doc.pagesCount} {t.common.pages}</span>
                    <span>•</span>
                    <span dir="ltr">{doc.fileSize}</span>
                    <span>•</span>
                    <span>{getGradeDisplayLabel(doc.grade, t)}</span>
                  </div>
                </div>
              </div>

              {/* Actions: View in inline viewer / Direct browser view */}
              <div className="pt-5 mt-5 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    void requestCrossBrowserFullscreen(window.document.documentElement);
                    onOpenDocument(doc);
                  }}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[14px] sm:text-xs shadow-md transition-all cursor-pointer"
                  title={t.documents.builtInReaderTitle}
                >
                  <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span>{t.documents.builtInReader}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void requestCrossBrowserFullscreen(window.document.documentElement);
                    (onOpenInBrowserViewer || onOpenDocument)(doc);
                  }}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[14px] sm:text-xs shadow-md transition-all cursor-pointer"
                  title={t.documents.webViewerTitle}
                >
                  <Globe className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span>{t.documents.webViewer}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
