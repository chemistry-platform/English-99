/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Bell,
  Moon,
  Sun,
  Monitor,
  ShieldCheck,
  User,
  LogOut,
  Sliders,
  ChevronDown,
  GraduationCap,
  Sparkles,
  BookOpen,
  FileText,
  CheckSquare,
  HelpCircle,
  Trophy,
  Medal,
  Users,
  Wallet,
  Home,
  X,
  CheckCheck,
  Languages,
} from 'lucide-react';
import { UserProfile, PlatformNotification, PlatformSettings } from '../types';
import { platformDB } from '../lib/storage';
import { normalizeGrade } from '../lib/courseHelpers';
import { PWAInstallNavButton } from './PWAInstallBanner';
import { BrandLogo } from './BrandLogo';
import {
  getGradeDisplayLabel,
  getLocalizedPlatformName,
  useLanguage,
} from '../lib/translations';

interface NavbarProps {
  currentUser: UserProfile | null;
  settings: PlatformSettings;
  selectedGrade: string;
  onSelectGrade: (grade: string) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  notifications: PlatformNotification[];
  theme: 'dark' | 'light' | 'system';
  onToggleTheme: (t: 'dark' | 'light' | 'system') => void;
  onOpenAuth: () => void;
  onOpenAdmin: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
  onMarkAllNotificationsRead?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  settings,
  selectedGrade,
  onSelectGrade,
  activeTab,
  onSelectTab,
  notifications,
  theme,
  onToggleTheme,
  onOpenAuth,
  onOpenAdmin,
  onOpenProfile,
  onLogout,
  onMarkAllNotificationsRead,
}) => {
  const { lang, t, toggleLang } = useLanguage();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const isAdminOrSecretary = currentUser?.role === 'admin' || currentUser?.role === 'secretary';
  const displayPlatformName = getLocalizedPlatformName(settings.platformName, t);

  const visibleNotifications = isAdminOrSecretary
    ? notifications
    : notifications.filter(
        (n) =>
          !n.targetGrade ||
          n.targetGrade === 'All' ||
          n.targetGrade === 'الكل' ||
          normalizeGrade(n.targetGrade) === 'All' ||
          (currentUser?.grade && normalizeGrade(n.targetGrade) === normalizeGrade(currentUser.grade))
      );

  const unreadCount = visibleNotifications.filter((n) => !n.isRead).length;

  const navTabs = [
    { id: 'home', label: t.nav.home, icon: Home },
    { id: 'courses', label: t.nav.courses, icon: BookOpen },
    { id: 'documents', label: t.nav.documents, icon: FileText },
    { id: 'exams', label: t.nav.exams, icon: GraduationCap },
    { id: 'assignments', label: t.nav.assignments, icon: CheckSquare },
    { id: 'rankings', label: t.nav.rankings, icon: Medal },
    { id: 'students-data', label: t.nav.studentsData, icon: Users },
    { id: 'wallet', label: t.nav.wallet, icon: Wallet },
    { id: 'honor', label: t.nav.honor, icon: Trophy },
    { id: 'support', label: t.nav.support, icon: HelpCircle },
  ];

  // Dynamically collect all registered grades alongside standard secondary grades (visible only to admin/secretary)
  const baseGradeOptions = [
    { value: 'All', label: t.common.allGrades },
    { value: '3rd Secondary', label: getGradeDisplayLabel('3rd Secondary', t, settings.academicYear) },
    { value: '2nd Secondary', label: getGradeDisplayLabel('2nd Secondary', t) },
    { value: '1st Secondary', label: getGradeDisplayLabel('1st Secondary', t) },
  ];
  const extraGrades = Array.from(
    new Set(
      [
        ...platformDB.getStudents().map((s) => normalizeGrade(s.grade)),
        ...platformDB.getCourses().map((c) => normalizeGrade(c.grade)),
      ].filter(
        (g): g is string =>
          Boolean(g) &&
          g !== 'All' &&
          g !== 'All Grades' &&
          !baseGradeOptions.some((b) => b.value === g)
      )
    )
  ).map((g) => ({ value: g, label: getGradeDisplayLabel(g, t, settings.academicYear) }));
  const gradeOptions = [...baseGradeOptions, ...extraGrades];

  const normalizedUserGrade = normalizeGrade(currentUser?.grade);
  const staticDisplayGrade =
    currentUser?.role === 'student'
      ? normalizedUserGrade
        ? getGradeDisplayLabel(normalizedUserGrade, t, settings.academicYear)
        : t.common.gradeLevel
      : t.common.allGrades;

  const isLightActive =
    theme === 'light' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);

  const renderNotificationsDropdown = () =>
    showNotifications && (
      <div className="fixed sm:absolute start-4 end-4 sm:end-0 sm:start-auto top-[68px] sm:top-auto sm:mt-2 sm:w-96 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">{t.nav.notificationsTitle}</h4>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  platformDB.markNotificationsAsRead();
                  onMarkAllNotificationsRead?.();
                }}
                className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 px-2 py-1 rounded-lg font-semibold transition-colors cursor-pointer"
                title={t.nav.markAllReadTitle}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{t.nav.markAllRead}</span>
              </button>
            )}
            <button
              onClick={() => setShowNotifications(false)}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 cursor-pointer"
              aria-label={t.common.close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80 my-2">
          {visibleNotifications.length === 0 ? (
            <p className="text-center text-xs text-slate-500 dark:text-slate-400 py-6">{t.nav.noNotifications}</p>
          ) : (
            visibleNotifications.map((n) => (
              <div
                key={n.id}
                className={`p-2.5 rounded-lg my-1 transition-colors text-start ${
                  n.isUrgent
                    ? 'bg-red-50 dark:bg-red-500/10 border-s-4 border-red-500 text-slate-800 dark:text-slate-200'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-semibold text-xs text-amber-600 dark:text-amber-400">{n.title}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {n.audioUrl && (
                      <span className="text-[10px] bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">
                        {t.nav.voiceNote}
                      </span>
                    )}
                    {n.isUrgent && (
                      <span className="text-[10px] bg-red-500/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-bold">
                        {t.common.urgent}
                      </span>
                    )}
                  </div>
                </div>
                {n.content && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{n.content}</p>
                )}
                {n.audioUrl && (
                  <audio
                    controls
                    preload="metadata"
                    src={n.audioUrl}
                    className="w-full h-9 mt-2 rounded-lg"
                  />
                )}
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1.5">
                  {t.nav.targetLabel} {getGradeDisplayLabel(normalizeGrade(n.targetGrade), t)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );

  return (
    <header className="relative z-40 pt-[env(safe-area-inset-top)] bg-transparent">
      {/* Compact Header on Mobile (< md) without full-width box */}
      <div className="md:hidden px-3 py-3 flex flex-wrap items-center justify-between gap-2">
        {/* Start side: Compact Brand Logo + Name */}
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-2 min-w-0 cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 via-blue-500 to-amber-300 shadow-sm shrink-0">
            <BrandLogo className="w-full h-full rounded-full" />
          </div>
          <div className="text-start min-w-0">
            <span className="text-xs font-extrabold text-slate-900 dark:text-white block truncate">
              {displayPlatformName}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
              {currentUser?.role === 'student' ? staticDisplayGrade : t.common.azharAndGeneral}
            </span>
          </div>
        </button>

        {/* End side: Separated standalone icons & controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <PWAInstallNavButton />
          {currentUser ? (
            <button
              type="button"
              onClick={() => onSelectTab(currentUser.role === 'student' ? 'my-account-wallet' : 'wallet')}
              className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-400 text-[11px] font-extrabold whitespace-nowrap tabular-nums cursor-pointer"
              title={t.nav.walletBalanceTitle}
            >
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              <span>{currentUser.balance || 0} {t.common.currency}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold whitespace-nowrap shadow-sm cursor-pointer"
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>{t.nav.signIn}</span>
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative min-w-[40px] h-9 px-2.5 rounded-lg bg-white/95 dark:bg-[#111827] text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 flex items-center justify-center shadow-sm cursor-pointer"
              aria-label={t.nav.notifications}
            >
              <Bell className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -end-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>
            {renderNotificationsDropdown()}
          </div>

          <button
            type="button"
            onClick={toggleLang}
            className="min-w-[40px] h-9 px-2 rounded-lg bg-white/95 dark:bg-[#111827] text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-amber-500/60 flex items-center justify-center gap-1 text-[11px] font-extrabold shadow-sm cursor-pointer"
            aria-label={t.nav.switchLangAria}
            title={t.nav.switchLangTitle}
          >
            <Languages className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
            <span>{lang === 'ar' ? 'EN' : 'AR'}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleTheme(isLightActive ? 'dark' : 'light')}
            className="min-w-[40px] h-9 px-2.5 rounded-lg bg-white/95 dark:bg-[#111827] text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 flex items-center justify-center shadow-sm cursor-pointer"
            aria-label={t.nav.toggleThemeAria}
          >
            {isLightActive ? (
              <Moon className="w-4 h-4 text-blue-600" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
          </button>

          {currentUser && (
            <button
              type="button"
              onClick={onLogout}
              className="w-9 h-9 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-500 flex items-center justify-center shadow-md shadow-red-600/25 transition-colors cursor-pointer shrink-0"
              title={t.nav.signOut}
              aria-label={t.nav.signOut}
            >
              <LogOut className="w-4 h-4 rtl:rotate-180" />
            </button>
          )}
        </div>
      </div>

      {/* Desktop & Tablet Header (>= md): compact brand corner + cleanly separated standalone icons without outer box */}
      <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-1">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Compact Logo & Brand Avatar & Title (no wide box) */}
          <div
            onClick={() => onSelectTab('home')}
            className="flex items-center gap-2.5 cursor-pointer group select-none max-w-sm"
          >
            <div className="relative shrink-0">
              <div className="w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 via-blue-500 to-amber-300 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform duration-300">
                <BrandLogo className="w-full h-full rounded-full" />
              </div>
              <span className="absolute -bottom-0.5 -end-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-[#0B1120] rounded-full" />
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors whitespace-nowrap">
                  {displayPlatformName}
                </h1>
                <span className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
                  <Sparkles className="w-2.5 h-2.5 me-1" />
                  {t.common.azharAndGeneral}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                {t.brand.tagline}
              </p>
            </div>
          </div>

          {/* Controls: Each icon/item separated individually */}
          <div className="flex flex-wrap items-center gap-2.5">
            <PWAInstallNavButton />
            {/* Grade Display: Interactive Dropdown strictly for Admin/Secretary; Static non-responsive badge for Students */}
            {isAdminOrSecretary ? (
              <div className="relative">
                <select
                  value={normalizeGrade(selectedGrade)}
                  onChange={(e) => onSelectGrade(e.target.value)}
                  className="appearance-none bg-slate-100 dark:bg-[#111827] text-xs sm:text-sm text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 ps-3 pe-8 hover:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30 cursor-pointer shadow-inner"
                >
                  {gradeOptions.map((g) => (
                    <option key={g.value} value={g.value} className="bg-white dark:bg-[#111827] text-slate-900 dark:text-white">
                      {g.label}
                    </option>
                  ))}
                </select>
                <GraduationCap className="w-4 h-4 text-amber-500 dark:text-amber-400 absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            ) : (
              <div
                aria-label={t.nav.registeredGradeAria}
                className="inline-flex items-center gap-2 bg-slate-100 dark:bg-[#111827] text-xs sm:text-sm text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 shadow-inner select-none pointer-events-none"
              >
                <GraduationCap className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                <span className="font-semibold">{staticDisplayGrade}</span>
              </div>
            )}

            {/* Student Wallet Balance Capsule beside Notifications */}
            {currentUser && currentUser.role === 'student' && (
              <button
                type="button"
                onClick={() => onSelectTab('my-account-wallet')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-700 dark:text-amber-400 text-xs font-extrabold whitespace-nowrap font-mono tabular-nums transition-colors cursor-pointer"
                title={t.nav.walletBalanceClickTitle}
              >
                <Wallet className="w-4 h-4 shrink-0" />
                <span>{currentUser.balance || 0} {t.common.currency}</span>
              </button>
            )}

            {/* Notification Bell in a compact small rectangle */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative min-w-[48px] h-9 px-3.5 rounded-lg bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 hover:border-amber-500/60 shadow-sm transition-all flex items-center justify-center focus:outline-none cursor-pointer"
                title={t.nav.notificationsTitle}
              >
                <Bell className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#0B1120]">
                    {unreadCount}
                  </span>
                )}
              </button>

              {renderNotificationsDropdown()}
            </div>

            {/* Language Switcher (AR / EN) next to Theme Switcher */}
            <button
              type="button"
              onClick={toggleLang}
              className="h-9 px-3 rounded-lg bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 hover:border-amber-500/60 shadow-sm transition-all focus:outline-none flex items-center justify-center gap-1.5 text-xs font-extrabold cursor-pointer"
              aria-label={t.nav.switchLangAria}
              title={t.nav.switchLangTitle}
            >
              <Languages className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span className={lang === 'ar' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}>AR</span>
              <span className="text-slate-400">/</span>
              <span className={lang === 'en' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}>EN</span>
            </button>

            {/* Theme Switcher (dark / light / system) in a compact small rectangle */}
            <div className="relative">
              <button
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="min-w-[54px] h-9 px-3.5 rounded-lg bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 hover:border-blue-500/60 shadow-sm transition-all focus:outline-none flex items-center justify-center gap-1.5 cursor-pointer"
                title={t.nav.switchThemeTitle}
              >
                {theme === 'dark' && <Moon className="w-4 h-4 text-blue-500 dark:text-blue-400" />}
                {theme === 'light' && <Sun className="w-4 h-4 text-amber-500 dark:text-amber-400" />}
                {theme === 'system' && <Monitor className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />}
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              </button>

              {showThemeMenu && (
                <div className="absolute end-0 mt-2 w-36 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 shadow-2xl py-1 z-50 text-xs">
                  <button
                    onClick={() => {
                      onToggleTheme('dark');
                      setShowThemeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                      theme === 'dark' ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-500/10' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                    <span>{t.nav.themeDark}</span>
                  </button>
                  <button
                    onClick={() => {
                      onToggleTheme('light');
                      setShowThemeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                      theme === 'light' ? 'text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                    <span>{t.nav.themeLight}</span>
                  </button>
                  <button
                    onClick={() => {
                      onToggleTheme('system');
                      setShowThemeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                      theme === 'system' ? 'text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    <span>{t.nav.themeAuto}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Admin Badge & Dashboard Button (Strict RBAC: Only for Admin / Secretary) */}
            {isAdminOrSecretary && (
              <button
                onClick={onOpenAdmin}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all transform hover:scale-[1.02] whitespace-nowrap cursor-pointer"
              >
                <Sliders className="w-4 h-4" />
                <span>{t.nav.adminDashboard}</span>
              </button>
            )}

            {/* User Account / Auth Button (Profile in Blue, Logout in Red) */}
            {currentUser ? (
              <>
                <button
                  onClick={isAdminOrSecretary ? onOpenAdmin : onOpenProfile}
                  className="flex items-center gap-2 h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 border border-blue-500 text-xs font-bold text-white transition-colors whitespace-nowrap shadow-md shadow-blue-600/25 cursor-pointer"
                  title={isAdminOrSecretary ? t.nav.openAdminTitle : t.nav.studentProfileTitle}
                >
                  {currentUser.role === 'admin' ? (
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-white" />
                      <span>{t.nav.superAdmin}</span>
                    </span>
                  ) : currentUser.role === 'secretary' ? (
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-white" />
                      <span>{t.nav.secretaryRole}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-white" />
                      <span className="max-w-[120px] truncate">{currentUser.fullName}</span>
                    </span>
                  )}
                </button>

                <button
                  onClick={onLogout}
                  className="h-9 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-500 transition-colors shadow-md shadow-red-600/25 flex items-center justify-center cursor-pointer"
                  title={t.nav.signOut}
                  aria-label={t.nav.signOut}
                >
                  <LogOut className="w-4 h-4 rtl:rotate-180" />
                </button>
              </>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold text-xs shadow-lg shadow-blue-600/25 transition-all whitespace-nowrap cursor-pointer"
              >
                <User className="w-4 h-4" />
                <span>{t.nav.signIn}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Tab Navigation Bar (shown for guests and admin/secretary without full-width box background) */}
      {currentUser?.role !== 'student' && (
        <div className="bg-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex gap-1 sm:gap-2 overflow-x-auto py-2 no-scrollbar">
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onSelectTab(tab.id)}
                    className={`flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl text-[14px] sm:text-sm font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-amber-500/20 to-blue-600/20 text-amber-700 dark:text-amber-400 border border-amber-500/40 shadow-sm font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}

              {/* Mobile Admin button if admin */}
              {isAdminOrSecretary && (
                <button
                  onClick={onOpenAdmin}
                  className="md:hidden flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-[14px] font-bold bg-amber-500 text-slate-950 whitespace-nowrap cursor-pointer"
                >
                  <Sliders className="w-4 h-4" />
                  <span>{t.nav.adminPanel}</span>
                </button>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
};
