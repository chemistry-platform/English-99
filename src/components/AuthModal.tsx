/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  User,
  Mail,
  Lock,
  Sparkles,
  CheckCircle,
} from 'lucide-react';
import { UserProfile, PlatformSettings } from '../types';
import { platformDB } from '../lib/storage';
import { generateUuid } from '../lib/supabase';
import {
  useLanguage,
  formatTemplate,
  getLocalizedPlatformName,
  getGovernorateDisplayLabel,
  getGradeDisplayLabel,
} from '../lib/translations';
import { Modal } from './Modal';
import { BrandLogo } from './BrandLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  settings: PlatformSettings;
}

const EGYPT_GOVERNORATES = [
  'Cairo',
  'Giza',
  'Alexandria',
  'Dakahlia',
  'Gharbia',
  'Sharqia',
  'Monufia',
  'Qalyubia',
  'Beheira',
  'Kafr El-Sheikh',
  'Damietta',
  'Port Said',
  'Ismailia',
  'Suez',
  'Beni Suef',
  'Fayoum',
  'Minya',
  'Assiut',
  'Sohag',
  'Qena',
  'Luxor',
  'Aswan',
  'Red Sea',
  'New Valley',
  'Matrouh',
  'North Sinai',
  'South Sinai',
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  settings,
}) => {
  const { lang, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Register form state
  const [regFullName, setRegFullName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regParentPhone, setRegParentPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regGovernorate, setRegGovernorate] = useState('Cairo');
  const [regGrade, setRegGrade] = useState('3rd Secondary');
  const [regError, setRegError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const trimmed = loginIdentifier.trim();
    if (!trimmed) return;

    if (trimmed.toLowerCase() === 'amr12345@gmail.com') {
      const adminUser: UserProfile = {
        id: 'admin-amr',
        studentCode: 'ADMIN-AMR',
        fullName: 'Miss Asmaa (Super Admin)',
        phone: '01069780486',
        email: 'Amr12345@gmail.com',
        governorate: 'Dakahlia',
        grade: 'All',
        role: 'admin',
        balance: 9999,
        createdAt: new Date().toISOString(),
      };
      platformDB.setCurrentUser(adminUser);
      onSuccess(adminUser);
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      // Query live Supabase profiles exclusively so login works consistently from any device
      const { profile: remoteStudent, error } = await platformDB.findProfileRemoteWithStatus(trimmed);
      if (error) {
        setLoginError(formatTemplate(t.auth.errSupabaseVerify, { err: error }));
        return;
      }

      if (remoteStudent) {
        if (remoteStudent.password && remoteStudent.password.trim() !== '' && loginPassword !== remoteStudent.password) {
          setLoginError(t.auth.errWrongPass);
          return;
        }
        platformDB.setCurrentUser(remoteStudent);
        onSuccess(remoteStudent);
        onClose();
        return;
      }

      const secretaries = platformDB.getSecretaries();
      const foundSec = secretaries.find((sec) => sec.phone === trimmed);
      if (foundSec) {
        const secUser: UserProfile = {
          id: foundSec.id,
          studentCode: `SEC-${foundSec.phone.slice(-4)}`,
          fullName: foundSec.name,
          phone: foundSec.phone,
          governorate: 'Mansoura',
          grade: 'All',
          role: 'secretary',
          balance: 0,
          createdAt: foundSec.createdAt,
        };
        platformDB.setCurrentUser(secUser);
        onSuccess(secUser);
        onClose();
        return;
      }

      setLoginError(t.auth.errNoRegisteredAccount);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (!regFullName.trim() || !regPhone.trim() || !regParentPhone.trim() || !regPassword.trim()) {
      setRegError(t.auth.errRegRequired);
      return;
    }

    if (regPhone.trim().length < 10) {
      setRegError(t.auth.errRegPhoneFormat);
      return;
    }

    setIsSubmitting(true);
    try {
      const { profile: existingByPhone, error: phoneCheckErr } = await platformDB.findProfileRemoteWithStatus(
        regPhone.trim()
      );
      if (phoneCheckErr) {
        setRegError(formatTemplate(t.auth.errSupabaseConnect, { err: phoneCheckErr }));
        return;
      }
      if (existingByPhone) {
        setRegError(t.auth.errPhoneExists);
        return;
      }

      if (regEmail.trim()) {
        const { profile: existingByEmail, error: emailCheckErr } = await platformDB.findProfileRemoteWithStatus(
          regEmail.trim()
        );
        if (emailCheckErr) {
          setRegError(formatTemplate(t.auth.errSupabaseConnect, { err: emailCheckErr }));
          return;
        }
        if (existingByEmail) {
          setRegError(t.auth.errEmailExists);
          return;
        }
      }

      await platformDB.syncWithSupabase();
      const latestStudents = platformDB.getStudents();
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const newCodeNumber = 100 + latestStudents.length + 1;
      const generatedCode = latestStudents.some((s) => s.studentCode === `AMR-${newCodeNumber}`)
        ? `AMR-${newCodeNumber}-${randomSuffix}`
        : `AMR-${newCodeNumber}`;

      const newStudent: UserProfile = {
        id: generateUuid(),
        studentCode: generatedCode,
        fullName: regFullName.trim(),
        phone: regPhone.trim(),
        parentPhone: regParentPhone.trim(),
        email: regEmail.trim() || undefined,
        password: regPassword.trim(),
        governorate: regGovernorate,
        grade: regGrade,
        role: 'student',
        balance: 0,
        completedLectures: [],
        createdAt: new Date().toISOString(),
      };

      const { supabaseResult } = await platformDB.saveStudentAsync(newStudent);
      if (!supabaseResult.success) {
        setRegError(
          formatTemplate(t.auth.errSaveAccount, { err: supabaseResult.error || t.common.retry })
        );
        return;
      }

      const verifiedProfile = (await platformDB.findProfileRemote(newStudent.phone)) || newStudent;
      platformDB.setCurrentUser(verifiedProfile);
      onSuccess(verifiedProfile);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-md"
      panelClassName="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700/80"
      headerClassName="px-4 sm:px-6 py-4 bg-gradient-to-r from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-[#1E293B] dark:to-slate-900 border-b border-slate-200 dark:border-slate-800 items-start"
      closeButtonClassName="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
      headerContent={
        <div className="text-center ps-2">
          <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 to-blue-500 shadow-xl mb-2.5">
            <BrandLogo className="w-full h-full rounded-full" />
          </div>

          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center justify-center gap-1.5">
            <span>{getLocalizedPlatformName(settings.platformName, t)}</span>
            <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {activeTab === 'login' ? t.auth.modalLoginSubtitle : t.auth.modalRegisterSubtitle}
          </p>
        </div>
      }
      tabs={
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('login')}
            className={`py-2.5 rounded-xl transition-all cursor-pointer ${
              activeTab === 'login'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.auth.signInBtn}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`py-2.5 rounded-xl transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.auth.tabRegister}
          </button>
        </div>
      }
      bodyClassName="p-5 sm:p-6"
    >
      {activeTab === 'login' ? (
        <form onSubmit={handleLogin} className="space-y-4">
          {loginError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
              {loginError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t.auth.identifierLabel}
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder={t.auth.identifierPlaceholder}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pe-3.5 py-2.5 ps-10 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t.auth.passwordLabel}</label>
            </div>
            <div className="relative">
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder={t.auth.passwordPlaceholder}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pe-3.5 py-2.5 ps-10 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 disabled:opacity-60 text-white font-bold text-sm shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{isSubmitting ? t.auth.signingInBtn : t.auth.signInHeroBtn}</span>
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('register')}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-semibold cursor-pointer"
            >
              {t.auth.newStudentPrompt}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="space-y-3.5">
          {regError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
              {regError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t.auth.fullNameShortLabel} <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={regFullName}
                onChange={(e) => setRegFullName(e.target.value)}
                placeholder={t.auth.regFullNameExample}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pe-3 py-2 ps-9 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <User className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.auth.studentPhoneLabel} <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                type="tel"
                dir="ltr"
                required
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                placeholder="010XXXXXXXX"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.auth.parentPhoneLabel} <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                type="tel"
                dir="ltr"
                required
                value={regParentPhone}
                onChange={(e) => setRegParentPhone(e.target.value)}
                placeholder="011XXXXXXXX"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.auth.emailOptionalLabel}
              </label>
              <input
                type="email"
                dir="ltr"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder={t.auth.emailPlaceholder}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.auth.passwordLabel} <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                type="password"
                required
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder={t.auth.rememberPasswordPlaceholder}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.auth.governorateLabel} <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                value={regGovernorate}
                onChange={(e) => setRegGovernorate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                {EGYPT_GOVERNORATES.map((gov) => (
                  <option key={gov} value={gov}>
                    {getGovernorateDisplayLabel(gov, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.auth.gradeLabel} <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                value={regGrade}
                onChange={(e) => setRegGrade(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="3rd Secondary">{getGradeDisplayLabel('3rd Secondary', t, settings.academicYear)}</option>
                <option value="2nd Secondary">{getGradeDisplayLabel('2nd Secondary', t)}</option>
                <option value="1st Secondary">{getGradeDisplayLabel('1st Secondary', t)}</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-600 disabled:opacity-60 text-white font-bold text-sm shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isSubmitting ? t.auth.creatingAccountBtn : t.auth.createAndSignInBtn}</span>
          </button>
        </form>
      )}
    </Modal>
  );
};
