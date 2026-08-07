import React, { useEffect, useRef, useState } from 'react';
import { Bell, Menu, Activity, Clock, Sparkles } from 'lucide-react';
import { toEnglishNumbers, toPersianNumbers } from '../../utils/persian';
import { Medication, DoseLog } from '../../types';
import { medicationTimeSlots, isDoseSlotResolvedToday } from '../../utils/doseSchedule';

interface HeaderProps {
  onOpenMenu: () => void;
  medications: Medication[];
  logs: DoseLog[];
  /** Called with a medication id when the user taps the "نوبت بعدی" row — should
   *  navigate to the home tab and bring that medication's card to the front. */
  onOpenReminder?: (medId: string) => void;
}

// Converts a "HH:MM" (Persian or English digits) schedule time into minutes-of-day
const timeToMinutes = (time: string): number => {
  const en = toEnglishNumbers(time);
  const [h, m] = en.split(':').map(Number);
  if (Number.isNaN(h)) return Number.MAX_SAFE_INTEGER;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
};

export const Header: React.FC<HeaderProps> = ({
  onOpenMenu,
  medications,
  logs,
  onOpenReminder
}) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Today's adherence progress, kept in sync with the reports panel logic —
  // computed per وعده (dose slot), not per medication, so a 3-times-a-day
  // medication with only its morning dose taken still counts 2 pending وعده.
  const todayStr = new Date().toISOString().split('T')[0];
  const activeMeds = medications.filter(m => m.isActive);
  const pendingSlots: { med: Medication; slotIndex: number; time: string }[] = [];
  activeMeds.forEach(med => {
    medicationTimeSlots(med).forEach((time, slotIndex) => {
      if (!isDoseSlotResolvedToday(med.id, slotIndex, logs, todayStr)) {
        pendingSlots.push({ med, slotIndex, time });
      }
    });
  });
  const totalTodayCount = activeMeds.reduce((sum, m) => sum + medicationTimeSlots(m).length, 0);
  const completedTodayCount = totalTodayCount - pendingSlots.length;
  const progressPercent = totalTodayCount > 0 ? Math.round((completedTodayCount / totalTodayCount) * 100) : 0;

  // Find the next upcoming dose among today's pending وعده‌ها. Built once as an
  // immutable value (instead of two mutable `let`s reassigned inside a loop) so
  // TypeScript can correctly narrow it as non-null inside the JSX below.
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nextDose = pendingSlots.reduce<{ med: Medication; time: string; diff: number } | null>(
    (closest, { med, time }) => {
      const mins = timeToMinutes(time);
      const diff = mins >= nowMinutes ? mins - nowMinutes : mins + 24 * 60 - nowMinutes;
      return !closest || diff < closest.diff ? { med, time, diff } : closest;
    },
    null
  );

  const badgeCount = pendingSlots.length;

  return (
    <header className="sticky top-2 z-40 px-3 sm:px-6 transition-all duration-200">
      {/* Floating Pill Container */}
      <div className="max-w-3xl mx-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/60 dark:border-slate-800 rounded-[32px] p-2.5 sm:px-5 shadow-xl flex items-center justify-between gap-3 relative">

        {/* Right Side (main-start in RTL): Menu Hamburger Button (≡) - Teal theme */}
        <button
          onClick={onOpenMenu}
          className="p-2.5 bg-teal-50/90 dark:bg-slate-800/90 border border-teal-200/80 dark:border-slate-700/80 text-teal-700 dark:text-teal-300 rounded-[22px] hover:scale-105 active:scale-95 transition-all shadow-xs"
          title="منوی اصلی"
        >
          <Menu className="w-6 h-6 stroke-[2.5]" />
        </button>

        {/* Center: Title "داروتو" + Squircle Avatar/Icon Box - Matching Image 4 */}
        <div className="flex items-center gap-2.5">
          <span className="font-black text-2xl sm:text-3xl tracking-tight text-slate-900 dark:text-white">
            داروتو
          </span>
          {/* Avatar Icon Box in squircle - Matching Image 4 */}
          <div className="w-11 h-11 rounded-[22px] bg-gradient-to-tr from-teal-500 to-emerald-400 p-0.5 flex items-center justify-center shadow-md">
            <div className="w-full h-full rounded-[20px] bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white">
              <Activity className="w-6 h-6 stroke-[2.5]" />
            </div>
          </div>
        </div>

        {/* Left Side (main-end in RTL): Notification Bell with Badge, opens the reminders panel */}
        <div ref={panelRef} className="relative">
          <button
            onClick={() => setIsPanelOpen(o => !o)}
            className="relative p-2.5 bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 rounded-[20px] hover:scale-105 active:scale-95 transition-all shadow-xs"
            title="اعلان‌ها و یادآوری‌ها"
          >
            <Bell className="w-6 h-6" />
            {badgeCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white font-black text-[11px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-sm animate-pulse">
                {toPersianNumbers(badgeCount)}
              </span>
            )}
          </button>

          {/* Notifications dropdown panel - styled to match the app's teal/emerald palette */}
          {isPanelOpen && (
            <div className="absolute left-0 top-[calc(100%+10px)] w-[85vw] max-w-[340px] sm:w-96 sm:max-w-none bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-white/60 dark:border-slate-800 rounded-[28px] shadow-2xl p-5 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-left">
              {/* Panel header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-800 dark:text-white text-base sm:text-lg">
                  یادآوری‌های امروز
                </h3>
              </div>

              {/* Progress bar - today's adherence status, matching the reports panel */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">
                    پیشرفت امروز
                  </span>
                  <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                    {toPersianNumbers(progressPercent)}٪
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-1.5">
                  {toPersianNumbers(completedTodayCount)} از {toPersianNumbers(totalTodayCount)} نوبت مصرف شده
                </p>
              </div>

              {/* Next dose row */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5">
                {nextDose ? (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenReminder?.(nextDose.med.id);
                      setIsPanelOpen(false);
                    }}
                    className="w-full flex items-center gap-3 bg-teal-50/70 dark:bg-teal-950/40 hover:bg-teal-100/80 dark:hover:bg-teal-950/60 rounded-2xl p-3 text-right transition-colors active:scale-[0.98]"
                  >
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 block">
                        نوبت بعدی
                      </span>
                      <p className="font-black text-slate-800 dark:text-white text-sm truncate">
                        {nextDose.med.name} - ساعت {toPersianNumbers(nextDose.time)}
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-2xl p-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                      همه داروهای امروز مصرف شده است
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
