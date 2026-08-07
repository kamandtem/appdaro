import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Medication, DoseOccurrence, SkipReason } from '../../types';
import { toPersianNumbers } from '../../utils/persian';
import { isExemptFromDeadlineSystem, isCriticalSafetyMed } from '../../domain/rules/RuleEngine';
import { clockAdapter } from '../../adapters/ClockAdapter';
import { OccurrenceQueryService } from '../../application/OccurrenceQueryService';
import { HomeQueueService } from '../../application/HomeQueueService';
import { DoseOccurrenceRepository } from '../../repository/DoseOccurrenceRepository';
import { Check, Clock, AlertTriangle, Pill, Droplet, Syringe, Pipette, Bandage, CheckCircle2, ClipboardList, X, Hourglass, ShieldAlert, Ban } from 'lucide-react';
import { MedicationSkipSheet } from './MedicationSkipSheet';

interface StackedCardsProps {
  medications: Medication[];
  /** occurrenceهای افق فعلی (بخش ۸/۱۷.۲) — پنل خانه دیگر خودش «امروز چیست»
   *  را با toISOString حساب نمی‌کند، فقط از HomeQueueService.visibleCards
   *  می‌خواند. */
  occurrences: DoseOccurrence[];
  /** «مصرف شد» / «بعداً» — با occurrenceId، نه medId+slotIndex (بخش ۱۳). */
  onUpdateStatus: (occurrenceId: string, status: 'taken' | 'snoozed') => void;
  userName?: string;
  priorityMedId?: string | null;
  onConsumePriority?: () => void;
  showGestureTutorial?: boolean;
  onDismissGestureTutorial?: () => void;
  onSkipDose?: (occurrenceId: string, reason: SkipReason) => void;
  onRequestEditReminderTime?: (medId: string) => void;
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

const splitDoseText = (dose: string): { main: string; sub?: string } => {
  const sep = ' - ';
  const idx = dose.indexOf(sep);
  if (idx === -1) return { main: dose };
  return { main: dose.slice(0, idx), sub: dose.slice(idx + sep.length) };
};

const timeLabel = (occ: DoseOccurrence): string => {
  const d = new Date(occ.scheduledAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const StackedCards: React.FC<StackedCardsProps> = ({
  medications,
  occurrences,
  onUpdateStatus,
  userName,
  priorityMedId,
  onConsumePriority,
  showGestureTutorial,
  onDismissGestureTutorial,
  onSkipDose,
  onRequestEditReminderTime
}) => {
  // بخش ۱۷.۵ — بدون setInterval شمارش‌معکوس: کارت فقط وقتی از یک پله‌ی
  // escalation به پله‌ی بعد رد می‌شویم رنگ عوض می‌کند، نه هر چند ثانیه. یک
  // تیک نسبتاً کند (۶۰ ثانیه) فقط برای اینکه گذر پله وقتی کاربر دستش را از
  // روی گوشی برنداشته هم دیده شود — نه یک شمارش‌معکوس زنده.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const queryService = useMemo(() => new OccurrenceQueryService(new DoseOccurrenceRepository(occurrences), clockAdapter), [occurrences]);
  const homeQueueService = useMemo(() => new HomeQueueService(queryService, clockAdapter), [queryService]);
  const medById = useMemo(() => new Map(medications.map(m => [m.id, m])), [medications]);

  // بخش ۱۷.۲ — تنها منبع «کدام کارت‌ها الان دیده شوند»؛ حداکثر ۵ تا،
  // صرف‌نظر از اینکه چند occurrence دیگر در پس‌زمینه در حال انتظارند.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => homeQueueService.visibleCards(occurrences, medications), [homeQueueService, occurrences, medications, nowTick]);

  const totalCount = medications.filter(m => m.isActive).length;
  const completedCount = occurrences.filter(o => o.status === 'taken' || o.status === 'skipped').length;
  const takenList = occurrences.filter(o => o.status === 'taken').slice(0, 4);

  let orderedVisible = [...visible];
  if (priorityMedId) {
    const idx = orderedVisible.findIndex(o => o.medId === priorityMedId);
    if (idx > 0) {
      const [pm] = orderedVisible.splice(idx, 1);
      orderedVisible.unshift(pm);
    }
  }

  useEffect(() => {
    if (priorityMedId) {
      onConsumePriority?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorityMedId]);

  // بخش ۱۷.۱ — بدون معنای عملیاتی: فقط یک حرکت نرم برای مرور کارت (شبیه
  // ورق‌زدن)؛ رها کردن انگشت همیشه کارت را به جای اولش برمی‌گرداند. عملیات
  // واقعی («مصرف شد»/«بعداً») فقط از دو دکمه‌ی صریح روی کارت انجام می‌شود.
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);

  const [showSkipSheet, setShowSkipSheet] = useState(false);
  const [skipToast, setSkipToast] = useState<string | null>(null);

  useEffect(() => {
    if (!skipToast) return;
    const id = setTimeout(() => setSkipToast(null), 6000);
    return () => clearTimeout(id);
  }, [skipToast]);

  const activeOccurrence = orderedVisible[0];
  const activeMed = activeOccurrence ? medById.get(activeOccurrence.medId) : undefined;
  const activeDoseParts = activeMed ? splitDoseText(activeMed.dose) : { main: '', sub: undefined as string | undefined };
  const activeIsSnoozed = activeOccurrence ? activeOccurrence.snoozeCount > 0 : false;
  const activeStep = activeOccurrence ? queryService.escalationStep(activeOccurrence, activeMed) : 0;

  const activeDeadlineInfo = React.useMemo(() => {
    if (!activeOccurrence || !activeMed || isExemptFromDeadlineSystem(activeMed)) return null;
    const msLeft = new Date(activeOccurrence.deadlineAt).getTime() - nowTick;
    if (msLeft <= 0) return null;
    const minutesLeft = Math.round(msLeft / 60000);
    if (minutesLeft < 60) {
      return `${toPersianNumbers(minutesLeft)} دقیقه تا پایان فرصت مصرف باقی مانده`;
    }
    const hoursLeft = Math.round(minutesLeft / 60);
    return `${toPersianNumbers(hoursLeft)} ساعت تا پایان فرصت مصرف باقی مانده`;
  }, [activeOccurrence, activeMed, nowTick]);

  const activeCriticalNotice = React.useMemo(() => {
    if (!activeMed || !isCriticalSafetyMed(activeMed)) return null;
    if (!activeOccurrence) return null;
    if (nowTick < new Date(activeOccurrence.scheduledAt).getTime()) return null;
    return 'این دارو حساسه — اگه هنوز مصرف نشده، طبق دستور پزشک یا برنامه‌ی شخصی‌ات بررسی‌اش کن';
  }, [activeMed, activeOccurrence, nowTick]);

  const handleAction = (status: 'taken' | 'snoozed') => {
    if (!activeOccurrence) return;
    onUpdateStatus(activeOccurrence.id, status);
    setDragOffset(0);
  };

  const handleConfirmTiming = () => {
    if (activeOccurrence) {
      onSkipDose?.(activeOccurrence.id, 'timing');
      onRequestEditReminderTime?.(activeOccurrence.medId);
    }
    setShowSkipSheet(false);
  };

  const handleConfirmSideEffects = () => {
    if (activeOccurrence) onSkipDose?.(activeOccurrence.id, 'side_effects');
    setShowSkipSheet(false);
    setSkipToast('این دارو از چرخه یادآوری خارج شد.');
  };

  const handleConfirmDoctorAdvice = () => {
    if (activeOccurrence) onSkipDose?.(activeOccurrence.id, 'doctor_advice');
    setShowSkipSheet(false);
    setSkipToast('این دارو از چرخه یادآوری خارج شد.');
  };

  const handleConfirmOutOfStock = () => {
    if (activeOccurrence) onSkipDose?.(activeOccurrence.id, 'out_of_stock');
    setShowSkipSheet(false);
    setSkipToast('دارو به وضعیت «در انتظار تهیه» منتقل شد و تا زمان تهیه مجدد، یادآوری‌های آن متوقف می‌شود. پس از تهیه مجدد، از بخش «دارو» وضعیت آن را دوباره «فعال» کنید تا یادآوری‌ها از سر گرفته شوند.');
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    setIsDragging(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setStartY(clientY);
  };
  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging) return;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragOffset((clientY - startY) * 0.35); // حرکت میراشده — فقط بازخورد بصری، بدون آستانه‌ی عملیاتی (بخش ۱۷.۱)
  };
  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragOffset(0);
  };

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

  if (orderedVisible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-teal-500 to-emerald-400 rounded-3xl flex items-center justify-center shadow-xl shadow-emerald-500/20 mb-6">
          <CheckCircle2 className="w-12 h-12 sm:w-14 sm:h-14 text-white" strokeWidth={2.5} />
        </div>
        <h2 className="font-black text-slate-800 dark:text-slate-100 mb-2 text-xl sm:text-2xl">
          همه داروهای امروز رو مصرف کردید
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm text-sm sm:text-base">
          شما امروز به {toPersianNumbers(totalCount)} از {toPersianNumbers(totalCount)} برنامه دارویی خود پایبند بودید. سلامت و شاداب باشید.
        </p>
      </div>
    );
  }

  const showTutorial = !!showGestureTutorial && !!activeMed;

  return (
    <>
      {showTutorial && (
        <div className="fixed inset-0 z-[90] bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-6 text-center animate-in fade-in duration-300">
          <div className="text-white">
            <p className="text-lg sm:text-xl font-black mb-2">با دو دکمه‌ی روی کارت کارتو مدیریت کن</p>
            <p className="text-sm sm:text-base text-white/80 max-w-xs mx-auto">
              «مصرف شد» و «بعداً» — کارت‌ها را می‌توانی نرم ورق بزنی، اقدام همیشه از همین دو دکمه است.
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
          امروز {toPersianNumbers(totalCount)} دارو داری
        </p>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
          تا الان {toPersianNumbers(completedCount)} نوبت مصرف شده ✅
        </p>
      </div>

      <div className="relative w-full max-w-md h-[480px] sm:h-[520px] flex items-center justify-center my-2 sm:my-4 overflow-visible">

        {orderedVisible.slice(1, 4).map((occ, idx) => {
          const i = idx + 1;
          const scale = 1 - i * 0.055;
          const widthPct = 100 - i * 7;
          const offsetPx = i * 34;
          const opacity = Math.max(0.55, 1 - i * 0.16);
          const zIndex = 39 - i;
          const med = medById.get(occ.medId);
          if (!med) return null;

          return (
            <div
              key={occ.id}
              className="absolute left-1/2 top-1/2 transition-all duration-300 ease-out pointer-events-none"
              style={{
                width: `${widthPct}%`,
                transform: `translate(-50%, calc(-50% - ${offsetPx}px)) scale(${scale})`,
                opacity,
                zIndex
              }}
            >
              <div className="w-full h-[380px] sm:h-[410px] rounded-[40px] bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-white/60 dark:border-slate-700/40 shadow-lg p-5 flex flex-col items-center justify-start gap-2 text-center pt-6">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-400/70 to-emerald-300/70 flex items-center justify-center shadow-sm shrink-0 text-white">
                  {(() => {
                    const Icon = formIcon(med.form);
                    return <Icon className="w-5 h-5" strokeWidth={2.25} />;
                  })()}
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-slate-700 dark:text-slate-200 text-xs sm:text-sm truncate block">{med.name}</span>
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-500">ساعت {toPersianNumbers(timeLabel(occ))}</span>
                </div>
              </div>
            </div>
          );
        })}

        {takenList.map((occ, idx) => {
          const i = idx + 1;
          const scale = 1 - i * 0.055;
          const widthPct = 100 - i * 7;
          const offsetPx = i * 34;
          const opacity = Math.max(0.55, 0.85 - i * 0.14);
          const zIndex = 39 - i;
          const med = medById.get(occ.medId);
          if (!med) return null;

          return (
            <div
              key={occ.id}
              className="absolute left-1/2 top-1/2 transition-all duration-300 ease-out pointer-events-none"
              style={{
                width: `${widthPct}%`,
                transform: `translate(-50%, calc(-50% + ${offsetPx}px)) scale(${scale})`,
                opacity,
                filter: 'grayscale(25%)',
                zIndex
              }}
            >
              <div className="relative w-full h-[380px] sm:h-[410px] rounded-[40px] bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-emerald-200/50 dark:border-emerald-800/30 shadow-lg p-5 flex flex-col items-center justify-end gap-2 text-center pb-6">
                <div className="absolute top-4 left-4 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                  <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                </div>
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-400/70 to-teal-300/70 flex items-center justify-center shadow-sm shrink-0 text-white">
                  {(() => {
                    const Icon = formIcon(med.form);
                    return <Icon className="w-5 h-5" strokeWidth={2.25} />;
                  })()}
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-slate-700 dark:text-slate-200 text-xs sm:text-sm truncate block">{med.name}</span>
                  <span className="text-[10px] sm:text-[11px] font-bold text-emerald-500/80 dark:text-emerald-400/70">مصرف شد</span>
                </div>
              </div>
            </div>
          );
        })}

        {activeMed && activeOccurrence && (
          <div
            className="absolute w-full px-2 z-40 cursor-grab active:cursor-grabbing transition-transform duration-150"
            style={{
              transform: `translateY(${dragOffset}px) scale(${1 - Math.min(Math.abs(dragOffset), 200) / 2000})`,
              opacity: Math.max(0.7, 1 - Math.abs(dragOffset) / 600)
            }}
            onMouseDown={handleTouchStart}
            onMouseMove={handleTouchMove}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className={`relative w-full h-[380px] sm:h-[410px] rounded-[40px] backdrop-blur-2xl border p-6 sm:p-7 flex flex-col justify-between overflow-hidden transition-colors duration-200 ${
                activeStep >= 2
                  ? 'bg-gradient-to-br from-rose-200/40 via-orange-100/30 to-rose-100/40 dark:from-rose-800/25 dark:via-rose-900/20 dark:to-rose-950/20 border-rose-300/60 dark:border-rose-700/40'
                  : activeIsSnoozed
                  ? 'bg-gradient-to-br from-amber-200/40 via-orange-100/30 to-amber-100/40 dark:from-amber-700/25 dark:via-amber-800/20 dark:to-amber-900/20 border-amber-300/60 dark:border-amber-700/40'
                  : 'bg-gradient-to-br from-teal-200/40 via-emerald-100/35 to-cyan-100/40 dark:from-teal-800/25 dark:via-emerald-900/20 dark:to-slate-800/40 border-white/70 dark:border-white/10'
              }`}
              style={{ boxShadow: '0 30px 60px -20px rgba(13, 148, 136, 0.35)' }}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {activeMed.photoUrl ? (
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/80 dark:border-teal-700 shadow-md shrink-0 bg-slate-100 dark:bg-slate-800">
                        <img src={activeMed.photoUrl} alt={activeMed.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center shadow-md text-white shrink-0">
                        {(() => {
                          const Icon = formIcon(activeMed.form);
                          return <Icon className="w-6 h-6" strokeWidth={2.25} />;
                        })()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wider block">
                        {activeIsSnoozed ? 'به تعویق افتاد' : 'نوبت فعلی'}
                      </span>
                      <h3 className="font-black text-slate-900 dark:text-white leading-tight truncate text-lg sm:text-xl">
                        {activeMed.name}
                      </h3>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSkipSheet(true);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    title="مصرف نکردم"
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/70 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 active:scale-90 transition-all shadow-sm"
                  >
                    <Ban className="w-4 h-4" strokeWidth={2.25} />
                  </button>
                </div>

                {activeIsSnoozed && (
                  <div className="mb-2 bg-amber-50/90 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                    <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>این نوبت را «بعداً» گذاشته‌اید</span>
                  </div>
                )}

                {activeDeadlineInfo && (
                  <div className="mb-2 bg-rose-50/90 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-rose-700 dark:text-rose-300 text-[11px] font-bold">
                    <Hourglass className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>{activeDeadlineInfo}</span>
                  </div>
                )}

                {activeCriticalNotice && (
                  <div className="mb-2 bg-purple-50/90 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/70 rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-purple-700 dark:text-purple-300 text-[11px] font-bold">
                    <ShieldAlert className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <span>{activeCriticalNotice}</span>
                  </div>
                )}

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between bg-white/70 dark:bg-slate-900/50 rounded-2xl px-4 py-3 shadow-sm border border-white/70 dark:border-slate-700/50">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-bold text-xs">
                      <Clock className="w-4 h-4 text-blue-500" />
                      زمان مصرف
                    </span>
                    <span className="font-black text-slate-900 dark:text-white text-lg sm:text-xl">
                      ساعت {toPersianNumbers(timeLabel(activeOccurrence))}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-white/70 dark:bg-slate-900/50 rounded-2xl px-4 py-3 shadow-sm border border-white/70 dark:border-slate-700/50">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-bold text-xs">
                      <Pill className="w-4 h-4 text-emerald-500" />
                      مقدار (دوز)
                    </span>
                    <div className="flex flex-col items-end leading-tight">
                      <span className="font-black text-slate-900 dark:text-white text-lg sm:text-xl">
                        {toPersianNumbers(activeDoseParts.main)}
                      </span>
                      {activeDoseParts.sub && (
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                          {toPersianNumbers(activeDoseParts.sub)}
                        </span>
                      )}
                    </div>
                  </div>

                  {activeMed.instructions && (
                    <div className="bg-white/50 dark:bg-slate-900/40 rounded-2xl px-4 py-2.5 border border-white/60 dark:border-slate-700/40 text-[11px] text-slate-700 dark:text-slate-300 font-medium flex items-start gap-1.5">
                      <span className="text-amber-600 dark:text-amber-400 font-bold shrink-0">دستور:</span>
                      <span className="truncate">{activeMed.instructions}</span>
                    </div>
                  )}

                  {activeMed.reason && (
                    <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">
                      علت مصرف: {activeMed.reason}
                    </p>
                  )}
                </div>

                {activeMed.remainingCount <= activeMed.alertThreshold && (
                  <div className="mt-2.5 bg-amber-50/90 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 rounded-xl p-2 flex items-center gap-1.5 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>موجودی: {toPersianNumbers(activeMed.remainingCount)} عدد باقی‌مانده</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5 pt-3">
                <button
                  onClick={() => handleAction('snoozed')}
                  className="w-1/3 flex items-center justify-center gap-1 py-3.5 bg-amber-50/90 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 rounded-2xl hover:bg-amber-100 font-bold text-xs sm:text-sm transition-all active:scale-95 shadow-sm"
                  title="یادآوری بعداً"
                >
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span>بعداً</span>
                </button>

                <button
                  onClick={() => handleAction('taken')}
                  className="w-2/3 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/30 hover:scale-[1.02] font-black text-sm sm:text-base transition-all active:scale-95"
                  title="مصرف کردم"
                >
                  <Check className="w-5 h-5 text-white stroke-[3]" />
                  <span>مصرف شد</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {skipToast && createPortal(
        <div className="fixed inset-x-0 z-[85] flex justify-center px-4 mb-[calc(6.75rem+env(safe-area-inset-bottom))] bottom-0 animate-in fade-in duration-200 pointer-events-none">
          <div className="max-w-sm w-full bg-slate-900/95 dark:bg-slate-800/95 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-2.5 backdrop-blur-xl border border-white/10 pointer-events-auto">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm font-bold leading-relaxed flex-1">{skipToast}</p>
            <button
              type="button"
              onClick={() => setSkipToast(null)}
              className="text-white/50 hover:text-white shrink-0"
            >
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
      onClose={() => setShowSkipSheet(false)}
      onConfirmTiming={handleConfirmTiming}
      onConfirmSideEffects={handleConfirmSideEffects}
      onConfirmDoctorAdvice={handleConfirmDoctorAdvice}
      onConfirmOutOfStock={handleConfirmOutOfStock}
    />
    </>
  );
};
