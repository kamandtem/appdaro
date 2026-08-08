import React, { useState, useEffect, useCallback, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { AppState, Medication, DoseStatus, NavigationTab, FontSize, SkipReason } from './types';
import { loadAppState, saveAppState } from './services/storageService';
import { Header } from './components/common/Header';
import { Navigation } from './components/common/Navigation';
import { SideDrawer } from './components/common/SideDrawer';
import { SplashScreen } from './components/onboarding/SplashScreen';
import { Onboarding } from './components/onboarding/Onboarding';
import { StackedCards } from './components/home/StackedCards';
import { MedicationList } from './components/medications/MedicationList';
import { AddMedicationWizard } from './components/medications/AddMedicationWizard';
import { ReportsView } from './components/reports/ReportsView';
import { InteractionsView } from './components/interactions/InteractionsView';
import { PharmacyView } from './components/pharmacy/PharmacyView';
import { MedicationCatalogEntry, INSTRUCTION_TAG_LABELS } from './data/medicationCatalog';
import { SettingsView } from './components/settings/SettingsView';
import { requestNotificationPermissions, addNotificationTapListener } from './adapters/CapacitorNotificationAdapter';
import { LogOut } from 'lucide-react';
// Composition root و Occurrence Resolver: تنها مسیر write وضعیت occurrence.
import { homeQueueDeps, occurrenceQueryService, resolverDeps, syncOccurrences, syncPendingNotifications } from './application/runtime';
import { sweepMissed } from './domain/occurrence/ResolverEngine';
import { resolve as resolveOccurrence, snooze as snoozeOccurrence } from './domain/occurrence/ResolverEngine';
// تیکه ۱۰ — DESIGN.md بخش ۱۷: پنل خانه از این به بعد صفش را از
// HomeQueueService می‌گیرد (پنجره‌ی فعال‌سازی + سقف ۵ کارت + ترتیب اولویت)،
// نه از ساختِ درجای «وعده‌های امروز» داخل StackedCards.
import { homeCards, nextTransitionAt, todaySummary } from './application/HomeQueueService';

const FONT_SIZE_CLASS: Record<FontSize, string> = {
  small: 'text-sm',
  medium: '',
  large: 'text-lg'
};

// «بعداً» یک کارت را در صف خانه به عقب می‌برد — این کاملاً به انتخاب خود
// کاربر است و هیچ تایمر ثابتی (مثل ۵ دقیقه‌ی قبلی) ندارد که خودکار کارت را
// برگرداند؛ کارت تا وقتی کاربر خودش اقدام دیگری کند (یا دیگر کارتی جلوترش
// نمانده باشد) همان‌جا ته صف می‌ماند. ربطی به سیستم ددلاین/یادآورهای سه‌گانه‌ی
// بخش ۳ ندارد — آن سیستم کاملاً مستقل و بر اساس زمان واقعی دوز اجرا می‌شود.
// چند وقت یک‌بار وضعیت دوزهای در انتظار رو با ددلاینشون مقایسه می‌کنیم تا
// «missed» به‌موقع (و بدون نیاز به رفرش) ثبت بشه.
const MISSED_CHECK_INTERVAL_MS = 30 * 1000;

export default function App() {
  const [state, setState] = useState<AppState>(() => loadAppState());
  // اسپلش اسکرین برخلاف Onboarding در localStorage ذخیره نمی‌شه — باید در هر
  // بار اجرای برنامه (هر بار باز شدن اپ) از نو نمایش داده بشه، پس این یک
  // state محلی و مستقل از AppState/localStorage است.
  const [showSplash, setShowSplash] = useState(true);
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  // وقتی از Bottom Sheet «مصرف نکردم» (دلیل «زمان مصرف مناسب نیست») باز می‌شود،
  // پنل ویرایش دارو باید مستقیماً روی بخش «زمان مصرف» اسکرول/فوکوس شود.
  const [editFocusSection, setEditFocusSection] = useState<'times' | undefined>(undefined);
  // When the wizard is opened from the Pharmacy's "افزودن به داروهای من" button, this
  // carries the picked catalog entry so the wizard opens pre-filled and already
  // linked (via catalogId) to the central database — no fuzzy name matching needed.
  const [pharmacyPrefill, setPharmacyPrefill] = useState<MedicationCatalogEntry | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // Set when a reminder notification wants a specific medication's card pulled to
  // the front of the home stack.
  const [priorityMedId, setPriorityMedId] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);

  // تیکه ۱۰ — «الان»ی که پنل خانه با آن رندر می‌شود. عمداً یک state است، نه
  // `Date.now()` درجای رندر: هر بار که واقعاً چیزی می‌تواند عوض شده باشد
  // (sync افق، ثبت یک دوز، عبور از یک پله‌ی escalation) یک‌بار به‌روز می‌شود —
  // جایگزین تیک ۴ثانیه‌ای قدیمی داخل StackedCards (بخش ۱۷.۵).
  const [homeQueueNow, setHomeQueueNow] = useState<number>(() => Date.now());
  const refreshHomeQueue = useCallback(() => setHomeQueueNow(Date.now()), []);

  // Ask for notification permission early — covers the real scheduled dose-time
  // alerts and the three-reminder missed-dose escalation, both native via Capacitor.
  useEffect(() => {
    requestNotificationPermissions().catch(() => setNotificationError('دسترسی اعلان‌ها برقرار نشد. از تنظیمات دستگاه، اعلان‌ها و آلارم دقیق را فعال کنید.'));
  }, []);

  // Bring the user back to the home tab with this medication's card in front —
  // used both by the in-app "later" flow and by tapping the reminder notification.
  const openReminderForMed = useCallback((medId: string) => {
    setState(prev => ({ ...prev, currentTab: 'today' }));
    setPriorityMedId(medId);
  }, []);

  const openReminderForOccurrence = useCallback((occurrenceId: string) => {
    const occurrence = resolverDeps.occurrenceRepository.getById(occurrenceId);
    if (occurrence) openReminderForMed(occurrence.medicationId);
  }, [openReminderForMed]);

  // Tapping an actual scheduled dose-time notification (native) opens the app on
  // that exact medication's card, same as the in-app "نوبت بعدی" row.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const remove = await addNotificationTapListener(({ occurrenceId, actionId }) => {
        if (actionId === 'taken') {
          resolveOccurrence(occurrenceId, 'taken', resolverDeps);
          refreshHomeQueue();
          return;
        }
        if (actionId === 'later') {
          snoozeOccurrence(occurrenceId, resolverDeps);
          refreshHomeQueue();
          return;
        }
        openReminderForOccurrence(occurrenceId);
      });
      if (cancelled) {
        remove?.();
      } else {
        cleanup = remove;
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [openReminderForOccurrence]);

  // تیکه ۸ — DESIGN.md بخش ۳ («چه زمانی Occurrence Generator صدا زده می‌شه»):
  // در mount، و هر بار state.medications عوض بشه (افزودن/ویرایش/حذف/toggle —
  // همه‌شون این آرایه رو عوض می‌کنن)، migrateLegacyData (idempotent، تیکه ۶)
  // و به‌دنبالش ensureHorizon دوباره اجرا می‌شن تا افق rolling occurrenceهای
  // pending همیشه پر بمونه — پیش‌نیازیه که Occurrence Resolver
  // زیر بتونن واقعاً یک occurrence برای resolve کردن پیدا کنن.
  useEffect(() => {
    syncOccurrences(state.medications);
    void syncPendingNotifications().catch(() => setNotificationError('زمان‌بندی اعلان‌ها انجام نشد. مجوز اعلان و آلارم دقیق دستگاه را بررسی کنید.'));
    // افق تازه تولید/به‌روز شد — صف خانه باید دوباره از Repository خوانده شود.
    // (این effect بعد از رندر اجرا می‌شود، پس بدون این فراخوانی، اولین رندرِ
    // بعد از mount هنوز صف خالی می‌دید.)
    refreshHomeQueue();
  }, [state.medications, refreshHomeQueue]);

  // Escalation reminders are one-shot (بخش ۳ در NotificationEngine) و برای
  // «فردا» فقط وقتی درست زمان‌بندی می‌شن که این تابع دوباره صدا زده بشه. اگه
  // اپ کل شب بسته باشه، به‌محض resume (باز شدن دوباره) یک‌بار sync می‌کنیم تا
  // برنامه‌ی روز جدید فوراً جایگزین برنامه‌ی دیروز بشه.
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const handle = await CapacitorApp.addListener('resume', () => {
          const medications = state.medications;
          // تیکه ۸ — DESIGN.md بخش ۳: «در باز شدن اپ / resume» صراحتاً یکی از
          // نقاط صدا زدن Occurrence Generator است.
          syncOccurrences(medications);
          void syncPendingNotifications().catch(() => setNotificationError('زمان‌بندی اعلان‌ها انجام نشد. مجوز اعلان و آلارم دقیق دستگاه را بررسی کنید.'));
          refreshHomeQueue();
        });
        if (cancelled) {
          handle.remove();
        } else {
          removeListener = () => handle.remove();
        }
      } catch (e) {
        // Not running inside a native Capacitor shell (e.g. plain browser) — safe to ignore.
        console.warn('Capacitor app resume listener unavailable:', e);
      }
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [refreshHomeQueue, state.medications]);

  // Keep the latest UI/nav state in a ref so the native back-button
  // listener (registered once) always sees fresh values.
  const backStateRef = useRef({
    isMenuOpen,
    showAddWizard,
    isSettingsOpen,
    showExitConfirm,
    currentTab: state.currentTab
  });
  useEffect(() => {
    backStateRef.current = {
      isMenuOpen,
      showAddWizard,
      isSettingsOpen,
      showExitConfirm,
      currentTab: state.currentTab
    };
  }, [isMenuOpen, showAddWizard, isSettingsOpen, showExitConfirm, state.currentTab]);

  // Sync dark mode class with DOM
  useEffect(() => {
    if (state.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    saveAppState(state);
  }, [state]);

  // Handlers for state updates
  const handleFinishSplash = () => {
    setShowSplash(false);
  };

  const handleFinishOnboarding = () => {
    setState(prev => ({ ...prev, hasSeenOnboarding: true }));
  };

  const handleSelectTab = (tab: NavigationTab) => {
    if (tab === 'add') {
      setPharmacyPrefill(null);
      setShowAddWizard(true);
    } else {
      setState(prev => ({ ...prev, currentTab: tab }));
    }
  };

  const handleToggleDarkMode = () => {
    setState(prev => ({ ...prev, isDarkMode: !prev.isDarkMode }));
  };

  const handleSaveSettings = (data: { userName: string; userAvatarUrl?: string; fontSize: FontSize }) => {
    setState(prev => ({
      ...prev,
      userName: data.userName,
      userAvatarUrl: data.userAvatarUrl,
      fontSize: data.fontSize
    }));
  };

  // Handles both card actions from StackedCards: «مصرف شد» (status: 'taken') و
  // «بعداً» (status: 'snoozed'). نقش «بعداً» عمداً محدوده به همین دو کار:
  // (۱) کارت رو در صف خانه به عقب می‌بره (به‌صورت دائم، نه با تایمر — رفتار
  // فعلی در StackedCards)، (۲) یک لاگ با وضعیت 'snoozed' ثبت می‌کنه (برای
  // گزارش‌گیری، بخش ۵). هیچ کدوم این‌ها به‌عنوان «resolved» شناخته نمی‌شن (نگاه
  // کن به Occurrence Resolver)، پس «بعداً» زدن
  // هیچ تاثیری روی زمان‌بندی سه‌گانه‌ی نوتیفیکیشن نداره — فقط 'taken'/'skipped'/
  // 'missed' (این آخری خودکار، توسط checkMissedDoses) اون‌ها رو کنسل و برای
  // فردا reschedule می‌کنن. `slotIndex` مشخص می‌کنه دقیقاً کدوم وعده (صبح/
  // ظهر/شب و...) این اقدام مربوط بهشه — همین فیلده که باعث می‌شه ثبت یک وعده
  // روی بقیه‌ی وعده‌های همون روز اثر نذاره.
  const handleUpdateDoseStatus = (occurrenceId: string, status: DoseStatus) => {
    const occurrence = resolverDeps.occurrenceRepository.getById(occurrenceId);
    if (!occurrence) return;
    const med = state.medications.find(m => m.id === occurrence.medicationId);
    if (!med) return;

    if (status === 'taken') {
      resolveOccurrence(occurrenceId, 'taken', resolverDeps);
    } else if (status === 'snoozed') {
      snoozeOccurrence(occurrenceId, resolverDeps);
    }

    if (status === 'taken' && med.remainingCount > 0) {
      setState(prev => ({
        ...prev,
        medications: prev.medications.map(m => m.id === med.id
          ? { ...m, remainingCount: m.remainingCount - 1 }
          : m)
      }));
    }
    refreshHomeQueue();
  };

  // Resolver تنها منبع transition به missed است؛ دیگر DoseLog legacy تولید
  // نمی‌شود و dual-write در این مرحله کامل حذف شده است.
  useEffect(() => {
    const checkMissedDoses = () => {
      const missedOccurrences = sweepMissed(Date.now(), resolverDeps);
      if (missedOccurrences.length > 0) refreshHomeQueue();
    };
    checkMissedDoses();
    const id = setInterval(checkMissedDoses, MISSED_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshHomeQueue]);

  const handleToggleMedActive = (medId: string) => {
    setState(prev => ({
      ...prev,
      // فعال‌سازی دستی (چه دارویی که خودِ کاربر خاموش کرده بود، چه دارویی که با
      // «مصرف نکردم» به حالت غیرفعال/در انتظار تهیه رفته بود) همیشه pauseReason
      // را پاک می‌کند — از این به بعد دیگر «در انتظار تهیه»/غیرفعالِ خاص نیست.
      medications: prev.medications.map(m => m.id === medId
        ? { ...m, isActive: !m.isActive, pauseReason: m.isActive ? m.pauseReason : undefined }
        : m
      )
    }));
  };

  // دکمه‌ی «مصرف نکردم» روی کارت خانه (بخش MedicationSkipSheet): همین وعده رو
  // با دلیل انتخاب‌شده skipped می‌کنه. برای سه دلیل «عوارض»/«توصیه پزشک»/
  // «تمام شده»، خودِ دارو هم از چرخه یادآوری خارج می‌شه (isActive: false) —
  // با pauseReason مخصوص همون دلیل، تا در لیست داروها «در انتظار تهیه» با
  // «غیرفعال»ِ معمولی قاطی نشه. برای «زمان مصرف مناسب نیست» دارو فعال می‌مونه.
  const handleSkipDose = (occurrenceId: string, reason: SkipReason) => {
    const occurrence = resolverDeps.occurrenceRepository.getById(occurrenceId);
    if (!occurrence) return;
    const med = state.medications.find(m => m.id === occurrence.medicationId);
    if (!med) return;
    resolveOccurrence(occurrenceId, 'skipped', resolverDeps, { skipReason: reason });

    const pauseReasonForSkip: Record<SkipReason, Medication['pauseReason']> = {
      timing: undefined,
      side_effects: 'side_effects',
      doctor_advice: 'doctor_advice',
      out_of_stock: 'awaiting_refill'
    };
    const shouldDeactivate = reason !== 'timing';
    setState(prev => ({
      ...prev,
      medications: shouldDeactivate
        ? prev.medications.map(m => m.id === med.id ? { ...m, isActive: false, pauseReason: pauseReasonForSkip[reason] } : m)
        : prev.medications
    }));
    refreshHomeQueue();
  };

  // فقط برای دلیل «زمان مصرف مناسب نیست» — پنل ویرایش همین دارو رو مستقیماً
  // روی بخش «زمان مصرف» باز می‌کنه تا کاربر ساعت یادآوری رو عوض کنه.
  const handleRequestEditReminderTime = (medId: string) => {
    const med = state.medications.find(m => m.id === medId);
    if (!med) return;
    setEditingMedication(med);
    setEditFocusSection('times');
    setPharmacyPrefill(null);
    setShowAddWizard(true);
  };

  const handleEditMedication = (med: Medication) => {
    setEditingMedication(med);
    setEditFocusSection(undefined);
    setPharmacyPrefill(null);
    setShowAddWizard(true);
  };

  const handleUpdateMedication = (updatedMed: Medication) => {
    setState(prev => ({
      ...prev,
      medications: prev.medications.map(m => m.id === updatedMed.id ? updatedMed : m)
    }));
  };

  const handleCloseAddWizard = () => {
    setShowAddWizard(false);
    setEditingMedication(null);
    setEditFocusSection(undefined);
    setPharmacyPrefill(null);
  };

  const handleAddFromPharmacy = (entry: MedicationCatalogEntry) => {
    setPharmacyPrefill(entry);
    setEditingMedication(null);
    setShowAddWizard(true);
  };

  const handleDeleteMedication = (medId: string) => {
    setState(prev => ({
      ...prev,
      medications: prev.medications.filter(m => m.id !== medId)
    }));
  };

  const handleRefillStock = (medId: string, amount: number) => {
    setState(prev => ({
      ...prev,
      medications: prev.medications.map(m => m.id === medId ? { ...m, remainingCount: m.remainingCount + amount, totalCount: Math.max(m.totalCount, m.remainingCount + amount) } : m)
    }));
  };

  const handleAddMedication = (newMed: Medication) => {
    setState(prev => ({
      ...prev,
      medications: [newMed, ...prev.medications],
      currentTab: 'medications'
    }));
  };

  const handleAddMultipleMedications = (newMeds: Medication[]) => {
    setState(prev => ({
      ...prev,
      medications: [...newMeds, ...prev.medications],
      currentTab: 'medications'
    }));
  };

  // تیکه ۱۰ — تنها محاسبه‌ی «کدام کارت‌ها الان دیده شوند» در کل اپ
  // (DESIGN.md بخش ۱۷.۲/۱۷.۶ — منبع واحد). StackedCards دیگر خودش چیزی
  // نمی‌سازد، فقط همین خروجی را رندر می‌کند.
  const homeQueue = React.useMemo(() => homeCards(homeQueueNow, homeQueueDeps), [homeQueueNow]);
  const homeToday = React.useMemo(() => todaySummary(homeQueueNow, homeQueueDeps), [homeQueueNow]);

  // بخش ۱۷.۵ — به‌جای تایمر دوره‌ای، دقیقاً یک setTimeout روی زودترین مرزِ
  // واقعی (ورود کارت بعدی به پنجره‌ی فعال‌سازی، یا عبور یک کارت از یک پله‌ی
  // escalation). اگر مرزی در پیش نباشد، هیچ تایمری اصلاً ساخته نمی‌شود.
  useEffect(() => {
    const at = nextTransitionAt(homeQueueNow, homeQueueDeps);
    if (at === null) return;
    const delay = Math.max(1000, at - Date.now() + 250);
    const id = setTimeout(refreshHomeQueue, delay);
    return () => clearTimeout(id);
  }, [homeQueueNow, refreshHomeQueue]);

  // Filter medications for the app
  const profileMeds = state.medications;
  const profileLogs = state.doseLogs;

  const activeMedsCount = profileMeds.filter(m => m.isActive).length;
  const takenCount = profileLogs.filter(l => l.status === 'taken').length;
  const totalLogs = profileLogs.length;
  const adherenceRate = totalLogs > 0 ? Math.round((takenCount / totalLogs) * 100) : 98;

  // آمار drawer از همان occurrenceهای روز محلی می‌آید؛ دوباره از روی UTC/date-log
  // محاسبه نمی‌کنیم تا با HomeQueue/Reports در نیمه‌شب اختلاف نداشته باشد.
  const takenTodayCount = homeToday.taken;
  const totalTodayCount = homeToday.total;
  const remainingTodayCount = Math.max(0, totalTodayCount - homeToday.resolved);

  // Hardware back-button handling (Android via Capacitor):
  // - Closes any open overlay (exit dialog, settings, add wizard, menu) first
  // - Otherwise navigates to the home tab from anywhere
  // - Pressing back again while already on the home tab asks for exit confirmation
  const handleBackButton = useCallback(() => {
    const s = backStateRef.current;
    if (s.showExitConfirm) {
      setShowExitConfirm(false);
      return;
    }
    if (s.isSettingsOpen) {
      setIsSettingsOpen(false);
      return;
    }
    if (s.showAddWizard) {
      handleCloseAddWizard();
      return;
    }
    if (s.isMenuOpen) {
      setIsMenuOpen(false);
      return;
    }
    if (s.currentTab !== 'today') {
      setState(prev => ({ ...prev, currentTab: 'today' }));
      return;
    }
    setShowExitConfirm(true);
  }, []);

  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const handle = await CapacitorApp.addListener('backButton', () => {
          handleBackButton();
        });
        if (cancelled) {
          handle.remove();
        } else {
          removeListener = () => handle.remove();
        }
      } catch (e) {
        // Not running inside a native Capacitor shell (e.g. plain browser) — safe to ignore.
        console.warn('Capacitor back button listener unavailable:', e);
      }
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [handleBackButton]);

  const handleConfirmExit = async () => {
    try {
      CapacitorApp.exitApp();
    } catch (e) {
      // Not on native platform — just close the dialog.
      console.warn('Unable to exit app natively:', e);
      setShowExitConfirm(false);
    }
  };

  // 1. Render Splash Screen — always shown once per app launch, every time
  if (showSplash) {
    return <SplashScreen onFinish={handleFinishSplash} />;
  }

  // 2. Render Onboarding Slides if not seen yet
  if (!state.hasSeenOnboarding) {
    return <Onboarding onComplete={handleFinishOnboarding} />;
  }

  // 3. Main Application Render
  return (
    <div className={`min-h-screen pb-28 bg-gradient-to-br from-[#E0F2F1] via-[#F0FDF4] to-[#E0F7FA] dark:from-slate-950 dark:via-teal-950/40 dark:to-slate-900 text-[#1A2E35] dark:text-slate-100 relative overflow-x-hidden ${FONT_SIZE_CLASS[state.fontSize]}`}>
      {notificationError && <button type="button" onClick={() => setNotificationError(null)} className="fixed top-2 left-2 right-2 z-[60] rounded-xl bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 text-xs font-bold text-right">{notificationError}</button>}
      {/* Background Mesh Orbs for Frosted Glass Effect */}
      <div className="fixed top-[-100px] left-[-100px] w-80 h-80 bg-teal-300 dark:bg-teal-600/20 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl opacity-40 pointer-events-none z-0" />
      <div className="fixed bottom-[100px] right-[-50px] w-96 h-96 bg-blue-300 dark:bg-blue-600/20 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl opacity-40 pointer-events-none z-0" />
      <div className="fixed top-1/3 right-1/4 w-72 h-72 bg-emerald-200 dark:bg-emerald-600/10 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl opacity-30 pointer-events-none z-0" />

      {/* Top Header matching Image 1 */}
      <Header
        onOpenMenu={() => setIsMenuOpen(true)}
        nextCard={homeQueue[0] ?? null}
        totalToday={homeToday.total}
        resolvedToday={homeToday.resolved}
        onOpenReminder={openReminderForMed}
      />

      {/* Side Drawer Menu matching Image 3 */}
      <SideDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        currentTab={state.currentTab}
        onSelectTab={handleSelectTab}
        isDarkMode={state.isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        userName={state.userName}
        userAvatarUrl={state.userAvatarUrl}
        onChangeAvatar={(dataUrl) => setState(prev => ({ ...prev, userAvatarUrl: dataUrl }))}
        activeMedsCount={activeMedsCount}
        adherenceRate={adherenceRate}
        takenTodayCount={takenTodayCount}
        remainingTodayCount={remainingTodayCount}
        totalTodayCount={totalTodayCount}
      />

      {/* Main View Container */}
      <main className="container max-w-3xl mx-auto px-3 sm:px-6 pt-4 relative z-10">
        {state.currentTab === 'today' && (
          <StackedCards
            cards={homeQueue}
            takenCards={homeToday.takenCards}
            totalToday={homeToday.total}
            resolvedToday={homeToday.resolved}
            medications={profileMeds.filter(m => m.isActive)}
            onUpdateStatus={handleUpdateDoseStatus}
            userName={state.userName}
            priorityMedId={priorityMedId}
            onConsumePriority={() => setPriorityMedId(null)}
            showGestureTutorial={!state.hasSeenCardGestureTutorial}
            onDismissGestureTutorial={() => setState(prev => ({ ...prev, hasSeenCardGestureTutorial: true }))}
            onSkipDose={handleSkipDose}
            onRequestEditReminderTime={handleRequestEditReminderTime}
          />
        )}

        {state.currentTab === 'medications' && (
          <MedicationList
            medications={profileMeds}
            onToggleActive={handleToggleMedActive}
            onDeleteMedication={handleDeleteMedication}
            onEditMedication={handleEditMedication}
            onRefillStock={handleRefillStock}
            onOpenAddWizard={() => { setPharmacyPrefill(null); setShowAddWizard(true); }}
          />
        )}

        {state.currentTab === 'reports' && (
          <ReportsView
            medications={profileMeds}
            logs={profileLogs}
            queryService={occurrenceQueryService}
          />
        )}

        {state.currentTab === 'interactions' && (
          <InteractionsView
            showDisclaimerPopup={!state.hasSeenInteractionsDisclaimer}
            onDismissDisclaimerPopup={() => setState(prev => ({ ...prev, hasSeenInteractionsDisclaimer: true }))}
          />
        )}

        {state.currentTab === 'pharmacy' && (
          <PharmacyView onAddToMyMeds={handleAddFromPharmacy} />
        )}

      </main>

      {/* Bottom Floating Navigation matching Image 2 */}
      <Navigation
        currentTab={state.currentTab}
        onSelectTab={handleSelectTab}
      />

      {/* Quick Add Wizard Modal */}
      {showAddWizard && (
        <AddMedicationWizard
          onAddMedication={handleAddMedication}
          onUpdateMedication={handleUpdateMedication}
          editMedication={editingMedication ?? undefined}
          onClose={handleCloseAddWizard}
          focusSection={editFocusSection}
          initialName={pharmacyPrefill?.fa}
          initialCatalogId={pharmacyPrefill?.id}
          initialInstructions={
            pharmacyPrefill?.instructionTags?.length
              ? pharmacyPrefill.instructionTags.map(t => INSTRUCTION_TAG_LABELS[t]).join(' • ')
              : undefined
          }
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsView
          onClose={() => setIsSettingsOpen(false)}
          userName={state.userName}
          userAvatarUrl={state.userAvatarUrl}
          fontSize={state.fontSize}
          onSave={handleSaveSettings}
        />
      )}

      {/* Exit Confirmation Modal (triggered by the hardware back button on the home tab) */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-xs p-6 text-center border border-white/60 dark:border-slate-800">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center">
              <LogOut className="w-7 h-7" />
            </div>
            <h3 className="font-black text-slate-800 dark:text-white text-lg mb-2">
              خروج از داروتو
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              آیا می‌خواهید از برنامه خارج شوید؟
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                خیر
              </button>
              <button
                onClick={handleConfirmExit}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 text-white font-black shadow-lg shadow-rose-500/30 hover:scale-[1.02] active:scale-95 transition-all"
              >
                بله
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
