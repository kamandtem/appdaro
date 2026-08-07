import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { toPersianNumbers, toEnglishNumbers, PERSIAN_WEEKDAYS } from '../../utils/persian';
import { WheelPicker, WheelPickerItem } from './WheelPicker';
import { ClockFacePicker } from './ClockFacePicker';
import { FrequencyType } from '../../types';

interface CylinderTimePickerProps {
  frequency: FrequencyType;
  selectedTimes: string[];
  onAddTime: (timeStr: string) => void;
  onRemoveTime: (timeStr: string) => void;
  intervalHours: number;
  onChangeIntervalHours: (v: number) => void;
  intervalDays: number;
  onChangeIntervalDays: (v: number) => void;
  /** Day of month (۱ تا ۳۱) — used by the "ماهانه" repeat pattern. */
  monthDay: number;
  onChangeMonthDay: (v: number) => void;
  /** ISO datetime — set (and changed) each time the user presses "schedule starts now".
   *  When present, all computed/added turns update instantly to start from that moment. */
  scheduleStartAt?: string;
}

// Computes the clock times an "every N hours" schedule lands on, e.g. 8 -> ["۸:۰۰","۱۶:۰۰","۲۴:۰۰"]
export const computeIntervalTimes = (intervalHours: number): string[] => {
  if (!intervalHours || intervalHours <= 0) return [];
  const times: string[] = [];
  let h = intervalHours;
  while (h <= 24 + 1e-6) {
    const hh = Math.floor(h + 1e-6);
    const mm = Math.round((h - hh) * 60);
    times.push(`${toPersianNumbers(hh)}:${toPersianNumbers(mm.toString().padStart(2, '0'))}`);
    h += intervalHours;
  }
  return times;
};

// Same as computeIntervalTimes, but anchored to a specific clock time instead of
// starting the grid at midnight — used when the user presses "schedule starts now"
// so every computed turn shifts to begin from that exact moment.
export const computeIntervalTimesFromClock = (intervalHours: number, startHour: number, startMinute: number): string[] => {
  if (!intervalHours || intervalHours <= 0) return [];
  const stepMin = intervalHours * 60;
  const startTotal = startHour * 60 + startMinute;
  const count = Math.max(1, Math.round((24 * 60) / stepMin));
  const times: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = Math.round(startTotal + i * stepMin) % (24 * 60);
    const hh = Math.floor(total / 60);
    const mm = Math.round(total % 60);
    times.push(`${toPersianNumbers(hh.toString().padStart(2, '0'))}:${toPersianNumbers(mm.toString().padStart(2, '0'))}`);
  }
  return times;
};

// Computes the weekday names an "every N days" schedule lands on, anchored on today.
// `upcoming` is the next 3 occurrences (for display); `allDays` is the full set of
// weekdays the pattern ever touches within about a month (for storage).
export const computeWeekdaySchedule = (intervalDays: number): { upcoming: string[]; allDays: string[] } => {
  const todayIdx = (new Date().getDay() + 1) % 7; // JS Sunday(0) -> یک‌شنبه(index 1), Saturday(6) -> شنبه(index 0)
  const upcoming: string[] = [];
  const uniqueDays = new Set<string>();
  const step = Math.max(1, intervalDays);
  const iterations = Math.ceil(35 / step);
  let idx = todayIdx;
  for (let i = 0; i < iterations; i++) {
    const day = PERSIAN_WEEKDAYS[idx];
    uniqueDays.add(day);
    if (upcoming.length < 3) upcoming.push(day);
    idx = (idx + step) % 7;
  }
  return { upcoming, allDays: Array.from(uniqueDays) };
};

// Curated, clinically-common repeat intervals for the "هر چند ساعت" pattern — در
// عمل تقریباً هیچ‌کس به بازه‌ای خارج از این مقادیر برای یادآور خانگی/سرپایی نیاز
// ندارد؛ همین مقادیر مستقیماً روی چرخ/رول انتخاب زمان قرار می‌گیرند.
const CURATED_INTERVAL_HOURS = [2, 3, 4, 6, 8, 12];

const intervalHourItems: WheelPickerItem[] = CURATED_INTERVAL_HOURS.map(v => ({
  value: v,
  label: toPersianNumbers(v)
}));

const intervalDayItems: WheelPickerItem[] = [1, 2, 3].map(v => ({
  value: v,
  label: toPersianNumbers(v)
}));

// ۱ تا ۳۱ — روز مصرف در الگوی «ماهانه»
const monthDayItems: WheelPickerItem[] = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: toPersianNumbers(i + 1)
}));

const AddedTurnsRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-wrap gap-2 justify-center items-center pt-3 mt-1 border-t border-slate-200/70 dark:border-slate-700/70">
    <span className="text-xs text-slate-500 font-bold">نوبت‌های افزوده‌شده:</span>
    {children}
  </div>
);

const TurnChip: React.FC<{ children: React.ReactNode; onRemove?: () => void }> = ({ children, onRemove }) => (
  <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-3.5 py-1.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 border border-emerald-200/60 dark:border-emerald-800">
    <Clock className="w-3.5 h-3.5" />
    {children}
    {onRemove && (
      <button type="button" onClick={onRemove} className="text-rose-500 font-bold hover:text-rose-700 mr-1 p-0.5 rounded-full hover:bg-rose-100 dark:hover:bg-rose-950/50">×</button>
    )}
  </span>
);

export const CylinderTimePicker: React.FC<CylinderTimePickerProps> = ({
  frequency,
  selectedTimes,
  onAddTime,
  onRemoveTime,
  intervalHours,
  onChangeIntervalHours,
  intervalDays,
  onChangeIntervalDays,
  monthDay,
  onChangeMonthDay,
  scheduleStartAt
}) => {
  const parseTime = (t?: string) => {
    if (!t) return null;
    const [h, m] = toEnglishNumbers(t).split(':').map(n => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return { h, m };
  };
  const initial = parseTime(selectedTimes[0]);
  const [hour, setHour] = useState<number>(initial?.h ?? 9);
  const [minute, setMinute] = useState<number>(initial?.m ?? 0);

  // "هر چند ساعت": کاربر بازه را از روی چرخ/رول بازه‌های رایج پزشکی انتخاب می‌کند.
  const addCurrentClockTime = () => {
    const timeStr = `${toPersianNumbers(hour.toString().padStart(2, '0'))}:${toPersianNumbers(minute.toString().padStart(2, '0'))}`;
    onAddTime(timeStr);
  };

  // "Schedule starts now" (or a custom start time) was applied — jump the clock face to this exact moment and,
  // for the daily / specific-weekday modes, add it right away so the added turns update instantly.
  const lastAppliedStart = React.useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!scheduleStartAt || scheduleStartAt === lastAppliedStart.current) return;
    lastAppliedStart.current = scheduleStartAt;
    const d = new Date(scheduleStartAt);
    const h = d.getHours();
    const m = d.getMinutes();
    setHour(h);
    setMinute(m);
    if (frequency !== 'هر چند ساعت') {
      const timeStr = `${toPersianNumbers(h.toString().padStart(2, '0'))}:${toPersianNumbers(m.toString().padStart(2, '0'))}`;
      onAddTime(timeStr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleStartAt]);

  // Mode: every N hours
  if (frequency === 'هر چند ساعت') {
    const preview = scheduleStartAt
      ? computeIntervalTimesFromClock(intervalHours, new Date(scheduleStartAt).getHours(), new Date(scheduleStartAt).getMinutes())
      : computeIntervalTimes(intervalHours);
    const isWhole = Number.isInteger(intervalHours);
    return (
      <div className="bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-3xl p-4 shadow-inner">
        {/* Free-standing title — not squeezed inside the wheel's fixed-height row */}
        <p className="text-center text-sm font-black text-slate-700 dark:text-slate-200 mb-3">
          هر <span className="text-teal-600 dark:text-teal-400">{toPersianNumbers(isWhole ? intervalHours : intervalHours.toFixed(1))}</span> ساعت
        </p>

        {/* بازه‌های رایج پزشکی روی چرخ/رول — یک اسکرول ساده، بدون نیاز به دکمه‌های جدا. */}
        <div className="flex items-center justify-center">
          <WheelPicker items={intervalHourItems} value={intervalHours} onChange={onChangeIntervalHours} loop />
        </div>

        <AddedTurnsRow>
          {preview.map((t, i) => (
            <TurnChip key={`${t}-${i}`}>{toPersianNumbers(t)}</TurnChip>
          ))}
        </AddedTurnsRow>
      </div>
    );
  }

  // Mode: specific weekdays, repeating every N days
  if (frequency === 'روزهای هفته') {
    const { upcoming } = computeWeekdaySchedule(intervalDays);
    const timesLabel = selectedTimes.map(toPersianNumbers).join('، ');
    const dayPreview = upcoming.map(d => (timesLabel ? `${d} ساعت ${timesLabel}` : d));

    return (
      <div className="bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-3xl p-4 shadow-inner">
        {/* Free-standing title above a small, compact day-count wheel — only one
            faded/blurred neighbor shows above and below so it stays lightweight */}
        <p className="text-center text-sm font-black text-slate-700 dark:text-slate-200 mb-2">
          هر <span className="text-teal-600 dark:text-teal-400">{toPersianNumbers(intervalDays)}</span> روز
        </p>
        <div className="flex items-center justify-center">
          <WheelPicker items={intervalDayItems} value={intervalDays} onChange={onChangeIntervalDays} loop={false} compact />
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-700/70 space-y-2">
          <p className="text-center text-xs font-bold text-slate-500 dark:text-slate-400">ساعت دقیق مصرف در آن روزها</p>
          <ClockFacePicker hour={hour} minute={minute} onChangeHour={setHour} onChangeMinute={setMinute} />
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={addCurrentClockTime}
              className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl text-xs font-bold shadow-md hover:scale-105 active:scale-95 transition-all"
            >
              + افزودن این زمان به برنامه
            </button>
          </div>
        </div>

        {selectedTimes.length > 0 ? (
          <div className="flex flex-wrap gap-2 justify-center items-center pt-3 mt-1 border-t border-slate-200/70 dark:border-slate-700/70">
            <span className="text-xs text-slate-500 font-bold">ساعت‌های مصرف:</span>
            {selectedTimes.map(t => (
              <TurnChip key={t} onRemove={() => onRemoveTime(t)}>{toPersianNumbers(t)}</TurnChip>
            ))}
          </div>
        ) : (
          <p className="text-center text-[11px] font-bold text-amber-600 dark:text-amber-400 pt-3 mt-1 border-t border-slate-200/70 dark:border-slate-700/70">
            هنوز ساعتی اضافه نشده — بعد از تنظیم ساعت، دکمهٔ «افزودن این زمان» را بزنید.
          </p>
        )}

        <AddedTurnsRow>
          {dayPreview.map((d, i) => (
            <TurnChip key={`${d}-${i}`}>{d}</TurnChip>
          ))}
        </AddedTurnsRow>
      </div>
    );
  }

  // Mode: a specific day of every month (e.g. day ۱۶ of each month)
  if (frequency === 'ماهانه') {
    return (
      <div className="bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-3xl p-4 shadow-inner">
        <p className="text-center text-sm font-black text-slate-700 dark:text-slate-200 mb-2">
          روز <span className="text-teal-600 dark:text-teal-400">{toPersianNumbers(monthDay)}</span> هر ماه
        </p>
        <div className="flex items-center justify-center">
          <WheelPicker items={monthDayItems} value={monthDay} onChange={onChangeMonthDay} loop={false} compact />
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-700/70 space-y-2">
          <p className="text-center text-xs font-bold text-slate-500 dark:text-slate-400">ساعت دقیق مصرف در آن روز</p>
          <ClockFacePicker hour={hour} minute={minute} onChangeHour={setHour} onChangeMinute={setMinute} />
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={addCurrentClockTime}
              className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl text-xs font-bold shadow-md hover:scale-105 active:scale-95 transition-all"
            >
              + افزودن این زمان به برنامه
            </button>
          </div>
        </div>

        {selectedTimes.length > 0 ? (
          <div className="flex flex-wrap gap-2 justify-center items-center pt-3 mt-1 border-t border-slate-200/70 dark:border-slate-700/70">
            <span className="text-xs text-slate-500 font-bold">ساعت‌های مصرف:</span>
            {selectedTimes.map(t => (
              <TurnChip key={t} onRemove={() => onRemoveTime(t)}>{toPersianNumbers(t)}</TurnChip>
            ))}
          </div>
        ) : (
          <p className="text-center text-[11px] font-bold text-amber-600 dark:text-amber-400 pt-3 mt-1 border-t border-slate-200/70 dark:border-slate-700/70">
            هنوز ساعتی اضافه نشده — بعد از تنظیم ساعت، دکمهٔ «افزودن این زمان» را بزنید.
          </p>
        )}

        <AddedTurnsRow>
          <TurnChip>
            هر ماه، روز {toPersianNumbers(monthDay)}
            {selectedTimes.length > 0 ? ` — ساعت ${selectedTimes.map(toPersianNumbers).join('، ')}` : ''}
          </TurnChip>
        </AddedTurnsRow>
      </div>
    );
  }

  // Mode: every day, 24-hour clock
  return (
    <div className="bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-3xl p-4 shadow-inner">
      <ClockFacePicker hour={hour} minute={minute} onChangeHour={setHour} onChangeMinute={setMinute} />

      <div className="mt-3 flex items-center justify-center">
        <button
          type="button"
          onClick={addCurrentClockTime}
          className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl text-xs font-bold shadow-md hover:scale-105 active:scale-95 transition-all"
        >
          + افزودن این زمان به برنامه
        </button>
      </div>

      <AddedTurnsRow>
        {selectedTimes.length > 0 ? (
          selectedTimes.map(t => (
            <TurnChip key={t} onRemove={() => onRemoveTime(t)}>هر روز ساعت {toPersianNumbers(t)}</TurnChip>
          ))
        ) : (
          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
            هنوز ساعتی اضافه نشده — بعد از تنظیم ساعت، دکمهٔ «افزودن این زمان» را بزنید.
          </span>
        )}
      </AddedTurnsRow>
    </div>
  );
};
