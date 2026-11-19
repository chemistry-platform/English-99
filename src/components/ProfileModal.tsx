/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Save,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { UserProfile, PlatformSettings } from '../types';
import { platformDB } from '../lib/storage';
import { normalizeGrade } from '../lib/courseHelpers';
import {
  useLanguage,
  formatTemplate,
  getGradeDisplayLabel,
} from '../lib/translations';
import { Modal } from './Modal';
import { BrandLogo } from './BrandLogo';

interface ProfileModalProps {
  isOpen: boolean;
  currentUser: UserProfile | null;
  settings: PlatformSettings;
  onClose: () => void;
  onUpdated: (user: UserProfile) => void;
  onSelectTab: (tab: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  currentUser,
  settings,
  onClose,
  onUpdated,
  onSelectTab,
}) => {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [parentPhone, setParentPhone] = useState(currentUser?.parentPhone || '');
  const [governorate, setGovernorate] = useState(currentUser?.governorate || 'Cairo');
  const [grade, setGrade] = useState(normalizeGrade(currentUser?.grade) || '3rd Secondary');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setFullName(currentUser.fullName || '');
      setParentPhone(currentUser.parentPhone || '');
      setGovernorate(currentUser.governorate || 'Cairo');
      setGrade(normalizeGrade(currentUser.grade) || '3rd Secondary');
      setErrorMessage(null);
      setIsSaving(false);
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !currentUser || currentUser.role !== 'student') return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMessage(t.auth.errEnterFullName);
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);
    try {
      const updated: UserProfile = {
        ...currentUser,
        fullName: trimmedName,
        parentPhone: parentPhone.trim(),
        governorate: governorate.trim() || currentUser.governorate,
        grade,
      };

      const { supabaseResult } = await platformDB.saveStudentAsync(updated);
      if (!supabaseResult.success) {
        setErrorMessage(
          formatTemplate(t.auth.errSaveProfile, { err: supabaseResult.error || t.common.retry })
        );
        return;
      }

      platformDB.setCurrentUser(updated);
      onUpdated(updated);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      panelClassName="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700"
      headerClassName="px-4 sm:px-6 py-4 bg-gradient-to-r from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-[#1E293B] dark:to-slate-900 border-b border-slate-200 dark:border-slate-800"
      closeButtonClassName="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-slate-700"
      headerContent={
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 to-blue-500 shadow-md shrink-0">
            <BrandLogo className="w-full h-full rounded-full" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              {t.auth.profileRoleBadge}
            </span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5 truncate">{currentUser.fullName}</h3>
          </div>
        </div>
      }
      bodyClassName="p-5 sm:p-6 space-y-5"
    >
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5">{t.auth.academicStudentCode}</span>
          <span dir="ltr" className="inline-block text-base font-black text-amber-600 dark:text-amber-400 font-mono tracking-wider">
            {currentUser.studentCode}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5">{t.wallet.currentBalanceLabel}</span>
          <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {currentUser.balance} {t.common.currency}
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Edit Form */}
      <form onSubmit={handleSave} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.auth.fullNameShortLabel}:</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.auth.studentPhoneLabel}:</label>
            <input
              type="text"
              dir="ltr"
              disabled
              value={currentUser.phone}
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-500 dark:text-slate-400 cursor-not-allowed font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.auth.parentPhoneLabel}:</label>
            <input
              type="tel"
              dir="ltr"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.auth.governorateLabel}:</label>
            <input
              type="text"
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.auth.gradeLabel}:</label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="3rd Secondary">{getGradeDisplayLabel('3rd Secondary', t, settings.academicYear)}</option>
              <option value="2nd Secondary">{getGradeDisplayLabel('2nd Secondary', t)}</option>
              <option value="1st Secondary">{getGradeDisplayLabel('1st Secondary', t)}</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectTab('wallet');
            }}
            className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{t.auth.manageTopUpWallet}</span>
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{isSaving ? t.auth.savingBtn : t.auth.saveChangesShort}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
