import React, { useState } from 'react';
import { CheckCircle2, X, Zap, Clock } from 'lucide-react';
import { toPersianNumbers } from '../../utils/persian';
import { Instant } from '../../types';
import { ClockFacePicker } from '../common/ClockFacePicker';

interface ScheduleStartAtPickerProps {
  scheduleStartAt?: Instant;
  onChangeScheduleStartAt: (instant: Instant) => void;
}

type ViewState = 'closed' | 'choice' | 'custom';

/**
 * دکمه‌ی «شروع زمان‌بندی از هم‌اکنون» برای الگوی «هر چند ساعت» — با زدنش از کاربر
 * پرسیده می‌شود زمان‌بندی از «همین الان» شروع شود یا یک «زمان دلخواه» (که با یک
 * ساعت گرد انتخاب می‌شود). در هر دو حالت فقط `scheduleStartAt` پر می‌شود؛ منطق
 * پایین‌دستی (computeIntervalTimesFromClock) بدون تغییر بر همان مقدار کار می‌کند.
 */
export const ScheduleStartAtPicker: React.FC<ScheduleStartAtPickerProps> = ({
  scheduleStartAt,
  onChangeScheduleStartAt
}) => {
  const [view, setView] = useState<ViewState>('closed');

  const initial = scheduleStartAt !== undefined ? new Date(scheduleStartAt) : new Date();
  const [customHour, setCustomHour] = useState<number>(initial.getHours());
  const [customMinute, setCustomMinute] = useState<number>(initial.getMinutes());

  const openChoice = () => {
    // هر بار که دوباره باز می‌شود، ساعت گرد را با آخرین مقدار انتخاب‌شده (یا اکنون) هماهنگ کن
    const base = scheduleStartAt !== undefined ? new Date(scheduleStartAt) : new Date();
    setCustomHour(base.getHours());
    setCustomMinute(base.getMinutes());
    setView('choice');
  };

  const chooseNow = () => {
    onChangeScheduleStartAt(Date.now());
    setView('closed');
  };

  const confirmCustom = () => {
    const d = new Date();
    d.setHours(customHour, customMinute, 0, 0);
    onChangeScheduleStartAt(d.getTime());
    setView('closed');
  };

  const currentTimeLabel = scheduleStartAt !== undefined
    ? `${toPersianNumbers(new Date(scheduleStartAt).getHours().toString().padStart(2, '0'))}:${toPersianNumbers(
        new Date(scheduleStartAt).getMinutes().toString().padStart(2, '0')
      )}`
    : null;

  return (
    <>
      <button
        type="button"
        onClick={openChoice}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold border transition-all ${
          scheduleStartAt !== undefined
            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50'
        }`}
      >
        {scheduleStartAt !== undefined ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            زمان‌بندی از ساعت {currentTimeLabel} آغاز می‌شود
          </>
        ) : (
          'شروع زمان‌بندی از هم‌اکنون آغاز شود'
        )}
      </button>

      {(view === 'choice' || view === 'custom') && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-sm border border-white/60 dark:border-slate-800 relative">
            <div className="flex items-center justify-between gap-3 p-5 pb-3">
              <h3 className="font-black text-slate-800 dark:text-slate-100 text-base">
                {view === 'choice' ? 'زمان‌بندی از کی شروع بشه؟' : 'زمان شروع دلخواه'}
              </h3>
              <button
                onClick={() => setView('closed')}
                className="shrink-0 p-1.5 text-slate-300 hover:text-slate-500 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {view === 'choice' ? (
              <div className="px-5 pb-5 space-y-2.5">
                <button
                  type="button"
                  onClick={chooseNow}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700 bg-slate-50 dark:bg-slate-800/60 transition-all text-right"
                >
                  <span className="w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-md">
                    <Zap className="w-5 h-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">از همین الان</span>
                    <span className="block text-[11px] text-slate-400 font-medium">زمان‌بندی از همین لحظه شروع می‌شود</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setView('custom')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700 bg-slate-50 dark:bg-slate-800/60 transition-all text-right"
                >
                  <span className="w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-md">
                    <Clock className="w-5 h-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">زمان دلخواه</span>
                    <span className="block text-[11px] text-slate-400 font-medium">یک ساعت مشخص را با ساعت گرد انتخاب کنید</span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="px-5 pb-5 space-y-4">
                <ClockFacePicker hour={customHour} minute={customMinute} onChangeHour={setCustomHour} onChangeMinute={setCustomMinute} />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setView('choice')}
                    className="flex-1 py-2.5 rounded-2xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    بازگشت
                  </button>
                  <button
                    type="button"
                    onClick={confirmCustom}
                    className="flex-[2] py-2.5 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-teal-500 to-emerald-500 shadow-md hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    تأیید این زمان
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
