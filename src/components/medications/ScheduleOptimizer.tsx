import React, { useMemo, useState } from 'react';
import { Check, RotateCcw, Sparkles, X } from 'lucide-react';
import { toPersianNumbers } from '../../utils/persian';

export const SLEEP_WINDOW = { startHour: 0, endHour: 5 } as const;

export interface ScheduleOptimizerProps {
  times: string[];
  intervalHours?: number;
  scheduleStartAt?: string;
  onApply: (suggestedTimes: string[], suggestedStartAt?: string) => void;
  onRestore?: () => void;
  hasBackup?: boolean;
}

function minutes(t: string): number {
  const [h, m] = t.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).split(':').map(Number);
  return (h * 60 + m) % 1440;
}
function time(m: number): string {
  const x = (m + 1440) % 1440;
  return `${toPersianNumbers(String(Math.floor(x / 60)).padStart(2, '0'))}:${toPersianNumbers(String(x % 60).padStart(2, '0'))}`;
}
function sleepPenalty(list: number[]): number {
  return list.reduce((score, m) => score + (m < 300 ? 1 + (300 - m) / 300 : 0), 0);
}

/** فقط offset را جابه‌جا می‌کند، تعداد و فاصله‌ی relative را حفظ می‌کند. */
export function suggestSchedule(times: string[], intervalHours?: number): string[] {
  if (!times.length) return times;
  const source = times.map(minutes);
  let best = source;
  let bestScore = sleepPenalty(source);
  for (let offset = 0; offset < 1440; offset += 15) {
    const candidate = source.map(m => m + offset);
    const score = sleepPenalty(candidate.map(m => (m + 1440) % 1440));
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best.map(time);
}

function shiftedStartAt(iso: string | undefined, original: string[], suggested: string[]): string | undefined {
  if (!iso || !original.length || !suggested.length) return iso;
  const delta = minutes(suggested[0]) - minutes(original[0]);
  return new Date(new Date(iso).getTime() + delta * 60_000).toISOString();
}

export const ScheduleOptimizer: React.FC<ScheduleOptimizerProps> = ({ times, intervalHours, scheduleStartAt, onApply, onRestore, hasBackup }) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const suggestion = useMemo(() => suggestSchedule(times, intervalHours), [times, intervalHours]);
  const changed = suggestion.join('|') !== times.join('|');
  const close = () => { setOpen(false); setPreview(false); };
  return <>
    <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2 text-xs font-bold text-violet-700">
      <Sparkles className="h-4 w-4" /> پیشنهاد بهترین زمان‌بندی
    </button>
    {hasBackup && onRestore && <button type="button" onClick={onRestore} className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-600"><RotateCcw className="h-4 w-4" /> بازگشت به زمان‌بندی خودم</button>}
    {open && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between"><h3 className="font-black text-slate-900 dark:text-white">بهینه‌سازی زمان‌بندی</h3><button type="button" onClick={close}><X className="h-5 w-5" /></button></div>
        {!preview ? <><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">سعی می‌کند نوبت‌ها را تا جای ممکن از بازه معمول خواب، ۱۲ شب تا ۵ صبح، دور کند؛ تعداد نوبت‌ها و فاصله‌هایشان تغییر نمی‌کند.</p><button type="button" onClick={() => setPreview(true)} className="mt-5 w-full rounded-xl bg-violet-600 py-3 font-black text-white">مشاهده‌ی پیشنهاد</button></> : <>
          <div className="mt-4 space-y-2 text-sm"><div className="flex justify-between rounded-xl bg-slate-100 p-3 dark:bg-slate-800"><span>زمان‌بندی من</span><b>{times.map(time => time).join('، ')}</b></div><div className="flex justify-between rounded-xl bg-violet-50 p-3 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"><span>پیشنهاد</span><b>{suggestion.join('، ')}</b></div></div>
          {!changed && <p className="mt-3 text-xs font-bold text-emerald-700">زمان‌بندی فعلی از قبل مناسب است.</p>}
          <div className="mt-5 flex gap-2"><button type="button" onClick={close} className="flex-1 rounded-xl border py-3 font-bold">انصراف</button><button type="button" disabled={!changed} onClick={() => { onApply(suggestion, shiftedStartAt(scheduleStartAt, times, suggestion)); close(); }} className="flex-1 rounded-xl bg-violet-600 py-3 font-black text-white disabled:opacity-40"><Check className="inline h-4 w-4" /> اعمال کن</button></div>
        </>}
      </div>
    </div>}
  </>;
};
