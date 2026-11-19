/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  CheckCircle,
  Loader2,
  AlertCircle,
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
import { BrandLogo } from './BrandLogo';

interface LoginPageProps {
  onBackHome: () => void;
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

export const LoginPage: React.FC<LoginPageProps> = ({
  onBackHome,
  onSuccess,
  settings,
}) => {
  const { lang, isRTL, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Register form state
  const [regFullName, setRegFullName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regParentPhone, setRegParentPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regGovernorate, setRegGovernorate] = useState('Cairo');
  const [regGrade, setRegGrade] = useState('3rd Secondary');
  const [regError, setRegError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedLoginId = loginIdentifier.trim();
  const isAdminIdentifier = normalizedLoginId.toLowerCase() === 'amr12345@gmail.com';
  const matchedLocalSecretary = platformDB
    .getSecretaries()
    .find((sec) => sec.phone.trim() === normalizedLoginId);
  const isPasswordOptional = isAdminIdentifier || Boolean(matchedLocalSecretary);

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
      return;
    }

    const secretaries = platformDB.getSecretaries();
    const foundSec = secretaries.find((sec) => sec.phone.trim() === trimmed);

    setIsSubmitting(true);
    try {
      const { profile: remoteStudent, error } = await platformDB.findProfileRemoteWithStatus(trimmed);
      if (error) {
        setLoginError(formatTemplate(t.auth.errSupabaseVerify, { err: error }));
        return;
      }

      if (remoteStudent) {
        const isExemptRole = remoteStudent.role === 'admin' || remoteStudent.role === 'secretary';
        if (!isExemptRole) {
          if (!loginPassword.trim()) {
            setLoginError(t.auth.errPasswordRequired);
            return;
          }
          if (!remoteStudent.password || remoteStudent.password.trim() === '') {
            setLoginError(t.auth.errNoPasswordSet);
            return;
          }
          if (loginPassword !== remoteStudent.password) {
            setLoginError(t.auth.errWrongPass);
            return;
          }
        }
        platformDB.setCurrentUser(remoteStudent);
        onSuccess(remoteStudent);
        return;
      }

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
      const { profile: existingByPhone, error: phoneCheckErr } =
        await platformDB.findProfileRemoteWithStatus(regPhone.trim());
      if (phoneCheckErr) {
        setRegError(formatTemplate(t.auth.errSupabaseConnect, { err: phoneCheckErr }));
        return;
      }
      if (existingByPhone) {
        setRegError(t.auth.errPhoneExists);
        return;
      }

      if (regEmail.trim()) {
        const { profile: existingByEmail, error: emailCheckErr } =
          await platformDB.findProfileRemoteWithStatus(regEmail.trim());
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-dvh w-full bg-slate-100 text-slate-900 overflow-x-clip overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="min-h-dvh w-full flex flex-col md:grid md:grid-cols-12 md:gap-5 md:p-5 lg:p-6 max-w-[1440px] mx-auto">
        {/* Mobile Top Hero Brand Banner (< 768px) */}
        <div className="md:hidden relative w-full h-[32dvh] min-h-[215px] max-h-[290px] shrink-0 overflow-hidden bg-gradient-to-br from-[#0b1f3a] via-[#194d70] to-[#0B1120] flex items-center justify-center">
          <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-amber-500 via-blue-500 to-violet-500 shadow-2xl mb-10">
            <BrandLogo className="w-full h-full rounded-full" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1120] via-[#0B1120]/40 to-transparent pointer-events-none" />
          <div className="absolute bottom-9 start-5 end-5 text-start space-y-1">
            <h2 className="text-xl font-black text-white leading-tight drop-shadow">
              {getLocalizedPlatformName(settings.platformName, t)}
            </h2>
            <p className="text-xs font-medium text-slate-200">
              {t.auth.modalLoginSubtitle}
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <div className="relative z-10 -mt-6 md:mt-0 md:col-span-6 lg:col-span-5 flex flex-col justify-center">
          <div className="w-full flex-1 md:flex-none bg-white rounded-t-3xl md:rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-900/5 px-5 pt-6 pb-8 sm:p-8 lg:p-10 flex flex-col justify-between min-h-0">
            <div className="w-full max-w-md mx-auto space-y-6">
              {/* Top Back to Home Button */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onBackHome}
                  className="inline-flex items-center gap-2 min-h-[48px] px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold border border-slate-200 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-blue-600 shrink-0 rtl:rotate-180" />
                  <span>{t.app.backHome}</span>
                </button>

                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
                  {t.brand.badgeYearPrefix} {settings.academicYear}
                </span>
              </div>

              {/* Welcome Title & Subtitle */}
              <div className="space-y-1.5 text-start">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-snug">
                  {activeTab === 'login' ? t.auth.loginPageWelcome : t.auth.loginPageRegisterTitle}
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {activeTab === 'login' ? t.auth.loginPageWelcomeDesc : t.auth.loginPageRegisterDesc}
                </p>
              </div>

              {activeTab === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  {loginError && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-start gap-2.5 leading-relaxed"
                    >
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-identifier"
                      className="block text-sm font-bold text-slate-800"
                    >
                      {t.auth.identifierLabel}
                    </label>
                    <div className="relative">
                      <input
                        id="login-identifier"
                        type="text"
                        inputMode="text"
                        autoComplete="username"
                        required
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        placeholder={t.auth.identifierPlaceholder}
                        className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-2xl pe-4 ps-11 py-3 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
                      />
                      <Mail className="w-5 h-5 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-sm font-bold text-slate-800"
                    >
                      {t.auth.passwordLabel} {!isPasswordOptional && <span className="text-red-600">*</span>}
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="w-5 h-5 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-password"
                        type={showLoginPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required={!isPasswordOptional}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder={
                          isPasswordOptional
                            ? t.auth.passwordOptionalHint
                            : t.auth.passwordRequiredPlaceholder
                        }
                        className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-2xl ps-11 pe-14 py-3 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                        aria-label={showLoginPassword ? t.auth.hidePasswordAria : t.auth.showPasswordAria}
                        className="absolute end-0 top-1/2 -translate-y-1/2 min-w-[48px] min-h-[48px] flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        {showLoginPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full min-h-[48px] py-3.5 px-5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 disabled:opacity-60 text-white font-black text-base shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                    <span>{isSubmitting ? t.auth.signingInBtn : t.auth.signInBtn}</span>
                  </button>

                  <div className="pt-2 text-center border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginError('');
                        setActiveTab('register');
                      }}
                      className="min-h-[48px] inline-flex items-center justify-center px-3 text-sm font-bold text-blue-700 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      {t.auth.switchToRegister}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  {regError && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-start gap-2.5 leading-relaxed"
                    >
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <span>{regError}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label
                      htmlFor="reg-fullname"
                      className="block text-sm font-bold text-slate-800"
                    >
                      {t.auth.fullNameShortLabel} <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="reg-fullname"
                        type="text"
                        required
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        placeholder={t.auth.regFullNameExample}
                        className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-2xl pe-4 ps-11 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                      />
                      <User className="w-5 h-5 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="reg-phone" className="block text-sm font-bold text-slate-800">
                        {t.auth.studentPhoneLabel} <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="reg-phone"
                        type="tel"
                        dir="ltr"
                        inputMode="tel"
                        required
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="010XXXXXXXX"
                        className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-2xl px-3.5 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="reg-parent-phone"
                        className="block text-sm font-bold text-slate-800"
                      >
                        {t.auth.parentPhoneLabel} <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="reg-parent-phone"
                        type="tel"
                        dir="ltr"
                        inputMode="tel"
                        required
                        value={regParentPhone}
                        onChange={(e) => setRegParentPhone(e.target.value)}
                        placeholder="011XXXXXXXX"
                        className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-2xl px-3.5 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="reg-email" className="block text-sm font-bold text-slate-800">
                        {t.auth.emailOptionalLabel}
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        dir="ltr"
                        inputMode="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder={t.auth.emailPlaceholder}
                        className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-2xl px-3.5 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="reg-password"
                        className="block text-sm font-bold text-slate-800"
                      >
                        {t.auth.passwordLabel} <span className="text-red-600">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <input
                          id="reg-password"
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder={t.auth.strongPasswordPlaceholder}
                          className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-2xl ps-3.5 pe-12 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword((prev) => !prev)}
                          aria-label={showRegPassword ? t.auth.hidePasswordAria : t.auth.showPasswordAria}
                          className="absolute end-0 top-1/2 -translate-y-1/2 min-w-[48px] min-h-[48px] flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          {showRegPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="reg-gov" className="block text-sm font-bold text-slate-800">
                        {t.auth.governorateLabel} <span className="text-red-600">*</span>
                      </label>
                      <select
                        id="reg-gov"
                        value={regGovernorate}
                        onChange={(e) => setRegGovernorate(e.target.value)}
                        className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-2xl px-3.5 py-2.5 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                      >
                        {EGYPT_GOVERNORATES.map((gov) => (
                          <option key={gov} value={gov}>
                            {getGovernorateDisplayLabel(gov, lang)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="reg-grade" className="block text-sm font-bold text-slate-800">
                        {t.auth.gradeLabel} <span className="text-red-600">*</span>
                      </label>
                      <select
                        id="reg-grade"
                        value={regGrade}
                        onChange={(e) => setRegGrade(e.target.value)}
                        className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-2xl px-3.5 py-2.5 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
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
                    className="w-full min-h-[48px] py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-60 text-slate-950 font-black text-base shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 mt-1 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                    <span>
                      {isSubmitting ? t.auth.creatingAccountBtn : t.auth.createAccountSimpleBtn}
                    </span>
                  </button>

                  <div className="pt-2 text-center border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setRegError('');
                        setActiveTab('login');
                      }}
                      className="min-h-[48px] inline-flex items-center justify-center px-3 text-sm font-bold text-blue-700 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      {t.auth.switchToLogin}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Full-Height Brand Panel (>= 768px) */}
        <div className="hidden md:flex md:col-span-6 lg:col-span-7 relative h-full min-h-[540px] rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-[#0b1f3a] via-[#194d70] to-[#0B1120] items-center justify-center">
          <div className="absolute top-12 end-12 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-24 start-12 w-72 h-72 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 w-52 h-52 lg:w-64 lg:h-64 rounded-full p-2 bg-gradient-to-tr from-amber-500 via-blue-500 to-violet-500 shadow-2xl mb-16">
            <BrandLogo className="w-full h-full rounded-full" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1120] via-[#0B1120]/30 to-transparent pointer-events-none" />
          <div className="absolute bottom-8 start-8 end-8 text-start space-y-2 z-10">
            <h2 className="text-3xl lg:text-4xl font-black text-white leading-tight drop-shadow-md">
              {getLocalizedPlatformName(settings.platformName, t)}
            </h2>
            <p className="text-base lg:text-lg font-medium text-slate-200 max-w-xl">
              {t.auth.loginHeroSubtitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
