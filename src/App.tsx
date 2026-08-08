import React, { useState, useEffect, useCallback, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { AppState, Medication, NavigationTab, FontSize, SkipReason, DoseOccurrence } from './types';
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
import { requestNotificationPermissions, syncOccurrenceNotifications, cancelOccurrenceNotifications, addNotificationTapListener } from './services/notificationService';
import { clockAdapter } from './adapters/ClockAdapter';
import { appLifecycleAdapter } from './adapters/AppLifecycleAdapter';
import { OccurrenceGenerator, DEFAULT_HORIZON_DAYS } from './domain/occurrence/OccurrenceGenerator';
import { ResolverEngine } from './domain/occurrence/ResolverEngine';
import { runLegacyToOccurrenceMigration } from './migration/legacyToOccurrenceMigration';
import { DoseOccurrenceRepository } from './repository/DoseOccurrenceRepository';
import { medicationTimeSlots } from './utils/doseSchedule';
import { timeOfDayFromSlotId } from './domain/scheduling/SchedulingEngine';
import { toEnglishNumbers } from './utils/persian';
import { LogOut } from 'lucide-react';

const FONT_SIZE_CLASS: Record<FontSize, string> = {
  small: 'text-sm',
  medium: '',
  large: 'text-lg'
};

// بخش ۴ سند («Missed»): sweepMissed روی کل backlog pending اجرا می‌شود — نه
// فقط «امروز» — تا در هر resume/boot و در فاصله‌های دوره‌ای کوتاه، دوزهای
// ازدست‌رفته حتی اگر گوشی چند روز خاموش بوده هم گم نشوند.
const SWEEP_INTERVAL_MS = 30 * 1000;

const occurrenceGenerator = new OccurrenceGenerator(clockAdapter);
const resolverEngine = new ResolverEngine(clockAdapter);

// بخش ۱۵ سند (ریسک «رشد نامحدود حجم occurrence»): بدون pruning، هم
// doseOccurrences و هم doseLogs (dual-write) تا ابد بزرگ می‌شن و می‌تونن به
// سقف حجمی localStorage نزدیک بشن. نگه‌داری pending همیشه (حتی قدیمی —
// باید توسط sweepMissed رسیدگی بشه، نه پاک بشه)، و رکوردهای resolve‌شده‌ی
// قدیمی‌تر از این بازه حذف می‌شن — همان بازه‌ی DoseOccurrenceRepository.
const DOSE_LOG_RETENTION_DAYS = 120;

/** فاز ۵ سند (پاک‌سازی): pruning واقعی روی هر دو آرایه — قبلاً
 *  DoseOccurrenceRepository.pruneOld نوشته شده بود ولی هیچ‌جا صدا زده
 *  نمی‌شد؛ اینجا هم آن و هم معادلش برای doseLogs واقعاً اجرا می‌شود. */
function pruneOldData(prev: AppState): AppState {
  const now = clockAdapter.now();
  const prunedOccurrences = new DoseOccurrenceRepository(prev.doseOccurrences).pruneOld(now);
  const cutoff = now.getTime() - DOSE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const prunedLogs = prev.doseLogs.filter(l => new Date(l.date).getTime() >= cutoff);

  if (prunedOccurrences.length === prev.doseOccurrences.length && prunedLogs.length === prev.doseLogs.length) {
    return prev; // چیزی برای حذف نبود — همان reference قبلی برگردانده می‌شود
  }
  return { ...prev, doseOccurrences: prunedOccurrences, doseLogs: prunedLogs };
}

/** slotId حالا از خودِ مقدار ساعت مشتق می‌شود (`${medId}::HH:mm`)، نه از
 *  ایندکس در آرایه (بخش ۱۳ - پل مهاجرت در SchedulingEngine؛ رفع باگ occurrence
 *  تکراری هنگام حذف/جابه‌جایی یک وعده). این کمکی فقط برای dual-write به
 *  DoseLog قدیمی — که هنوز `slotIndex` عددی می‌خواهد — همان ساعت را در
 *  medicationTimeSlots(med) پیدا و ایندکسش را برمی‌گرداند. */
function legacySlotIndexFromSlotId(slotId: string, med: Medication): number {
  const timeOfDay = timeOfDayFromSlotId(slotId);
  if (!timeOfDay) return 0;
  const idx = medicationTimeSlots(med).findIndex(t => toEnglishNumbers(t) === timeOfDay);
  return idx === -1 ? 0 : idx;
}

function occurrenceToLegacyDoseLog(occ: DoseOccurrence, med: Medication, status: 'taken' | 'skipped' | 'missed', timeZoneId: string) {
  const slotIndex = legacySlotIndexFromSlotId(occ.slotId, med);
  return {
    id: 'log_' + Math.random().toString(36).substring(2, 9),
    medId: med.id,
    slotIndex,
    medName: med.name,
    medForm: med.form,
    medDose: med.dose,
    scheduledTime: medicationTimeSlots(med)[slotIndex] || medicationTimeSlots(med)[0],
    actualTime: status !== 'missed' ? new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : undefined,
    status,
    date: clockAdapter.localDateKey(new Date(occ.scheduledAt), timeZoneId),
    familyMemberId: med.familyMemberId,
    skipReason: occ.skipReason
  };
}

/** فاز ۱ + بخش ۴ (sweepMissed): نتیجه‌ی ensureHorizonForAll و sweepMissed را
 *  یک‌جا در AppState ادغام می‌کند — occurrenceهای جدید اضافه، occurrenceهای
 *  missed جایگزین نسخه‌ی قبلی خودشان می‌شوند + دوباره‌نویسی موازی (dual-write)
 *  به doseLogs قدیمی. فاز ۵ (پاک‌سازی): ReportsView دیگر از doseLogs نمی‌خواند
 *  (مستقیماً از doseOccurrences می‌خواند) — این نوشتن فقط برای سازگاری
 *  Header.tsx باقی مانده، که طبق جدول بخش ۱۳ خارج از دامنه‌ی این مهاجرت ماند. */
function applySweepAndGeneration(
  prev: AppState,
  created: DoseOccurrence[],
  sweepResults: ReturnType<ResolverEngine['sweepMissed']>
): AppState {
  if (created.length === 0 && sweepResults.length === 0) return prev;
  const timeZoneId = clockAdapter.currentTimeZoneId();
  const medById = new Map(prev.medications.map(m => [m.id, m]));
  const missedLogs = sweepResults
    .map(r => {
      const med = medById.get(r.occurrence.medId);
      return med ? occurrenceToLegacyDoseLog(r.occurrence, med, 'missed', timeZoneId) : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const updatedOccurrences = prev.doseOccurrences.map(o => {
    const swept = sweepResults.find(r => r.occurrence.id === o.id);
    return swept ? swept.occurrence : o;
  });

  return {
    ...prev,
    doseOccurrences: [...updatedOccurrences, ...created],
    doseLogs: [...missedLogs, ...prev.doseLogs]
  };
}

/** بخش ۱۶ («تغییر Time Zone»): برخلاف نسخه‌ی قبلی (که فقط یک‌بار، بلافاصله
 *  بعد از migration، چک می‌شد و از آن به بعد تا ابد اجرا نمی‌شد چون به
 *  hasMigratedOccurrences وابسته بود که فقط یک‌بار در کل عمر اپ مقدارش
 *  عوض می‌شود)، این تابع از هر دو نقطه‌ی resume و تیک دوره‌ای sweep صدا زده
 *  می‌شود — یعنی تغییر واقعی تایم‌زون دستگاه (مثلاً وسط یک سفر) در طول یک
 *  سشن زنده هم تشخیص داده می‌شود، نه فقط در اولین اجرای تاریخ اپ.
 *  occurrenceهای pending آینده که regenerate می‌شوند، قبل از حذف از state
 *  باید notificationهای native‌شان هم cancel شود — وگرنه یک نوتیفیکیشن
 *  «یتیم» با ساعت تایم‌زون قدیمی همچنان در سیستم‌عامل شلیک می‌شود، درحالی‌که
 *  occurrence متناظرش دیگر در state وجود ندارد. */
function checkTimezoneChange(prev: AppState): { state: AppState; removedOccurrences: DoseOccurrence[] } {
  if (!prev.hasMigratedOccurrences) return { state: prev, removedOccurrences: [] };
  const currentTz = clockAdapter.currentTimeZoneId();
  if (!prev.lastKnownTimeZoneId) {
    return { state: { ...prev, lastKnownTimeZoneId: currentTz }, removedOccurrences: [] };
  }
  if (prev.lastKnownTimeZoneId === currentTz) {
    return { state: prev, removedOccurrences: [] };
  }

  const { toRemoveIds, toAdd } = occurrenceGenerator.regenerateFuturePendingOnTimezoneChange(prev.medications, prev.doseOccurrences, DEFAULT_HORIZON_DAYS);
  const removedOccurrences = prev.doseOccurrences.filter(o => toRemoveIds.includes(o.id));

  return {
    state: {
      ...prev,
      doseOccurrences: [...prev.doseOccurrences.filter(o => !toRemoveIds.includes(o.id)), ...toAdd],
      lastKnownTimeZoneId: currentTz
    },
    removedOccurrences
  };
}

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

  // Ask for notification permission early — covers the real scheduled dose-time
  // alerts and the three-reminder missed-dose escalation, both native via Capacitor.
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  // Bring the user back to the home tab with this medication's card in front —
  // used both by the in-app "later" flow and by tapping the reminder notification.
  const openReminderForMed = useCallback((medId: string) => {
    setState(prev => ({ ...prev, currentTab: 'today' }));
    setPriorityMedId(medId);
  }, []);

  // Tapping an actual scheduled dose-time notification (native) opens the app on
  // that exact medication's card, same as the in-app "نوبت بعدی" row.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const remove = await addNotificationTapListener((_occurrenceId, medId) => openReminderForMed(medId));
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
  }, [openReminderForMed]);

  // فاز ۱ سند طراحی — اسکریپت مهاجرت یک‌باره legacy→occurrence، فقط یک‌بار در
  // اولین باز شدن اپ بعد از آپدیت. idempotent — اجرای دوباره روی داده‌ای که
  // قبلاً hasMigratedOccurrences=true دارد، هیچ اثری ندارد.
  useEffect(() => {
    if (state.hasMigratedOccurrences) return;
    const { createdOccurrences } = runLegacyToOccurrenceMigration(state, clockAdapter);
    setState(prev => ({
      ...prev,
      doseOccurrences: [...prev.doseOccurrences, ...createdOccurrences],
      hasMigratedOccurrences: true,
      lastKnownTimeZoneId: clockAdapter.currentTimeZoneId()
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // فاز ۱ — بخش ۳ (Occurrence Generator): هر بار لیست داروها عوض می‌شود
  // (اضافه/ویرایش/حذف/toggle)، افق rolling برای occurrenceهای جدید کامل
  // می‌شود — idempotent، فقط occurrenceهای واقعاً جدید اضافه می‌شوند.
  useEffect(() => {
    if (!state.hasMigratedOccurrences) return;
    const created = occurrenceGenerator.ensureHorizonForAll(state.medications, state.doseOccurrences, DEFAULT_HORIZON_DAYS);
    if (created.length > 0) {
      setState(prev => ({ ...prev, doseOccurrences: [...prev.doseOccurrences, ...created] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.medications, state.hasMigratedOccurrences]);

  // بخش ۶ سند (NotificationEngine): با تغییر occurrenceها/داروها، هر
  // occurrence pending دقیقاً diff می‌شود (نه cancel-all + reschedule) و فقط
  // notificationIdهای واقعاً تغییرکرده در state ادغام می‌شوند.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updated = await syncOccurrenceNotifications(state.doseOccurrences, state.medications);
      if (cancelled || updated.length === 0) return;
      setState(prev => ({
        ...prev,
        doseOccurrences: prev.doseOccurrences.map(o => updated.find(u => u.id === o.id) || o)
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.doseOccurrences, state.medications]);

  // بخش ۱۶ (ریبوت گوشی / Force Stop کاهش‌اثر): به‌محض resume، افق را کامل و
  // sweepMissed را روی کل backlog اجرا می‌کنیم تا برنامه‌ی روز جدید فوراً
  // جایگزین شود و دوزهای ازدست‌رفته‌ی گذشته گم نشوند.
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const remove = await appLifecycleAdapter.onResume(() => {
        // بحرانی: محاسبه باید داخل خودِ functional updater روی prev واقعی
        // انجام شود، نه روی یک snapshot از پیش گرفته‌شده. اگر این
        // callback با یک effect دیگر (مثلاً migration در همان mount) در یک
        // batch هم‌زمان بشود، یک setState با «مقدار ثابتِ از‌قبل‌محاسبه‌شده»
        // (نه تابعی) می‌تواند نتیجه‌ی آن effect دیگر را کامل overwrite کند —
        // چون prev واقعی در لحظه‌ی اعمال را نادیده می‌گیرد. با محاسبه‌ی کامل
        // داخل «prev =>» تضمین می‌شود همیشه روی جدیدترین state واقعی اعمال شود.
        let sweptForNotifications: ReturnType<typeof resolverEngine.sweepMissed> = [];
        let tzRemovedForNotifications: DoseOccurrence[] = [];

        setState(prev => {
          const created = occurrenceGenerator.ensureHorizonForAll(prev.medications, prev.doseOccurrences, DEFAULT_HORIZON_DAYS);
          const sweepResults = resolverEngine.sweepMissed(prev.doseOccurrences, prev.medications);
          sweptForNotifications = sweepResults;
          const afterSweep = applySweepAndGeneration(prev, created, sweepResults);
          const tzResult = checkTimezoneChange(afterSweep);
          tzRemovedForNotifications = tzResult.removedOccurrences;
          return pruneOldData(tzResult.state);
        });

        sweptForNotifications.forEach(r => { cancelOccurrenceNotifications(r.occurrence); });
        tzRemovedForNotifications.forEach(o => { cancelOccurrenceNotifications(o); });
      });
      if (cancelled) {
        remove();
      } else {
        removeListener = remove;
      }
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // «بعداً» (status: 'snoozed').
  // بخش ۴ سند (ResolverEngine): تنها مسیر مجاز resolve/snooze یک occurrence.
  // «مصرف شد»/«بعداً» با occurrenceId می‌آید، نه medId+slotIndex (بخش ۱۳).
  // DoseLog قدیمی هنوز موازی نوشته می‌شود، اما فقط برای سازگاری Header.tsx
  // (بخش ۱۳ - خارج از دامنه‌ی این مهاجرت)؛ ReportsView دیگر از آن نمی‌خواند
  // (فاز ۵ - پاک‌سازی).
  const handleUpdateDoseStatus = (occurrenceId: string, status: 'taken' | 'snoozed') => {
    const occ = state.doseOccurrences.find(o => o.id === occurrenceId);
    const med = occ ? state.medications.find(m => m.id === occ.medId) : undefined;
    if (!occ || !med) return;

    if (status === 'snoozed') {
      const { occurrence: updated } = resolverEngine.snooze(occ);
      setState(prev => ({
        ...prev,
        doseOccurrences: prev.doseOccurrences.map(o => (o.id === updated.id ? updated : o))
      }));
      return;
    }

    const { occurrence: updated } = resolverEngine.resolve(occ, 'taken');
    const timeZoneId = clockAdapter.currentTimeZoneId();
    const newLog = occurrenceToLegacyDoseLog(updated, med, 'taken', timeZoneId);
    const updatedMeds = med.remainingCount > 0
      ? state.medications.map(m => (m.id === med.id ? { ...m, remainingCount: m.remainingCount - 1 } : m))
      : state.medications;

    setState(prev => ({
      ...prev,
      medications: updatedMeds,
      doseOccurrences: prev.doseOccurrences.map(o => (o.id === updated.id ? updated : o)),
      doseLogs: [newLog, ...prev.doseLogs]
    }));

    cancelOccurrenceNotifications(updated).then(withCancelled => {
      setState(prev => ({
        ...prev,
        doseOccurrences: prev.doseOccurrences.map(o => (o.id === withCancelled.id ? withCancelled : o))
      }));
    });
  };

  // بخش ۴ و ۱۶ (Missed): فقط ResolverEngine.sweepMissed مجاز به این
  // transition است — روی کل backlog pending اجرا می‌شود، نه فقط «امروز»
  // (رفع باگ «اگر گوشی چند روز بدون باز شدن اپ بماند، دوزهای گذشته هرگز
  // missed علامت نمی‌خورند»، چون occurrenceهای rolling از قبل در حافظه‌اند).
  // pruning (بخش ۱۵) هر ۳۰ ثانیه لازم نیست — فقط یک‌بار در روز کافی است؛ با
  // یک ref تاریخ محلیِ آخرین pruning را نگه می‌داریم تا سشن‌های طولانی‌مدت
  // (اپی که بدون بسته شدن روزها باز می‌ماند) هم پوشش داده شوند، نه فقط mount/resume.
  const lastPruneDateRef = useRef<string>(clockAdapter.localDateKey(clockAdapter.now(), clockAdapter.currentTimeZoneId()));

  useEffect(() => {
    const sweep = () => {
      // بحرانی: مثل resume، محاسبه باید داخل خودِ functional updater روی prev
      // واقعی انجام شود، نه روی یک snapshot از پیش گرفته‌شده. sweep() همیشه بلافاصله
      // در mount هم صدا زده می‌شود (خط پایین) — دقیقاً همان لحظه‌ای که effect
      // migration هم ممکن است هنوز نتیجه‌اش commit نشده باشد؛ یک setState با
      // مقدار ثابتِ از‌قبل‌محاسبه‌شده (نه تابعی) می‌توانست نتیجه‌ی migration
      // (ازجمله خودِ پرچم hasMigratedOccurrences) را completely overwrite کند.
      const todayKey = clockAdapter.localDateKey(clockAdapter.now(), clockAdapter.currentTimeZoneId());
      const shouldPrune = todayKey !== lastPruneDateRef.current;

      let sweptForNotifications: ReturnType<typeof resolverEngine.sweepMissed> = [];
      let tzRemovedForNotifications: DoseOccurrence[] = [];

      setState(prev => {
        const created = occurrenceGenerator.ensureHorizonForAll(prev.medications, prev.doseOccurrences, DEFAULT_HORIZON_DAYS);
        const sweepResults = resolverEngine.sweepMissed(prev.doseOccurrences, prev.medications);
        sweptForNotifications = sweepResults;
        const afterSweep = applySweepAndGeneration(prev, created, sweepResults);
        // بخش ۱۶ («تغییر Time Zone»): هر تیک sweep (هر ۳۰ ثانیه) هم چک می‌شود —
        // نه فقط mount/resume — تا تغییر واقعی تایم‌زون وسط یک سشن زنده و طولانی
        // هم به‌موقع تشخیص داده شود.
        const tzResult = checkTimezoneChange(afterSweep);
        tzRemovedForNotifications = tzResult.removedOccurrences;
        return shouldPrune ? pruneOldData(tzResult.state) : tzResult.state;
      });

      if (shouldPrune) lastPruneDateRef.current = todayKey;
      sweptForNotifications.forEach(r => { cancelOccurrenceNotifications(r.occurrence); });
      tzRemovedForNotifications.forEach(o => { cancelOccurrenceNotifications(o); });
    };

    sweep();
    const id = setInterval(sweep, SWEEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

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
    const occ = state.doseOccurrences.find(o => o.id === occurrenceId);
    const med = occ ? state.medications.find(m => m.id === occ.medId) : undefined;
    if (!occ || !med) return;

    const { occurrence: updated } = resolverEngine.resolve(occ, 'skipped', reason);
    const timeZoneId = clockAdapter.currentTimeZoneId();
    const newLog = occurrenceToLegacyDoseLog(updated, med, 'skipped', timeZoneId);

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
        : prev.medications,
      doseOccurrences: prev.doseOccurrences.map(o => (o.id === updated.id ? updated : o)),
      doseLogs: [newLog, ...prev.doseLogs]
    }));

    cancelOccurrenceNotifications(updated).then(withCancelled => {
      setState(prev => ({
        ...prev,
        doseOccurrences: prev.doseOccurrences.map(o => (o.id === withCancelled.id ? withCancelled : o))
      }));
    });
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

  // Filter medications for the app
  const profileMeds = state.medications;
  const profileLogs = state.doseLogs;
  const profileOccurrences = state.doseOccurrences;

  const activeMedsCount = profileMeds.filter(m => m.isActive).length;
  const takenCount = profileLogs.filter(l => l.status === 'taken').length;
  const totalLogs = profileLogs.length;
  const adherenceRate = totalLogs > 0 ? Math.round((takenCount / totalLogs) * 100) : 98;

  // Today's taken/remaining medication stats (used by the drawer's share action)
  // بخش ۱۶ (نیمه‌شب) — «امروز» فقط از ClockAdapter، نه toISOString خام.
  const todayStr = clockAdapter.localDateKey(clockAdapter.now(), clockAdapter.currentTimeZoneId());
  const todayLogs = profileLogs.filter(l => l.date === todayStr);
  const activeMedications = profileMeds.filter(m => m.isActive);
  const takenTodayCount = activeMedications.filter(m => todayLogs.some(l => l.medId === m.id && l.status === 'taken')).length;
  const totalTodayCount = activeMedications.length;
  const remainingTodayCount = Math.max(0, totalTodayCount - takenTodayCount);

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
      {/* Background Mesh Orbs for Frosted Glass Effect */}
      <div className="fixed top-[-100px] left-[-100px] w-80 h-80 bg-teal-300 dark:bg-teal-600/20 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl opacity-40 pointer-events-none z-0" />
      <div className="fixed bottom-[100px] right-[-50px] w-96 h-96 bg-blue-300 dark:bg-blue-600/20 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl opacity-40 pointer-events-none z-0" />
      <div className="fixed top-1/3 right-1/4 w-72 h-72 bg-emerald-200 dark:bg-emerald-600/10 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl opacity-30 pointer-events-none z-0" />

      {/* Top Header matching Image 1 */}
      <Header
        onOpenMenu={() => setIsMenuOpen(true)}
        medications={profileMeds}
        logs={profileLogs}
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
            medications={profileMeds.filter(m => m.isActive)}
            occurrences={profileOccurrences}
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
            occurrences={profileOccurrences}
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
