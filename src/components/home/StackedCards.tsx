import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Medication, DoseStatus, SkipReason } from '../../types';
import { toPersianNumbers } from '../../utils/persian';
import { HomeCard } from '../../application/HomeQueueService';
import { EscalationStep } from '../../domain/reminders/ReminderEngine';
import { Check, Clock, AlertTriangle, Pill, Droplet, Syringe, Pipette, Bandage, CheckCircle2, ClipboardList, X, Hourglass, ShieldAlert, Ban, MoonStar, ChevronLeft, ChevronRight, Hand } from 'lucide-react';
import { MedicationSkipSheet } from './MedicationSkipSheet';

/**
 * تیکه ۱۰ — DESIGN.md بخش ۱۷ (Home Presentation Layer).
 *
 * این کامپوننت دیگر **هیچ منطق زمان‌بندی‌ای ندارد**. سه چیزی که قبلاً اینجا
 * بود و حذف شد:
 *
 * ۱. `allInstances`/`todayStr` — ساختِ «وعده‌های امروز» از روی
 *    `medicationTimeSlots(m)` + `new Date().toISOString().split('T')[0]`.
 *    این هم باگ نیمه‌شب داشت (تاریخ از UTC) و هم `selectedDays`/`monthDay` را
 *    نادیده می‌گرفت (باگ زنده‌ی بخش ۰). حالا صفِ کارت‌ها آماده از
 *    `HomeQueueService.homeCards(now)` می‌آید — همان منبع واحدی که بخش ۱۷.۲
 *    و ۱۷.۶ می‌خواهند.
 * ۲. **ژست جهت‌دار** (بالا = مصرف شد، پایین = بعداً) — بخش ۱۷.۱. جابجایی
 *    افقی حالا فقط «ورق‌زدن» صف است و هیچ معنای عملیاتی ندارد؛ دو عملیات
 *    واقعی فقط با دو دکمه‌ی صریح روی کارت انجام می‌شوند.
 * ۳. **تایمر شمارش‌معکوس** (`setInterval` هر ۴ ثانیه + متن «X دقیقه تا پایان
 *    فرصت») — بخش ۱۷.۵. جایش یک نشانه‌ی وضعیت گرفته که فقط با عبور از یک
 *    پله‌ی escalation عوض می‌شود؛ زمان‌بندیِ آن رندر دوباره را `App.tsx` با
 *    یک `setTimeout` تکی روی `HomeQueueService.nextTransitionAt` انجام می‌دهد،
 *    نه این کامپوننت.
 */
interface StackedCardsProps {
  /** صف دیدنی (حداکثر ۵ تا) — خروجی `HomeQueueService.homeCards(now)`. */
  cards: HomeCard[];
  /** دوزهای مصرف‌شده‌ی امروز — پشته‌ی محوشده‌ی پایین. */
  takenCards: HomeCard[];
  /** آمار امروز، از `HomeQueueService.todaySummary(now)`. */
  totalToday: number;
  resolvedToday: number;
  /**
   * فقط برای فیلدهای *نمایشی* (نام، دوز، عکس، دستور، موجودی).
   *
   * چرا هنوز مدل legacy: تا تیکه ۱۲ (فرم‌ها)، `AddMedicationWizard` همچنان
   * `Medication` قدیمی می‌نویسد و `MedicationAggregate` فقط یک آینه‌ی
   * همگام‌شده از آن است. تکیه بر legacy برای نمایش یعنی هر ویرایشی فوراً روی
   * کارت دیده می‌شود، بدون وابستگی به چرخه‌ی sync. در تیکه ۱۲ این prop حذف
   * می‌شود و `HomeCard` خودش فیلدهای نمایشی را از Aggregate حمل می‌کند.
   */
  medications: Medication[];
  onUpdateStatus: (occurrenceId: string, status: DoseStatus) => void;
  onSkipDose?: (occurrenceId: string, reason: SkipReason) => void;
  onRequestEditReminderTime?: (medId: string) => void;
  userName?: string;
  /** با تپ روی نوتیفیکیشن ست می‌شود — کارت همان دارو را جلوی صف می‌آورد. */
  priorityMedId?: string | null;
  onConsumePriority?: () => void;
  /** آموزش یک‌باره‌ی کارت‌ها (نام prop از قبل در AppState هست، دست‌نخورده مانده
   *  — ولی محتوایش دیگر ژست جهت‌دار را آموزش نمی‌دهد، بخش ۱۷.۱). */
  showGestureTutorial?: boolean;
  onDismissGestureTutorial?: () => void;
}

const formIcon = (form: Medication['form']): React.ElementType => {
  switch (form) {
    case 'قرص': return Pill;
    case 'شربت': return Droplet;
    case 'آمپول': return Syringe;
    case 'قطره': return Pipette;
    case 'پماد': return Bandage;
    default: return Pill;
  }
};

// دوز شربت به شکل «۵ میلی‌لیتر(cc) - ۱ قاشق مرباخوری» ذخیره می‌شود — دو تکه
// می‌شود تا مقدار اصلی بزرگ و معادلش ریز زیرش بیاید.
const splitDoseText = (dose: string): { main: string; sub?: string } => {
  const sep = ' - ';
  const idx = dose.indexOf(sep);
  if (idx === -1) return { main: dose };
  return { main: dose.slice(0, idx), sub: dose.slice(idx + sep.length) };
};

const formatTime = (t: { hour: number; minute: number }): string =>
  toPersianNumbers(`${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`);

/**
 * بخش ۱۷.۵ — به‌جای شمارش‌معکوس، فقط یک نشانه‌ی وضعیت که با عبور از هر پله‌ی
 * escalation عوض می‌شود. سه لایه‌ی رنگ در بخش ۱۷.۴ صریحاً «مستقل از هم» و
 * «قابل ترکیب» تعریف شده‌اند، پس اینجا هم جدا نگه داشته شده‌اند:
 *   • رنگ پس‌زمینه/حاشیه  <- پله‌ی escalation (همین جدول)
 *   • حلقه‌ی بنفشِ «بعداً»  <- snoozeCount > 0 (پایین‌تر، جدا)
 */
const STEP_STYLE: Record<EscalationStep, { frame: string; label: string; note?: string; tone: string }> = {
  0: {
    frame: 'bg-gradient-to-br from-teal-200/40 via-emerald-100/35 to-cyan-100/40 dark:from-teal-800/25 dark:via-emerald-900/20 dark:to-slate-800/40 border-white/70 dark:border-white/10',
    label: 'نوبت فعلی',
    tone: 'text-teal-700 dark:text-teal-300'
  },
  1: {
    frame: 'bg-gradient-to-br from-amber-200/40 via-amber-100/30 to-orange-100/40 dark:from-amber-700/25 dark:via-amber-800/20 dark:to-amber-900/20 border-amber-300/60 dark:border-amber-700/40',
    label: 'یادآور اول گذشت',
    note: 'وقت مصرف این نوبت رسیده',
    tone: 'text-amber-700 dark:text-amber-300'
  },
  2: {
    frame: 'bg-gradient-to-br from-orange-200/45 via-orange-100/35 to-rose-100/40 dark:from-orange-700/25 dark:via-orange-800/20 dark:to-rose-900/20 border-orange-300/70 dark:border-orange-700/40',
    label: 'یادآور دوم گذشت',
    note: 'به پایان فرصت مصرف نزدیک شده‌اید',
    tone: 'text-orange-700 dark:text-orange-300'
  },
  3: {
    frame: 'bg-gradient-to-br from-rose-200/45 via-rose-100/35 to-red-100/40 dark:from-rose-800/30 dark:via-rose-900/20 dark:to-slate-800/40 border-rose-300/70 dark:border-rose-700/50',
    label: 'فرصت مصرف تمام شده',
    note: 'مهلت این نوبت گذشته — اگر هنوز مصرف نکرده‌اید با پزشک هماهنگ کنید',
    tone: 'text-rose-700 dark:text-rose-300'
  }
};

export const StackedCards: React.FC<StackedCardsProps> = ({
  cards,
  takenCards,
  totalToday,
  resolvedToday,
  medications,
  onUpdateStatus,
  onSkipDose,
  onRequestEditReminderTime,
  userName,
  priorityMedId,
  onConsumePriority,
  showGestureTutorial,
  onDismissGestureTutorial
}) => {
  const medById = useMemo(() => new Map(medications.map(m => [m.id, m])), [medications]);

  // Coverflow صرفاً یک لایه‌ی بصری است. `cards[0]` همیشه occurrence واقعیِ
  // صف و تنها کارت عملیاتی است؛ dragDelta هیچ‌وقت آن را عوض نمی‌کند.
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = React.useRef(0);
  const PX_PER_SLOT = 130;

  const visualDeck = useMemo(() => {
    // کارت‌های مصرف‌شده سمت چپ/پشت قرار می‌گیرند، کارت‌های pending از مرکز
    // به سمت راست. همه‌ی آیتم‌ها در یک فضای مجازی مشترک حرکت می‌کنند.
    return [
      ...takenCards.slice().reverse().map(card => ({ card, baseSlot: -(takenCards.indexOf(card) + 1) })),
      ...cards.map((card, index) => ({ card, baseSlot: index }))
    ];
  }, [cards, takenCards]);

  const activeCard = cards[0];
  const activeMed = activeCard ? medById.get(activeCard.medicationId) : undefined;
  const activeDoseParts = activeMed ? splitDoseText(activeMed.dose) : { main: '', sub: undefined as string | undefined };
  const activeStyle = STEP_STYLE[activeCard?.escalationStep ?? 0];

  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    setIsDragging(true);
    startXRef.current = 'touches' in e ? e.touches[0].clientX : e.clientX;
  };
  const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDragDelta(clientX - startXRef.current);
  };
  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    setDragDelta(0);
  };

  const [showSkipSheet, setShowSkipSheet] = useState(false);
  const [skipToast, setSkipToast] = useState<string | null>(null);

  useEffect(() => {
    if (!skipToast) return;
    const id = setTimeout(() => setSkipToast(null), 6000);
    return () => clearTimeout(id);
  }, [skipToast]);

  const handleAction = (status: 'taken' | 'snoozed') => {
    if (!activeCard) return;
    onUpdateStatus(activeCard.occurrence.id, status);
  };

  // هنوز هیچ دارویی ثبت نشده — با «همه‌ی نوبت‌های امروز انجام شد» فرق دارد.
  if (medications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-teal-500 to-emerald-400 rounded-3xl flex items-center justify-center shadow-xl shadow-emerald-500/20 mb-6">
          <ClipboardList className="w-12 h-12 sm:w-14 sm:h-14 text-white" strokeWidth={2.25} />
        </div>
        <h2 className="font-black text-slate-800 dark:text-slate-100 mb-2 text-xl sm:text-2xl">
          هنوز دارویی ثبت نکرده‌اید
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm text-sm sm:text-base">
          داروهای خود را در برنامه ثبت کنید و مصرف روزانهٔ آن‌ها را از همین پنل مدیریت کنید.
        </p>
      </div>
    );
  }

  if (cards.length === 0) {
    // دو حالت کاملاً متفاوت که در نسخه‌ی قبلی به هم چسبیده بودند: «همه‌چیز
    // انجام شد» و «هنوز وقتِ هیچ نوبتی نرسیده». حالت دوم مستقیماً نتیجه‌ی
    // پنجره‌ی فعال‌سازی بخش ۱۷.۲ است (occurrenceها ساخته شده‌اند و
    // نوتیفیکیشنشان هم زمان‌بندی شده — فقط هنوز از دید UI پنهان‌اند).
    const allDone = totalToday > 0 && resolvedToday >= totalToday;
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-teal-500 to-emerald-400 rounded-3xl flex items-center justify-center shadow-xl shadow-emerald-500/20 mb-6">
          {allDone
            ? <CheckCircle2 className="w-12 h-12 sm:w-14 sm:h-14 text-white" strokeWidth={2.5} />
            : <Hourglass className="w-12 h-12 sm:w-14 sm:h-14 text-white" strokeWidth={2.25} />}
        </div>
        <h2 className="font-black text-slate-800 dark:text-slate-100 mb-2 text-xl sm:text-2xl">
          {allDone ? 'همه داروهای امروز رو مصرف کردید' : 'الان نوبتی برای مصرف ندارید'}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm text-sm sm:text-base">
          {allDone
            ? `شما امروز به ${toPersianNumbers(totalToday)} از ${toPersianNumbers(totalToday)} برنامه دارویی خود پایبند بودید. سلامت و شاداب باشید.`
            : 'نوبت بعدی نزدیک وقتش همین‌جا ظاهر می‌شود و یادآوری‌اش هم سر وقت می‌آید — لازم نیست برنامه را باز نگه دارید.'}
        </p>
        {!allDone && totalToday > 0 && (
          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold mt-3">
            تا الان {toPersianNumbers(resolvedToday)} از {toPersianNumbers(totalToday)} نوبت امروز ثبت شده
          </p>
        )}
      </div>
    );
  }

  const showTutorial = !!showGestureTutorial && !!activeMed;

  return (
    <>
      {showTutorial && (
        <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center px-6 animate-in fade-in duration-200">
          <div className="flex flex-col items-center gap-2 mb-8 text-white">
            <Hand className="w-10 h-10 text-teal-300" strokeWidth={2.25} />
            <p className="font-black text-sm sm:text-base text-center max-w-xs">
              کارت‌ها را با کشیدن چپ و راست ورق بزنید — این حرکت هیچ چیزی را ثبت نمی‌کند
            </p>
          </div>

          <div className="w-full max-w-xs h-32 rounded-[32px] border-2 border-dashed border-white/40 flex items-center justify-center text-white/50 text-xs font-bold">
            کارت دارو
          </div>

          <div className="flex flex-col items-center gap-2 mt-8 mb-6 text-white">
            <div className="flex items-center gap-2">
              <Check className="w-7 h-7 text-emerald-400" strokeWidth={2.5} />
              <Clock className="w-7 h-7 text-amber-400" strokeWidth={2.5} />
            </div>
            <p className="font-black text-sm sm:text-base text-center max-w-xs">
              ثبت مصرف و «بعداً» فقط با دو دکمه‌ی پایین کارت انجام می‌شود
            </p>
          </div>

          <div className="flex flex-col items-center gap-2 mb-8 text-white">
            <Ban className="w-8 h-8 text-slate-300" strokeWidth={2.5} />
            <p className="font-black text-sm sm:text-base text-center max-w-xs">
              دکمه‌ی کوچک بالای هر کارت یعنی «مصرف نکردم» — با زدنش دلیلش را انتخاب می‌کنید
            </p>
          </div>

          <button
            type="button"
            onClick={onDismissGestureTutorial}
            className="flex items-center gap-2 px-6 py-3 bg-white text-slate-800 rounded-2xl font-black text-sm shadow-xl hover:scale-105 active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
            متوجه شدم
          </button>
        </div>
      )}

    <div className="w-full flex flex-col items-center py-2 px-2 select-none">
      <div className="w-full max-w-md flex flex-col items-center text-center mb-5 sm:mb-7 relative">
        <h2 className="font-black text-slate-800 dark:text-slate-100 text-lg sm:text-xl">
          سلام {userName?.trim() || 'کاربر داروتو'} 👋
        </h2>
        <p className="text-slate-600 dark:text-slate-300 font-bold mt-1 text-sm sm:text-base">
          امروز {toPersianNumbers(totalToday)} نوبت مصرف داری
        </p>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
          تا الان {toPersianNumbers(resolvedToday)} از {toPersianNumbers(totalToday)} نوبت ثبت شده ✅
        </p>
      </div>

      <div className="relative w-full max-w-md h-[480px] sm:h-[520px] flex items-center justify-center my-2 sm:my-4 overflow-visible">

        {visualDeck.map(({ card, baseSlot }) => {
          const distance = baseSlot + dragDelta / PX_PER_SLOT;
          const abs = Math.abs(distance);
          if (abs > 4) return null;
          const med = medById.get(card.medicationId);
          if (!med) return null;
          const Icon = formIcon(med.form);
          const isFront = card.occurrence.id === activeCard?.occurrence.id;
          const style = {
            transform: `translate(-50%, calc(-50% + ${distance * 34}px)) scale(${Math.max(0.72, 1 - abs * 0.055)})`,
            opacity: Math.max(0.3, 1 - abs * 0.16),
            zIndex: Math.round(50 - abs * 5),
            transition: isDragging ? 'none' : 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease-out'
          } as React.CSSProperties;
          if (!isFront) return (
            <div key={card.occurrence.id} className="absolute left-1/2 top-1/2 w-[92%] pointer-events-none" style={style}>
              <div className="h-[360px] rounded-[36px] bg-white/75 dark:bg-slate-800/75 border border-white/60 dark:border-slate-700/50 shadow-lg p-5 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/80 flex items-center justify-center text-white"><Icon className="w-6 h-6" /></div>
                <span className="font-black text-slate-700 dark:text-slate-200">{med.name}</span>
                <span className="text-xs font-bold text-slate-400">{formatTime(card.timeOfDay)}</span>
              </div>
            </div>
          );
          return (
            <div key={card.occurrence.id} className="absolute left-1/2 top-1/2 w-full px-2 cursor-grab active:cursor-grabbing" style={style} onMouseDown={handleDragStart} onMouseMove={handleDragMove} onMouseUp={handleDragEnd} onMouseLeave={handleDragEnd} onTouchStart={handleDragStart} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd}>
              <div className={`relative h-[380px] sm:h-[410px] rounded-[40px] border p-6 flex flex-col justify-between overflow-hidden ${activeStyle.frame} ${card.isSnoozed ? 'ring-2 ring-violet-400/70 ring-offset-2' : ''}`}>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="flex items-center justify-between gap-2 mb-4"><div className="flex items-center gap-3 min-w-0"><div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center text-white shrink-0"><Icon className="w-6 h-6" /></div><div><span className={`text-[11px] font-bold ${activeStyle.tone}`}>{activeStyle.label}</span><h3 className="font-black text-slate-900 dark:text-white text-lg truncate">{med.name}</h3></div></div><button type="button" onClick={(e) => { e.stopPropagation(); setShowSkipSheet(true); }} className="w-9 h-9 rounded-full bg-white/70 text-slate-500 flex items-center justify-center"><Ban className="w-4 h-4" /></button></div>
                  {card.isSnoozed && <div className="mb-2 rounded-xl bg-violet-50 dark:bg-violet-950/50 px-3 py-2 text-xs font-bold text-violet-700">این نوبت «بعداً» شده</div>}
                  {!card.isExempt && activeStyle.note && <div className="mb-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-slate-700"><Hourglass className="inline w-3.5 h-3.5 ml-1" />{activeStyle.note}</div>}
                  {card.isCritical && <div className="mb-2 rounded-xl bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700"><ShieldAlert className="inline w-3.5 h-3.5 ml-1" />داروی حساس</div>}
                  <div className="space-y-2.5"><div className="flex items-center justify-between bg-white/70 rounded-2xl px-4 py-3"><span className="text-xs font-bold text-slate-500"><Clock className="inline w-4 h-4 ml-1" />زمان مصرف</span><b>ساعت {formatTime(card.timeOfDay)}</b></div><div className="flex items-center justify-between bg-white/70 rounded-2xl px-4 py-3"><span className="text-xs font-bold text-slate-500"><Pill className="inline w-4 h-4 ml-1" />مقدار</span><b>{toPersianNumbers(activeDoseParts.main)}</b></div>{med.instructions && <p className="text-xs text-slate-600 truncate">دستور: {med.instructions}</p>}</div>
                </div>
                <div className="flex shrink-0 gap-2.5 pt-2"><button onClick={() => handleAction('snoozed')} className="w-1/3 rounded-2xl py-3.5 bg-amber-50 text-amber-800 font-bold"><Clock className="inline w-4 h-4 ml-1" />بعداً</button><button onClick={() => handleAction('taken')} className="w-2/3 rounded-2xl py-3.5 bg-teal-500 text-white font-black"><Check className="inline w-5 h-5 ml-1" />مصرف شد</button></div>
              </div>
            </div>
          );
        })}
      </div>

      {skipToast && createPortal(
        <div className="fixed inset-x-0 z-[85] flex justify-center px-4 mb-[calc(6.75rem+env(safe-area-inset-bottom))] bottom-0 animate-in fade-in duration-200 pointer-events-none">
          <div className="max-w-sm w-full bg-slate-900/95 dark:bg-slate-800/95 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-2.5 backdrop-blur-xl border border-white/10 pointer-events-auto">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm font-bold leading-relaxed flex-1">{skipToast}</p>
            <button type="button" onClick={() => setSkipToast(null)} className="text-white/50 hover:text-white shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>

    <MedicationSkipSheet
      open={showSkipSheet && !!activeMed}
      medName={activeMed?.name || ''}
      occurrenceId={activeCard?.occurrence.id ?? ''}
      onClose={() => setShowSkipSheet(false)}
      onConfirmTiming={(id, reason) => confirmSkip(reason, undefined, id)}
      onConfirmSideEffects={(id, reason) => confirmSkip(reason, 'این دارو از چرخه یادآوری خارج شد.', id)}
      onConfirmDoctorAdvice={(id, reason) => confirmSkip(reason, 'این دارو از چرخه یادآوری خارج شد.', id)}
      onConfirmOutOfStock={(id, reason) => confirmSkip(reason, 'دارو به وضعیت «در انتظار تهیه» منتقل شد و تا زمان تهیه مجدد، یادآوری‌های آن متوقف می‌شود. پس از تهیه مجدد، از بخش «دارو» وضعیت آن را دوباره «فعال» کنید تا یادآوری‌ها از سر گرفته شوند.', id)}
    />
    </>
  );
};
