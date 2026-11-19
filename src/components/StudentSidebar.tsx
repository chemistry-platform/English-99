/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Home,
  BookOpen,
  BookmarkCheck,
  GraduationCap,
  CheckSquare,
  FileText,
  User,
  Wallet,
  Medal,
  Trophy,
  HelpCircle,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ClipboardCheck,
  Sparkles,
  Database,
  CreditCard,
} from 'lucide-react';
import { UserProfile } from '../types';
import { MyAccountTopTab } from './MyAccountSection';
import { useLanguage } from '../lib/translations';

interface StudentSidebarProps {
  currentUser: UserProfile;
  activeTab: string;
  myAccountSubTab?: MyAccountTopTab;
  coursesViewMode: 'all' | 'my-courses';
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileDrawerOpen: boolean;
  onOpenMobileDrawer: () => void;
  onCloseMobileDrawer: () => void;
  onSelectNav: (tab: string, coursesMode?: 'all' | 'my-courses') => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export const StudentSidebar: React.FC<StudentSidebarProps> = ({
  currentUser,
  activeTab,
  myAccountSubTab = 'results',
  coursesViewMode,
  isCollapsed,
  onToggleCollapse,
  isMobileDrawerOpen,
  onOpenMobileDrawer,
  onCloseMobileDrawer,
  onSelectNav,
  onLogout,
}) => {
  const { isRTL, t } = useLanguage();

  if (currentUser.role !== 'student') return null;

  const primaryItems: {
    id: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    isActive: boolean;
    onClick: () => void;
  }[] = [
    {
      id: 'home',
      label: t.nav.home,
      icon: Home,
      isActive: activeTab === 'home',
      onClick: () => {
        onSelectNav('home');
        onCloseMobileDrawer();
      },
    },
    {
      id: 'courses',
      label: t.nav.coursesShort,
      icon: BookOpen,
      isActive: activeTab === 'courses' && coursesViewMode === 'all',
      onClick: () => {
        onSelectNav('courses', 'all');
        onCloseMobileDrawer();
      },
    },
    {
      id: 'my-courses',
      label: t.nav.myCourses,
      icon: BookmarkCheck,
      isActive: activeTab === 'courses' && coursesViewMode === 'my-courses',
      onClick: () => {
        onSelectNav('courses', 'my-courses');
        onCloseMobileDrawer();
      },
    },
    {
      id: 'exams',
      label: t.nav.examsAndQuizzes,
      icon: GraduationCap,
      isActive: activeTab === 'exams',
      onClick: () => {
        onSelectNav('exams');
        onCloseMobileDrawer();
      },
    },
    {
      id: 'assignments',
      label: t.nav.assignments,
      icon: CheckSquare,
      isActive: activeTab === 'assignments',
      onClick: () => {
        onSelectNav('assignments');
        onCloseMobileDrawer();
      },
    },
    {
      id: 'documents',
      label: t.nav.documentsFull,
      icon: FileText,
      isActive: activeTab === 'documents',
      onClick: () => {
        onSelectNav('documents');
        onCloseMobileDrawer();
      },
    },
    {
      id: 'my-account',
      label: t.nav.myAccount,
      icon: User,
      isActive: activeTab === 'my-account',
      onClick: () => {
        onSelectNav('my-account');
        onCloseMobileDrawer();
      },
    },
    {
      id: 'wallet',
      label: t.nav.walletTopUp,
      icon: Wallet,
      isActive: activeTab === 'wallet',
      onClick: () => {
        onSelectNav('wallet');
        onCloseMobileDrawer();
      },
    },
  ];

  const myAccountItems: {
    id: string;
    subTab: MyAccountTopTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    navTarget: string;
  }[] = [
    {
      id: 'my-account-results',
      subTab: 'results',
      label: t.nav.myAccountResults,
      icon: ClipboardCheck,
      navTarget: 'my-account-results',
    },
    {
      id: 'my-account-custom-exam',
      subTab: 'custom-exam',
      label: t.nav.myAccountCustomExam,
      icon: Sparkles,
      navTarget: 'my-account-custom-exam',
    },
    {
      id: 'my-account-question-bank',
      subTab: 'question-bank',
      label: t.nav.myAccountQuestionBank,
      icon: Database,
      navTarget: 'my-account-question-bank',
    },
    {
      id: 'my-account-wallet',
      subTab: 'wallet-recharge',
      label: t.nav.myAccountWallet,
      icon: Wallet,
      navTarget: 'my-account-wallet',
    },
    {
      id: 'my-account-card',
      subTab: 'card-recharge',
      label: t.nav.myAccountCard,
      icon: CreditCard,
      navTarget: 'my-account-card',
    },
  ];

  const secondaryItems = [
    {
      id: 'rankings',
      label: t.nav.rankingsFull,
      icon: Medal,
      isActive: activeTab === 'rankings',
      onClick: () => {
        onSelectNav('rankings');
        onCloseMobileDrawer();
      },
    },
    {
      id: 'honor',
      label: t.nav.honor,
      icon: Trophy,
      isActive: activeTab === 'honor',
      onClick: () => {
        onSelectNav('honor');
        onCloseMobileDrawer();
      },
    },
    {
      id: 'support',
      label: t.nav.supportTech,
      icon: HelpCircle,
      isActive: activeTab === 'support',
      onClick: () => {
        onSelectNav('support');
        onCloseMobileDrawer();
      },
    },
  ];

  const renderLinksList = (collapsed: boolean) => (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <nav className="space-y-1.5">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isMyAccountParent = item.id === 'my-account';
          return (
            <React.Fragment key={item.id}>
              <button
                type="button"
                onClick={item.onClick}
                title={item.label}
                className={`w-full min-h-[44px] flex items-center ${
                  collapsed ? 'justify-center px-2' : 'justify-start px-3.5'
                } gap-3 py-2.5 rounded-xl text-[14px] md:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  item.isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>

              {isMyAccountParent && (
                <div
                  className={
                    collapsed
                      ? 'space-y-1 pt-1'
                      : 'ms-3 ps-2.5 border-s-2 border-amber-500/35 space-y-1 py-1'
                  }
                >
                  {myAccountItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive = activeTab === 'my-account' && myAccountSubTab === sub.subTab;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          onSelectNav(sub.navTarget);
                          onCloseMobileDrawer();
                        }}
                        title={sub.label}
                        className={`w-full min-h-[40px] flex items-center ${
                          collapsed ? 'justify-center px-2' : 'justify-start px-3'
                        } gap-2.5 py-2 rounded-xl text-[13px] md:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          isSubActive
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <SubIcon className="w-3.5 h-3.5 shrink-0" />
                        {!collapsed && <span className="truncate">{sub.label}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
        {secondaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              title={item.label}
              className={`w-full min-h-[44px] flex items-center ${
                collapsed ? 'justify-center px-2' : 'justify-start px-3.5'
              } gap-3 py-2 rounded-xl text-[14px] md:text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                item.isActive
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Desktop & Tablet Fixed Collapsible Sidebar (>= md) */}
      <aside
        aria-label={t.nav.studentSidebarAria}
        className={`hidden md:flex fixed top-0 start-0 bottom-0 h-dvh pt-[env(safe-area-inset-top)] bg-white dark:bg-[#0F172A] border-e border-slate-200 dark:border-slate-800 flex-col justify-between select-none transition-[width] duration-200 z-30 ${
          isCollapsed ? 'w-[76px]' : 'w-[260px]'
        }`}
      >
        <div className="p-3 border-b border-slate-200 dark:border-slate-800">
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} gap-2`}>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{currentUser.fullName}</p>
                <p className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400 truncate">
                  {currentUser.studentCode} · {currentUser.balance} {t.common.currency}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
              title={isCollapsed ? t.nav.expandMenuTitle : t.nav.collapseMenuTitle}
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-slate-700 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              ) : (
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
              )}
            </button>
          </div>
        </div>

        {renderLinksList(isCollapsed)}

        <div className="p-2.5 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onLogout}
            title={t.nav.signOut}
            className={`w-full min-h-[44px] flex items-center ${
              isCollapsed ? 'justify-center px-2' : 'justify-start px-3'
            } gap-3 py-2.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer whitespace-nowrap`}
          >
            <LogOut className="w-4 h-4 shrink-0 rtl:rotate-180" />
            {!isCollapsed && <span>{t.nav.signOut}</span>}
          </button>
        </div>
      </aside>

      {/* 2. Mobile Floating Toggle Square Button (< md) */}
      {!isMobileDrawerOpen && (
        <button
          type="button"
          onClick={onOpenMobileDrawer}
          aria-label={t.nav.openSidebarAria}
          className="md:hidden fixed top-[calc(74px+env(safe-area-inset-top))] start-4 z-40 w-11 h-11 rounded-xl bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md border border-slate-300 dark:border-slate-700 shadow-lg flex items-center justify-center text-amber-600 dark:text-amber-400 hover:border-amber-500 transition-colors cursor-pointer"
        >
          <ChevronRight className="w-5 h-5 rtl:rotate-180" />
        </button>
      )}

      {/* 3. Mobile Slide-over Drawer + Click-Outside Backdrop (< md) */}
      {isMobileDrawerOpen && (
        <div
          onClick={onCloseMobileDrawer}
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex justify-start animate-in fade-in duration-150"
        >
          <aside
            aria-label={t.nav.mobileDrawerAria}
            onClick={(e) => e.stopPropagation()}
            className={`w-[290px] max-w-[85vw] h-dvh max-h-dvh bg-white dark:bg-[#0F172A] border-e border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between overflow-hidden animate-in ${
              isRTL ? 'slide-in-from-right' : 'slide-in-from-left'
            } duration-200`}
          >
            {/* Drawer Header with Minimize / Close Button */}
            <div className="sticky top-0 z-20 shrink-0 p-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/70">
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-slate-900 dark:text-white truncate">
                  {currentUser.fullName}
                </p>
                <p className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                  {currentUser.studentCode} · {currentUser.balance} {t.common.currency}
                </p>
              </div>

              <button
                type="button"
                onClick={onCloseMobileDrawer}
                aria-label={t.nav.closeDrawerAria}
                className="min-h-[44px] px-3 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-amber-500/20 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                <span>{t.common.close}</span>
              </button>
            </div>

            {renderLinksList(false)}

            <div className="p-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onCloseMobileDrawer();
                  onLogout();
                }}
                className="w-full min-h-[44px] flex items-center justify-start px-3.5 gap-3 py-2.5 rounded-xl text-[14px] font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0 rtl:rotate-180" />
                <span>{t.nav.signOut}</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
