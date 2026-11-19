/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle,
  LogOut,
  Lock,
  LogIn,
  Home,
  Wallet,
  CreditCard,
  Zap,
  Sparkles,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomeSection } from './components/HomeSection';
import { CoursesSection } from './components/CoursesSection';
import { DocumentsSection } from './components/DocumentsSection';
import { ExamsSection } from './components/ExamsSection';
import { AssignmentsSection } from './components/AssignmentsSection';
import { WalletSection } from './components/WalletSection';
import { SupportSection } from './components/SupportSection';
import { HonorBoardSection } from './components/HonorBoardSection';
import { TopRankingsSection } from './components/TopRankingsSection';
import { StudentsDataSection } from './components/StudentsDataSection';
import { MyAccountSection, MyAccountTopTab } from './components/MyAccountSection';
import { StudentSidebar } from './components/StudentSidebar';
import { CourseDetailView, CourseActiveSelection } from './components/CourseDetailView';
import { LoginPage } from './components/LoginPage';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { DocumentViewerModal } from './components/DocumentViewerModal';
import { InBrowserPdfViewer } from './components/InBrowserPdfViewer';
import { ExamTakerModal } from './components/ExamTakerModal';
import { AdminDashboardModal, AdminTabId } from './components/AdminDashboardModal';
import { ProfileModal } from './components/ProfileModal';
import { Modal } from './components/Modal';
import { SplashScreen, hasSplashShownThisSession } from './components/SplashScreen';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import {
  UserProfile,
  CourseLecture,
  ChemistryDocument,
  ExamOrAssignment,
  ExamSubmission,
  PlatformNotification,
  PlatformSettings,
  SupportThread,
} from './types';
import { platformDB } from './lib/storage';
import { normalizeGrade } from './lib/courseHelpers';
import { subscribeToSupabaseRealtime } from './lib/supabase';
import { getLocalizedPlatformName, useLanguage } from './lib/translations';

const EDUCATIONAL_TABS = new Set([
  'documents',
  'exams',
  'assignments',
  'rankings',
  'students-data',
  'wallet',
  'my-account',
]);

const VALID_TABS = new Set([
  'home',
  'courses',
  'documents',
  'exams',
  'assignments',
  'wallet',
  'my-account',
  'rankings',
  'students-data',
  'honor',
  'support',
]);

const VALID_MY_ACCOUNT_SUBS = new Set<MyAccountTopTab>([
  'results',
  'custom-exam',
  'question-bank',
  'wallet-recharge',
  'card-recharge',
]);

const VALID_ADMIN_TABS = new Set<AdminTabId>([
  'courses',
  'documents',
  'exams',
  'assignments',
  'gemini',
  'students',
  'students-data',
  'payments',
  'notifications',
  'support',
  'honor',
  'secretaries',
  'codes',
  'settings',
]);

interface ParsedUrlState {
  pathname: string;
  tab: string;
  sub: MyAccountTopTab;
  mode: 'all' | 'my-courses';
  courseId: string | null;
  lessonId: string | null;
  sectionId: string | null;
  itemId: string | null;
  examId: string | null;
  adminOpen: boolean;
  adminTab: AdminTabId;
  adminCourseId: string | null;
  grade: string | null;
}

function parseRouteFromLocation(): ParsedUrlState {
  if (typeof window === 'undefined') {
    return {
      pathname: '/',
      tab: 'home',
      sub: 'results',
      mode: 'all',
      courseId: null,
      lessonId: null,
      sectionId: null,
      itemId: null,
      examId: null,
      adminOpen: false,
      adminTab: 'courses',
      adminCourseId: null,
      grade: null,
    };
  }
  const pathname = window.location.pathname || '/';
  const sp = new URLSearchParams(window.location.search);
  const rawTab = sp.get('tab') || (sp.get('course') ? 'courses' : 'home');
  const tab = VALID_TABS.has(rawTab) ? rawTab : 'home';
  const rawSub = sp.get('sub') as MyAccountTopTab | null;
  const sub: MyAccountTopTab = rawSub && VALID_MY_ACCOUNT_SUBS.has(rawSub) ? rawSub : 'results';
  const mode: 'all' | 'my-courses' = sp.get('mode') === 'my-courses' ? 'my-courses' : 'all';
  const adminParam = sp.get('admin') as AdminTabId | null;
  const adminOpen = pathname === '/admin' || Boolean(adminParam);
  const adminTab: AdminTabId = adminParam && VALID_ADMIN_TABS.has(adminParam) ? adminParam : 'courses';

  return {
    pathname,
    tab,
    sub,
    mode,
    courseId: sp.get('course'),
    lessonId: sp.get('lesson'),
    sectionId: sp.get('section'),
    itemId: sp.get('item'),
    examId: sp.get('exam'),
    adminOpen,
    adminTab,
    adminCourseId: sp.get('adminCourse'),
    grade: sp.get('grade'),
  };
}

export default function App() {
  const { lang, t } = useLanguage();
  const initialRouteRef = useRef<ParsedUrlState>(parseRouteFromLocation());
  const hasHydratedRouteRef = useRef<boolean>(false);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => platformDB.getCurrentUser());
  const [settings, setSettings] = useState<PlatformSettings>(() => platformDB.getSettings());
  const [selectedGrade, setSelectedGrade] = useState<string>(() => {
    if (initialRouteRef.current.grade) return normalizeGrade(initialRouteRef.current.grade);
    const u = platformDB.getCurrentUser();
    return u?.role === 'student' && u.grade ? normalizeGrade(u.grade) : 'All';
  });
  const [activeTab, setActiveTab] = useState<string>(() => initialRouteRef.current.tab);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    return (localStorage.getItem('platform_theme') as any) || 'dark';
  });

  // Data lists
  const [courses, setCourses] = useState<CourseLecture[]>(() => platformDB.getCourses());
  const [documents, setDocuments] = useState<ChemistryDocument[]>(() => platformDB.getDocuments());
  const [exams, setExams] = useState<ExamOrAssignment[]>(() => platformDB.getExams());
  const [submissions, setSubmissions] = useState<ExamSubmission[]>(() => platformDB.getSubmissions());
  const [notifications, setNotifications] = useState<PlatformNotification[]>(() =>
    platformDB.getNotifications()
  );
  const [honorStudents, setHonorStudents] = useState(() => platformDB.getHonorStudents());
  const [students, setStudents] = useState<UserProfile[]>(() => platformDB.getStudents());
  const [supportThreads, setSupportThreads] = useState<SupportThread[]>(() => platformDB.getSupportThreads());

  // Route & Modals state
  const [currentPath, setCurrentPath] = useState<string>(() => initialRouteRef.current.pathname);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(() => {
    const u = platformDB.getCurrentUser();
    const isStaff = u?.role === 'admin' || u?.role === 'secretary';
    return Boolean(initialRouteRef.current.adminOpen && isStaff);
  });
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTabId>(() => initialRouteRef.current.adminTab);
  const [adminEditCourseId, setAdminEditCourseId] = useState<string | null>(
    () => initialRouteRef.current.adminCourseId
  );
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileToast, setProfileToast] = useState<string | null>(null);
  const [coursesViewMode, setCoursesViewMode] = useState<'all' | 'my-courses'>(
    () => initialRouteRef.current.mode
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [myAccountInitialTab, setMyAccountInitialTab] = useState<MyAccountTopTab>(
    () => initialRouteRef.current.sub
  );
  const [activeCourseDetail, setActiveCourseDetail] = useState<CourseLecture | null>(() => {
    if (!initialRouteRef.current.courseId) return null;
    return platformDB.getCourses().find((c) => c.id === initialRouteRef.current.courseId) || null;
  });
  const [courseSelection, setCourseSelection] = useState<CourseActiveSelection | null>(() => {
    if (initialRouteRef.current.lessonId && initialRouteRef.current.sectionId) {
      return {
        lessonId: initialRouteRef.current.lessonId,
        sectionId: initialRouteRef.current.sectionId,
        itemId: initialRouteRef.current.itemId || undefined,
      };
    }
    return null;
  });
  const [activeLecture, setActiveLecture] = useState<CourseLecture | null>(null);
  const [activeDocument, setActiveDocument] = useState<ChemistryDocument | null>(null);
  const [activeInBrowserDoc, setActiveInBrowserDoc] = useState<ChemistryDocument | null>(null);
  const [activeExam, setActiveExam] = useState<ExamOrAssignment | null>(() => {
    const u = platformDB.getCurrentUser();
    if (!u || !initialRouteRef.current.examId) return null;
    return platformDB.getExams().find((ex) => ex.id === initialRouteRef.current.examId) || null;
  });
  const [splashDone, setSplashDone] = useState<boolean>(() => hasSplashShownThisSession());

  // Auth & Subscription Enforcement State
  const [pendingCourseAfterAuth, setPendingCourseAfterAuth] = useState<CourseLecture | null>(null);
  const [subscribeModalCourse, setSubscribeModalCourse] = useState<CourseLecture | null>(null);
  const [subscribePinInput, setSubscribePinInput] = useState('');
  const [subscribeMessage, setSubscribeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubscribingCourse, setIsSubscribingCourse] = useState(false);

  const navigateToLogin = () => {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.history.pushState({}, '', '/login');
    }
    setCurrentPath('/login');
  };

  const navigateToRootRoute = () => {
    if (typeof window !== 'undefined' && window.location.pathname === '/login') {
      window.history.pushState({}, '', '/');
    }
    setCurrentPath('/');
  };

  // Apply parsed URL on browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      if (window.history.state?.modal === 'amr-admin-fullscreen') return;
      const parsed = parseRouteFromLocation();
      setCurrentPath(parsed.pathname);
      setActiveTab(parsed.tab);
      setMyAccountInitialTab(parsed.sub);
      setCoursesViewMode(parsed.mode);
      if (parsed.grade) setSelectedGrade(normalizeGrade(parsed.grade));

      const currentCourses = platformDB.getCourses();
      const matchedCourse = parsed.courseId
        ? currentCourses.find((c) => c.id === parsed.courseId) || null
        : null;
      setActiveCourseDetail(matchedCourse);
      setCourseSelection(
        parsed.lessonId && parsed.sectionId
          ? {
              lessonId: parsed.lessonId,
              sectionId: parsed.sectionId,
              itemId: parsed.itemId || undefined,
            }
          : null
      );

      const u = platformDB.getCurrentUser();
      const matchedExam =
        u && parsed.examId ? platformDB.getExams().find((ex) => ex.id === parsed.examId) || null : null;
      setActiveExam(matchedExam);

      const isStaff = u?.role === 'admin' || u?.role === 'secretary';
      if (parsed.adminOpen && isStaff) {
        setAdminInitialTab(parsed.adminTab);
        setAdminEditCourseId(parsed.adminCourseId);
        setIsAdminOpen(true);
      } else {
        setIsAdminOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Serialize live UI navigation state cleanly into the browser URL after initial hydration completes
  useEffect(() => {
    if (!hasHydratedRouteRef.current || typeof window === 'undefined') return;
    if (currentPath === '/login') return;

    const sp = new URLSearchParams();
    if (activeTab && activeTab !== 'home') sp.set('tab', activeTab);
    if (activeTab === 'courses' && coursesViewMode === 'my-courses') sp.set('mode', 'my-courses');
    if (activeTab === 'my-account' && myAccountInitialTab !== 'results') {
      sp.set('sub', myAccountInitialTab);
    }
    if (activeCourseDetail) {
      sp.set('tab', 'courses');
      sp.set('course', activeCourseDetail.id);
      if (courseSelection?.lessonId && courseSelection?.sectionId) {
        sp.set('lesson', courseSelection.lessonId);
        sp.set('section', courseSelection.sectionId);
        if (courseSelection.itemId) sp.set('item', courseSelection.itemId);
      }
    }
    if (activeExam) {
      sp.set('exam', activeExam.id);
    }
    const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'secretary';
    if (isAdminOpen && isStaff) {
      sp.set('admin', adminInitialTab || 'courses');
      if (adminEditCourseId) sp.set('adminCourse', adminEditCourseId);
    }

    const qs = sp.toString();
    const nextUrl = `/${qs ? `?${qs}` : ''}`;
    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== nextUrl) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [
    isBootstrapping,
    currentPath,
    activeTab,
    coursesViewMode,
    myAccountInitialTab,
    activeCourseDetail,
    courseSelection,
    activeExam,
    isAdminOpen,
    adminInitialTab,
    adminEditCourseId,
    currentUser,
  ]);

  // Automatically redirect logged-in users away from /login
  useEffect(() => {
    if (currentPath === '/login' && currentUser) {
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/');
      }
      setCurrentPath('/');
      if (currentUser.role === 'admin' || currentUser.role === 'secretary') {
        setIsAdminOpen(true);
      }
    }
  }, [currentPath, currentUser]);

  const navigateToTab = (tab: string, mode?: 'all' | 'my-courses') => {
    setActiveCourseDetail(null);
    setCourseSelection(null);
    if (currentPath === '/login') {
      navigateToRootRoute();
    }
    if (!currentUser && (EDUCATIONAL_TABS.has(tab) || tab.startsWith('my-account'))) {
      navigateToLogin();
      return;
    }
    if (tab === 'my-account-results' || tab === 'my-account') {
      setMyAccountInitialTab('results');
      setActiveTab('my-account');
    } else if (tab === 'my-account-custom-exam') {
      setMyAccountInitialTab('custom-exam');
      setActiveTab('my-account');
    } else if (tab === 'my-account-question-bank') {
      setMyAccountInitialTab('question-bank');
      setActiveTab('my-account');
    } else if (tab === 'my-account-wallet') {
      setMyAccountInitialTab('wallet-recharge');
      setActiveTab('my-account');
    } else if (tab === 'my-account-card') {
      setMyAccountInitialTab('card-recharge');
      setActiveTab('my-account');
    } else {
      setActiveTab(tab);
    }
    if (mode) setCoursesViewMode(mode);
  };

  const [isDarkResolved, setIsDarkResolved] = useState<boolean>(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Sync theme with document classes and local storage
  useEffect(() => {
    localStorage.setItem('platform_theme', theme);
    const root = document.documentElement;

    const applyTheme = (isDark: boolean) => {
      setIsDarkResolved(isDark);
      if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
      }
    };

    if (theme === 'dark') {
      applyTheme(true);
    } else if (theme === 'light') {
      applyTheme(false);
    } else {
      // system
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(media.matches);
      const listener = (e: MediaQueryListEvent) => applyTheme(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  const refreshData = useCallback(() => {
    const freshCourses = platformDB.getCourses();
    setCourses(freshCourses);
    setActiveCourseDetail((prev) => (prev ? freshCourses.find((c) => c.id === prev.id) || prev : null));
    setDocuments(platformDB.getDocuments());
    const freshExams = platformDB.getExams();
    setExams(freshExams);
    setActiveExam((prev) => (prev ? freshExams.find((ex) => ex.id === prev.id) || prev : null));
    setSubmissions(platformDB.getSubmissions());
    setNotifications(platformDB.getNotifications());
    setHonorStudents(platformDB.getHonorStudents());
    setStudents(platformDB.getStudents());
    setSupportThreads(platformDB.getSupportThreads());
    setSettings(platformDB.getSettings());
    const user = platformDB.getCurrentUser();
    setCurrentUser(user ? { ...user } : null);
  }, []);

  const handleMarkLectureCompleted = (lectureId: string) => {
    if (!currentUser) {
      navigateToLogin();
      return;
    }
    const currentCompleted = currentUser.completedLectures || [];
    if (!currentCompleted.includes(lectureId)) {
      const updatedUser: UserProfile = {
        ...currentUser,
        completedLectures: [...currentCompleted, lectureId],
      };
      platformDB.setCurrentUser(updatedUser);
      platformDB.saveStudent(updatedUser);
      setCurrentUser(updatedUser);
    }
  };

  const handleExamSubmitted = (newSub: ExamSubmission) => {
    setSubmissions((prev) => [newSub, ...prev]);
  };

  const handleRequestLogout = () => {
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    platformDB.setCurrentUser(null);
    setCurrentUser(null);
    setSelectedGrade('All');
    setActiveCourseDetail(null);
    setCourseSelection(null);
    setActiveLecture(null);
    setActiveDocument(null);
    setActiveInBrowserDoc(null);
    setActiveExam(null);
    setSubscribeModalCourse(null);
    setPendingCourseAfterAuth(null);
    setActiveTab('home');
    setIsProfileOpen(false);
    setIsAdminOpen(false);
  };

  const isUserEnrolledInCourse = (course: CourseLecture | null) => {
    if (!course || !currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'secretary') return true;
    return (currentUser.enrolledCourses || []).includes(course.id);
  };

  const handleSubscribeCourseWithBalance = async () => {
    if (!currentUser) {
      setSubscribeModalCourse(null);
      navigateToLogin();
      return;
    }
    if (!subscribeModalCourse) return;
    setIsSubscribingCourse(true);
    setSubscribeMessage(null);
    try {
      const res = await platformDB.enrollUserInCourseAsync(
        subscribeModalCourse.id,
        currentUser.id
      );
      if (res.success) {
        setSubscribeMessage({ type: 'success', text: res.message });
        refreshData();
        window.setTimeout(() => {
          setSubscribeModalCourse(null);
        }, 900);
      } else {
        setSubscribeMessage({ type: 'error', text: res.message });
      }
    } finally {
      setIsSubscribingCourse(false);
    }
  };

  const handleSubscribeCourseWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setSubscribeModalCourse(null);
      navigateToLogin();
      return;
    }
    if (!subscribePinInput.trim() || !subscribeModalCourse) return;
    setIsSubscribingCourse(true);
    setSubscribeMessage(null);
    try {
      const res = await platformDB.redeemCodeForUserAsync(
        subscribePinInput.trim(),
        currentUser.id
      );
      if (res.success) {
        let finalMessage = res.message;
        const freshUser = platformDB.getCurrentUser();
        const enrolled = freshUser?.enrolledCourses || [];
        if (!enrolled.includes(subscribeModalCourse.id)) {
          if (freshUser && (freshUser.balance || 0) >= subscribeModalCourse.price) {
            const enrollRes = await platformDB.enrollUserInCourseAsync(
              subscribeModalCourse.id,
              currentUser.id
            );
            if (enrollRes.success) {
              finalMessage = enrollRes.message;
            }
          }
        }
        setSubscribeMessage({ type: 'success', text: finalMessage });
        refreshData();
        window.setTimeout(() => {
          setSubscribeModalCourse(null);
        }, 900);
      } else {
        setSubscribeMessage({ type: 'error', text: res.message });
      }
    } finally {
      setIsSubscribingCourse(false);
    }
  };

  // Initial sync + hydration restore + Real-time subscription + Window focus sync with Supabase
  useEffect(() => {
    let syncTimer: number | null = null;
    const runSync = async (isInitial = false) => {
      try {
        await platformDB.syncWithSupabase();
        refreshData();

        if (isInitial) {
          const parsed = initialRouteRef.current;
          const freshUser = platformDB.getCurrentUser();
          const freshCourses = platformDB.getCourses();
          const freshExams = platformDB.getExams();

          if (parsed.courseId) {
            const matchedCourse = freshCourses.find((c) => c.id === parsed.courseId) || null;
            if (matchedCourse) {
              setActiveTab('courses');
              setActiveCourseDetail(matchedCourse);
              if (parsed.lessonId && parsed.sectionId) {
                setCourseSelection({
                  lessonId: parsed.lessonId,
                  sectionId: parsed.sectionId,
                  itemId: parsed.itemId || undefined,
                });
              }
            }
          }

          if (parsed.examId && freshUser) {
            const matchedExam = freshExams.find((ex) => ex.id === parsed.examId) || null;
            if (matchedExam) setActiveExam(matchedExam);
          }

          const isStaff = freshUser?.role === 'admin' || freshUser?.role === 'secretary';
          if (parsed.adminOpen && isStaff) {
            setAdminInitialTab(parsed.adminTab);
            setAdminEditCourseId(parsed.adminCourseId);
            setIsAdminOpen(true);
          } else if (parsed.pathname === '/admin' && !freshUser) {
            navigateToLogin();
          }

          hasHydratedRouteRef.current = true;
          setIsBootstrapping(false);
        }
      } catch {
        if (isInitial) {
          hasHydratedRouteRef.current = true;
          setIsBootstrapping(false);
        }
      }
    };

    void runSync(true);

    const unsubscribeRealtime = subscribeToSupabaseRealtime(() => {
      if (syncTimer) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => void runSync(false), 350);
    });

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void runSync(false);
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      if (syncTimer) window.clearTimeout(syncTimer);
      unsubscribeRealtime();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [refreshData]);

  useEffect(() => {
    document.documentElement.setAttribute('data-color-theme', settings.colorTheme || 'amber');
    document.documentElement.setAttribute('data-page-layout', settings.pageLayout || 'comfortable');
  }, [settings.colorTheme, settings.pageLayout]);

  useEffect(() => {
    const localizedName = getLocalizedPlatformName(settings.platformName, t);
    const title = `${localizedName} | ${t.brand.pageTitleSuffix}`;
    document.title = title;
    const setMeta = (selector: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute('content', content);
    };
    setMeta('meta[name="description"]', t.brand.metaDescription);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', t.brand.ogDescription);
  }, [lang, settings.platformName, t]);

  const completedLecturesList = currentUser?.completedLectures || [];

  const layoutClass =
    settings.pageLayout === 'compact'
      ? 'max-w-6xl py-6 px-4 sm:px-5'
      : settings.pageLayout === 'modern'
      ? 'max-w-[1400px] py-6 sm:py-8 px-4 sm:px-6'
      : 'max-w-7xl py-6 sm:py-10 px-4 sm:px-6 lg:px-8';

  const themeAccentStyle =
    settings.colorTheme === 'blue'
      ? 'selection:bg-blue-500/30 selection:text-blue-700 dark:selection:text-blue-300'
      : settings.colorTheme === 'emerald'
      ? 'selection:bg-emerald-500/30 selection:text-emerald-700 dark:selection:text-emerald-300'
      : settings.colorTheme === 'purple'
      ? 'selection:bg-purple-500/30 selection:text-purple-700 dark:selection:text-purple-300'
      : settings.colorTheme === 'rose'
      ? 'selection:bg-rose-500/30 selection:text-rose-700 dark:selection:text-rose-300'
      : settings.colorTheme === 'cyan'
      ? 'selection:bg-cyan-500/30 selection:text-cyan-700 dark:selection:text-cyan-300'
      : 'selection:bg-amber-500/30 selection:text-amber-700 dark:selection:text-amber-300';

  const isStudent = currentUser?.role === 'student';

  if (currentPath === '/login' && !currentUser) {
    return (
      <>
        <SplashScreen onComplete={() => setSplashDone(true)} />
        <LoginPage
          settings={settings}
          onBackHome={() => {
            setPendingCourseAfterAuth(null);
            navigateToRootRoute();
          }}
          onSuccess={(user) => {
            setCurrentUser(user);
            setSelectedGrade(user.role === 'student' && user.grade ? normalizeGrade(user.grade) : 'All');
            refreshData();
            void platformDB.syncWithSupabase().then(() => refreshData());
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', '/');
            }
            setCurrentPath('/');
            if (pendingCourseAfterAuth) {
              setActiveTab('courses');
              setActiveCourseDetail(pendingCourseAfterAuth);
              setPendingCourseAfterAuth(null);
            } else if (user.role === 'admin' || user.role === 'secretary') {
              setIsAdminOpen(true);
            } else {
              setActiveTab('home');
            }
          }}
        />
        {splashDone && <PWAInstallBanner />}
      </>
    );
  }

  return (
    <div className={`w-full min-h-dvh overflow-x-clip bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col transition-colors ${themeAccentStyle}`}>
      <SplashScreen onComplete={() => setSplashDone(true)} />
      {splashDone && <PWAInstallBanner />}
      {/* Fixed Student Collapsible Sidebar & Mobile Slide-over Drawer (Student Role Only) */}
      {isStudent && (
        <StudentSidebar
          currentUser={currentUser}
          activeTab={activeTab}
          myAccountSubTab={myAccountInitialTab}
          coursesViewMode={coursesViewMode}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((p) => !p)}
          isMobileDrawerOpen={isMobileDrawerOpen}
          onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
          onSelectNav={navigateToTab}
          onOpenProfile={() => setIsProfileOpen(true)}
          onLogout={handleRequestLogout}
        />
      )}

      {/* Scrollable Page Column (Unboxed Header + Main + Footer scroll naturally while desktop sidebar remains fixed) */}
      <div
        className={`flex-1 flex flex-col min-w-0 w-full transition-[padding] duration-200 ${
          isStudent ? (isSidebarCollapsed ? 'md:ps-[76px]' : 'md:ps-[260px]') : ''
        }`}
      >
        {/* Top Navbar */}
        <Navbar
          currentUser={currentUser}
          settings={settings}
          selectedGrade={selectedGrade}
          onSelectGrade={setSelectedGrade}
          activeTab={activeTab}
          onSelectTab={navigateToTab}
          notifications={notifications}
          theme={theme}
          onToggleTheme={setTheme}
          onOpenAuth={navigateToLogin}
          onOpenAdmin={() => {
            if (currentUser?.role === 'admin' || currentUser?.role === 'secretary') {
              setAdminEditCourseId(null);
              setIsAdminOpen(true);
            }
          }}
          onOpenProfile={() => setIsProfileOpen(true)}
          onLogout={handleRequestLogout}
          onMarkAllNotificationsRead={refreshData}
        />

        {/* Main Content Area */}
        <main
          className={`flex-1 min-w-0 w-full mx-auto ${layoutClass} ${
            isStudent ? 'pt-14 md:pt-8' : ''
          }`}
        >
          {activeTab === 'home' && (
            <HomeSection
              currentUser={currentUser}
              settings={settings}
              courses={courses}
              totalExams={exams.filter((e) => e.category === 'exam').length}
              totalAssignments={exams.filter((e) => e.category !== 'exam').length}
              submissions={submissions}
              onSelectTab={(tab) => navigateToTab(tab)}
              onOpenLecture={(lec) => {
                setActiveTab('courses');
                setActiveCourseDetail(lec);
              }}
              onOpenAdmin={() => {
                if (currentUser?.role === 'admin' || currentUser?.role === 'secretary') {
                  setAdminEditCourseId(null);
                  setIsAdminOpen(true);
                }
              }}
              isDarkTheme={isDarkResolved}
            />
          )}

          {/* Auth Lock Gate for Educational Platform Sections (Documents, Exams, Assignments, Wallet, My Account) */}
          {!isBootstrapping && !currentUser && EDUCATIONAL_TABS.has(activeTab) && (
            <section className="max-w-2xl mx-auto my-8 bg-white dark:bg-[#0F172A] border border-amber-500/35 rounded-3xl p-7 sm:p-10 text-center shadow-2xl space-y-5">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  {t.app.lockTitle}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg mx-auto">
                  {t.app.lockDesc}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={navigateToLogin}
                  className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{t.app.signInOrCreate}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateToTab('home')}
                  className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Home className="w-4 h-4" />
                  <span>{t.app.backHome}</span>
                </button>
              </div>
            </section>
          )}

          {activeTab === 'courses' &&
            (activeCourseDetail ? (
              <CourseDetailView
                course={activeCourseDetail}
                currentUser={currentUser}
                documents={documents}
                exams={exams}
                completedLectures={completedLecturesList}
                initialSelection={courseSelection}
                onSelectionChange={setCourseSelection}
                onBack={() => {
                  setActiveCourseDetail(null);
                  setCourseSelection(null);
                }}
                onMarkLectureCompleted={handleMarkLectureCompleted}
                onExamSubmitted={handleExamSubmitted}
                onOpenAuth={() => {
                  setPendingCourseAfterAuth(activeCourseDetail);
                  navigateToLogin();
                }}
                onRequestSubscribe={(c) => {
                  setSubscribeModalCourse(c);
                  setSubscribeMessage(null);
                  setSubscribePinInput('');
                }}
                onEditCourseInAdmin={(c) => {
                  if (currentUser?.role === 'admin' || currentUser?.role === 'secretary') {
                    setAdminEditCourseId(c.id);
                    setAdminInitialTab('courses');
                    setIsAdminOpen(true);
                  }
                }}
              />
            ) : (
              <CoursesSection
                courses={courses}
                currentUser={currentUser}
                selectedGrade={selectedGrade}
                viewMode={coursesViewMode}
                onChangeViewMode={setCoursesViewMode}
                onEnterCourse={(lec) => {
                  setCourseSelection(null);
                  setActiveCourseDetail(lec);
                }}
                onOpenAuth={navigateToLogin}
                completedLectures={completedLecturesList}
                onDataChanged={refreshData}
                onOpenWallet={() => {
                  setActiveCourseDetail(null);
                  setCourseSelection(null);
                  setActiveTab('wallet');
                }}
              />
            ))}

        {currentUser && activeTab === 'documents' && (
          <DocumentsSection
            documents={documents}
            selectedGrade={selectedGrade}
            onOpenDocument={(doc) => setActiveDocument(doc)}
            onOpenInBrowserViewer={(doc) => setActiveInBrowserDoc(doc)}
          />
        )}

        {currentUser && activeTab === 'exams' && (
          <ExamsSection
            exams={exams}
            currentUser={currentUser}
            selectedGrade={selectedGrade}
            onStartExam={(ex) => setActiveExam(ex)}
            submissions={submissions}
          />
        )}

        {currentUser && activeTab === 'assignments' && (
          <AssignmentsSection
            assignments={exams}
            currentUser={currentUser}
            selectedGrade={selectedGrade}
            onStartAssignment={(item) => setActiveExam(item)}
            submissions={submissions}
          />
        )}

        {currentUser && activeTab === 'wallet' && (
          <WalletSection
            currentUser={currentUser}
            settings={settings}
            onOpenAuth={navigateToLogin}
            onBalanceUpdated={refreshData}
          />
        )}

        {currentUser && activeTab === 'my-account' && (
          <MyAccountSection
            currentUser={currentUser}
            settings={settings}
            exams={exams}
            submissions={submissions}
            initialTopTab={myAccountInitialTab}
            onStartExam={(ex) => setActiveExam(ex)}
            onOpenProfile={() => setIsProfileOpen(true)}
            onBalanceUpdated={refreshData}
            onDataChanged={refreshData}
          />
        )}

        {currentUser && activeTab === 'rankings' && (
          <TopRankingsSection
            exams={exams}
            submissions={submissions}
            students={students}
            selectedGrade={selectedGrade}
            currentUser={currentUser}
          />
        )}

        {currentUser && activeTab === 'students-data' && (
          <StudentsDataSection
            students={students}
            courses={courses}
            exams={exams}
            submissions={submissions}
            settings={settings}
            currentUser={currentUser}
            onOpenAuth={navigateToLogin}
            onDataChanged={refreshData}
          />
        )}

        {activeTab === 'honor' && <HonorBoardSection students={honorStudents} />}

        {activeTab === 'support' && (
          <SupportSection
            currentUser={currentUser}
            settings={settings}
            supportThreads={supportThreads}
            onDataChanged={refreshData}
          />
        )}
        </main>

        {/* Footer */}
        <Footer settings={settings} onSelectTab={navigateToTab} />
      </div>

      {/* Global Modals */}

      <AdminDashboardModal
        isOpen={isAdminOpen && (currentUser?.role === 'admin' || currentUser?.role === 'secretary')}
        initialEditCourseId={adminEditCourseId}
        initialAdminTab={adminInitialTab}
        onAdminTabChange={setAdminInitialTab}
        onClose={() => {
          setIsAdminOpen(false);
          setAdminEditCourseId(null);
        }}
        settings={settings}
        onSettingsUpdated={(newSettings) => {
          setSettings(newSettings);
          refreshData();
        }}
        onDataChanged={refreshData}
      />

      {isProfileOpen && currentUser?.role === 'student' && (
        <ProfileModal
          isOpen={isProfileOpen}
          currentUser={currentUser}
          settings={settings}
          onClose={() => setIsProfileOpen(false)}
          onUpdated={(u) => {
            setCurrentUser(u);
            if (u.role === 'student' && u.grade) {
              setSelectedGrade(normalizeGrade(u.grade));
            }
            refreshData();
            setProfileToast(t.app.profileSavedToast);
            window.setTimeout(() => setProfileToast(null), 3500);
          }}
          onSelectTab={setActiveTab}
        />
      )}

      {profileToast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl bg-emerald-600 text-white text-xs sm:text-sm font-bold shadow-2xl border border-emerald-400/40 flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{profileToast}</span>
        </div>
      )}

      {currentUser && activeLecture && (
        <VideoPlayerModal
          lecture={activeLecture}
          currentUser={currentUser}
          onClose={() => setActiveLecture(null)}
          onMarkCompleted={handleMarkLectureCompleted}
          isCompleted={completedLecturesList.includes(activeLecture.id)}
          onOpenDocument={(doc) => {
            setActiveLecture(null);
            setActiveDocument(doc);
          }}
          onOpenExam={(exam) => {
            setActiveLecture(null);
            setActiveExam(exam);
          }}
        />
      )}

      {currentUser && activeDocument && (
        <DocumentViewerModal
          document={activeDocument}
          currentUser={currentUser}
          courses={courses}
          onClose={() => setActiveDocument(null)}
        />
      )}

      {currentUser && activeInBrowserDoc && (
        <InBrowserPdfViewer
          document={activeInBrowserDoc}
          currentUser={currentUser}
          courses={courses}
          onClose={() => setActiveInBrowserDoc(null)}
        />
      )}

      {currentUser && activeExam && (
        <ExamTakerModal
          exam={activeExam}
          currentUser={currentUser}
          onClose={() => setActiveExam(null)}
          onSubmitted={handleExamSubmitted}
        />
      )}

      {/* Course Subscription Modal (triggered from CourseDetailView Read-Only Preview) */}
      <Modal
        isOpen={Boolean(subscribeModalCourse)}
        onClose={() => setSubscribeModalCourse(null)}
        maxWidthClass="max-w-lg"
        overlayClassName="z-50 bg-black/75 dark:bg-black/85 backdrop-blur-md"
        panelClassName="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700"
        headerClassName="px-4 sm:px-5 py-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-[#1E293B] border-b border-slate-200 dark:border-slate-800"
        bodyClassName="p-5 sm:p-6 space-y-5"
        headerContent={
          subscribeModalCourse ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block truncate">
                  {subscribeModalCourse.chapter}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {subscribeModalCourse.title}
                </h3>
              </div>
            </div>
          ) : null
        }
      >
        {subscribeModalCourse && (
          <>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Wallet className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">{t.app.currentWalletBalance}</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                    {currentUser?.balance || 0} {t.common.currency}
                  </span>
                </div>
              </div>

              <div className="text-end">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">{t.app.subscriptionFee}</span>
                <span className="text-base font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                  {subscribeModalCourse.isFree ? t.app.freeZeroEgp : `${subscribeModalCourse.price} ${t.common.currency}`}
                </span>
              </div>
            </div>

            {subscribeMessage && (
              <div
                className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
                  subscribeMessage.type === 'success'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                    : 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/40'
                }`}
              >
                {subscribeMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                )}
                <span>{subscribeMessage.text}</span>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <span>
                  {subscribeModalCourse.isFree
                    ? t.app.instantFreeTitle
                    : t.app.instantWalletTitle}
                </span>
              </h4>

              <button
                type="button"
                onClick={() => void handleSubscribeCourseWithBalance()}
                disabled={isSubscribingCourse}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubscribingCourse ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 fill-slate-950" />
                )}
                <span>
                  {subscribeModalCourse.isFree
                    ? t.app.confirmFreeBtn
                    : `${t.app.confirmPaidBtnPrefix} (${subscribeModalCourse.price} ${t.common.currency})`}
                </span>
              </button>

              {!subscribeModalCourse.isFree && (currentUser?.balance || 0) < subscribeModalCourse.price && (
                <button
                  type="button"
                  onClick={() => {
                    setSubscribeModalCourse(null);
                    setActiveCourseDetail(null);
                    setActiveTab('wallet');
                  }}
                  className="w-full text-[11px] text-amber-600 dark:text-amber-400 hover:underline text-center font-semibold pt-1 cursor-pointer"
                >
                  {t.app.insufficientBalanceLink}
                </button>
              )}
            </div>

            {!subscribeModalCourse.isFree && (
              <>
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                  <span className="flex-shrink mx-4 text-xs font-bold text-slate-500">{t.common.or}</span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>{t.app.redeemCodeTitle}</span>
                  </h4>

                  <form onSubmit={handleSubscribeCourseWithCode} className="flex gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      required
                      value={subscribePinInput}
                      onChange={(e) => setSubscribePinInput(e.target.value.toUpperCase())}
                      placeholder={t.app.redeemPlaceholder}
                      className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={isSubscribingCourse || !subscribePinInput.trim()}
                      className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {t.app.redeemBtn}
                    </button>
                  </form>
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        maxWidthClass="max-w-sm"
        headerContent={
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center justify-center shrink-0">
              <LogOut className="w-4 h-4 rtl:rotate-180" />
            </div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              {t.app.confirmLogoutTitle}
            </h3>
          </div>
        }
        bodyClassName="p-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(false)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={handleConfirmLogout}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/25 cursor-pointer"
            >
              {t.app.yesSignOut}
            </button>
          </div>
        }
      >
        <p>
          {t.app.confirmLogoutBodyPrefix} {getLocalizedPlatformName(settings.platformName, t)}
          {t.app.questionMark}
        </p>
      </Modal>
    </div>
  );
}
