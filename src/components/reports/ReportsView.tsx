import React from 'react';
import { Medication, DoseOccurrence } from '../../types';
import { toPersianNumbers, PERSIAN_WEEKDAYS } from '../../utils/persian';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';
import { BarChart3, Calendar, CheckCircle2, XCircle, BellOff, TrendingUp } from 'lucide-react';
import { clockAdapter } from '../../adapters/ClockAdapter';

interface ReportsViewProps {
  medications: Medication[];
  /** فاز ۵ سند طراحی (پاک‌سازی): ReportsView دیگر از DoseLog قدیمی نمی‌خواند
   *  — تاریخچه‌ی مصرف مستقیماً از DoseOccurrence.status + scheduledAt محاسبه
   *  می‌شود (منبع واحد، بخش ۰). نوشتن به DoseLog در App.tsx فقط برای
   *  سازگاری با Header.tsx (که طبق بخش ۱۳ خارج از دامنه‌ی این مهاجرت ماند)
   *  ادامه دارد، نه برای این نما. */
  occurrences: DoseOccurrence[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({ medications, occurrences }) => {
  const activeMeds = medications.filter(m => m.isActive);
  const totalMeds = activeMeds.length;

  // بخش ۱۶ (نیمه‌شب): «امروز چیست» فقط از یک نقطه — ClockAdapter — محاسبه
  // می‌شود، نه toISOString().split('T')[0] (که تاریخ را بر اساس UTC می‌گرفت،
  // نه تقویم محلی کاربر).
  const timeZoneId = clockAdapter.currentTimeZoneId();
  const todayStr = clockAdapter.localDateKey(clockAdapter.now(), timeZoneId);
  const occDateKey = (occ: DoseOccurrence) => clockAdapter.localDateKey(new Date(occ.scheduledAt), timeZoneId);

  const todayOccurrences = occurrences.filter(o => occDateKey(o) === todayStr);
  const takenToday = todayOccurrences.filter(o => o.status === 'taken').length;
  // `skipped` = the user made an active decision not to take the dose (behavioral).
  // `missed` = the dose deadline passed with no user action at all (likely a
  // reminder/UX problem on the app's side, not a user decision). Kept as two
  // separate counters throughout this view instead of folding both into "not taken".
  const skippedToday = todayOccurrences.filter(o => o.status === 'skipped').length;
  const missedToday = todayOccurrences.filter(o => o.status === 'missed').length;
  const todayAdherence = totalMeds > 0 ? Math.min(100, Math.round((takenToday / totalMeds) * 100)) : 0;

  // Real per-day breakdown for the current calendar week (Saturday through Friday,
  // the week containing today), built strictly from the user's own occurrences
  // (grouped by scheduledAt's local date) — days with no occurrence correctly
  // show 0%, nothing here is simulated/decorative.
  // JS getDay(): 0=Sunday..6=Saturday → Persian week index: 0=Saturday..6=Friday
  const today = clockAdapter.now();
  const todayLocal = clockAdapter.instantToZonedDate(today, timeZoneId);
  const todayPersianIndex = (todayLocal.weekday + 1) % 7;
  const saturday = new Date(today);
  saturday.setDate(saturday.getDate() - todayPersianIndex);

  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    // The chart draws items left-to-right in array order. So that a right-to-left
    // (RTL) reader sees Saturday first and Friday last, index 0 here must be Friday
    // (drawn at the chart's left edge) and index 6 must be Saturday (drawn at the
    // chart's right edge) — i.e. weekday offset = 6 - i.
    const weekdayOffset = 6 - i;
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + weekdayOffset);
    const dateStr = clockAdapter.localDateKey(d, timeZoneId);
    const dayOccurrences = occurrences.filter(o => occDateKey(o) === dateStr);
    const dayTaken = dayOccurrences.filter(o => o.status === 'taken').length;
    const daySkipped = dayOccurrences.filter(o => o.status === 'skipped').length;
    const dayMissed = dayOccurrences.filter(o => o.status === 'missed').length;
    // Prefer today's active-medication count as the expected-doses denominator;
    // for other days (where the medication list may have since changed) fall back
    // to however many doses actually occurred that day.
    const dayExpected = totalMeds > 0 ? totalMeds : dayOccurrences.length;
    const rate = (n: number) => (dayExpected > 0 ? Math.min(100, Math.round((n / dayExpected) * 100)) : 0);
    return {
      name: PERSIAN_WEEKDAYS[weekdayOffset],
      adherence: rate(dayTaken),
      takenRate: rate(dayTaken),
      skippedRate: rate(daySkipped),
      missedRate: rate(dayMissed),
      taken: dayTaken,
      skipped: daySkipped,
      missed: dayMissed,
      total: dayExpected
    };
  });

  const weekSkippedTotal = weeklyData.reduce((sum, d) => sum + d.skipped, 0);
  const weekMissedTotal = weeklyData.reduce((sum, d) => sum + d.missed, 0);

  return (
    <div className="w-full max-w-3xl mx-auto py-4 px-3 sm:px-4 pb-24 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col items-center text-center gap-3">
        <div>
          <h2 className="font-black text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2 text-xl sm:text-2xl">
            <BarChart3 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>گزارشات و تاریخچه مصرف</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            مشاهده نمودار پایبندی به درمان، آمار مصرف روزانه و وضعیت منظم بودن
          </p>
        </div>
      </div>

      {/* TODAY SUMMARY HERO CARD */}
      <div className="bg-gradient-to-tr from-emerald-600 via-teal-600 to-blue-700 rounded-[32px] p-6 sm:p-8 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <div className="z-10 relative text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold mb-3">
            <Calendar className="w-3.5 h-3.5" />
            وضعیت مصرف امروز
          </span>
          <h3 className="font-black tracking-tight mb-4 text-2xl sm:text-3xl flex items-center justify-center gap-2">
            <span>امروز: {toPersianNumbers(takenToday)} از {toPersianNumbers(totalMeds)} مصرف شد</span>
            <CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-200 shrink-0" />
          </h3>

          {/* Same progress-bar pattern used in the notification panel */}
          <div className="text-right">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs sm:text-sm font-bold text-slate-100">
                پیشرفت امروز
              </span>
              <span className="text-sm sm:text-base font-black text-emerald-200">
                {toPersianNumbers(todayAdherence)}٪
              </span>
            </div>
            <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${todayAdherence}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-100/90 font-medium mt-1.5">
              {toPersianNumbers(takenToday)} از {toPersianNumbers(totalMeds)} نوبت مصرف شده
            </p>
          </div>

          {/* taken / skipped / missed breakdown — kept as three separate counters
              so a spike in "رد شده" (a user decision) never gets mixed into
              "فراموش شده" (a reminder/UX problem), or vice‌versa. */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/15 backdrop-blur-md rounded-2xl px-2 py-2.5 text-center">
              <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-emerald-200" />
              <p className="text-base font-black">{toPersianNumbers(takenToday)}</p>
              <p className="text-[10px] font-bold text-slate-100/90">مصرف شده</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl px-2 py-2.5 text-center">
              <XCircle className="w-4 h-4 mx-auto mb-1 text-amber-200" />
              <p className="text-base font-black">{toPersianNumbers(skippedToday)}</p>
              <p className="text-[10px] font-bold text-slate-100/90">رد شده</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl px-2 py-2.5 text-center">
              <BellOff className="w-4 h-4 mx-auto mb-1 text-rose-200" />
              <p className="text-base font-black">{toPersianNumbers(missedToday)}</p>
              <p className="text-[10px] font-bold text-slate-100/90">فراموش شده</p>
            </div>
          </div>

          {(skippedToday > 0 || missedToday > 0) && (
            <p className="text-[11px] text-slate-100/90 font-medium mt-3 bg-white/10 rounded-xl px-3 py-2">
              {missedToday > skippedToday
                ? 'دوزهای «فراموش‌شده» امروز بیشتر از موارد «رد شده»‌ست — احتمالاً یادآورها را باید بررسی کرد.'
                : 'بیشتر دوزهای مصرف‌نشده‌ی امروز آگاهانه «رد شده»‌اند، نه فراموش.'}
            </p>
          )}
        </div>
      </div>

      {/* WEEKLY RECHARTS BAR CHART */}
      <div className="bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl rounded-[32px] p-6 border border-white/50 dark:border-slate-700/50 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-black text-slate-800 dark:text-slate-100 text-base sm:text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>نمودار مصرف/رد/فراموشی در هفته جاری</span>
          </h3>
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-full">
            هدف استاندارد: بالای ۹۰٪
          </span>
        </div>

        <div className="h-64 sm:h-72 w-full flex items-center justify-center -mx-3 sm:-mx-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 10, right: 4, left: 4, bottom: 0 }} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} vertical={false} />
              <XAxis
                dataKey="name"
                interval={0}
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'Vazirmatn' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'Vazirmatn' }}
                tickFormatter={(val) => `${toPersianNumbers(val)}٪`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  borderRadius: '16px',
                  border: 'none',
                  fontFamily: 'Vazirmatn',
                  fontSize: '13px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
                }}
                formatter={(value: any, name: any) => [`${toPersianNumbers(value)}٪`, name]}
                labelStyle={{ fontWeight: 'bold', color: '#38bdf8', marginBottom: '4px' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Vazirmatn' }} />
              <Bar dataKey="takenRate" name="مصرف شده" stackId="status" fill="#10b981" radius={[0, 0, 0, 0]} barSize={32} />
              <Bar dataKey="skippedRate" name="رد شده" stackId="status" fill="#f59e0b" radius={[0, 0, 0, 0]} barSize={32} />
              <Bar dataKey="missedRate" name="فراموش شده" stackId="status" fill="#f43f5e" radius={[12, 12, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* WEEKLY AREA CHART — skipped vs missed trend, since the two point at very
          different root causes: skipped is the user's own choice, missed is more
          likely a reminder/UX gap in the app. */}
      <div className="bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl rounded-[32px] p-6 border border-white/50 dark:border-slate-700/50 shadow-xl">
        <h3 className="font-black text-slate-800 dark:text-slate-100 text-base sm:text-lg mb-1 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>روند رد شدن در برابر فراموشی دوزها</span>
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
          «رد شده» یعنی تصمیم آگاهانه‌ی شما بوده؛ «فراموش شده» یعنی یادآوری/دستیار اپ کار نکرده.
        </p>
        <div className="h-48 w-full flex items-center justify-center -mx-3 sm:-mx-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyData} margin={{ top: 10, right: 4, left: 4, bottom: 0 }} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.2} />
              <XAxis dataKey="name" interval={0} tick={{ fontSize: 9, fill: '#64748b', fontFamily: 'Vazirmatn' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(val: any, name: any) => [`${toPersianNumbers(val)}٪`, name]} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Vazirmatn' }} />
              <Area type="monotone" dataKey="skippedRate" name="رد شده" stroke="#f59e0b" strokeWidth={3} fill="#f59e0b" fillOpacity={0.15} />
              <Area type="monotone" dataKey="missedRate" name="فراموش شده" stroke="#f43f5e" strokeWidth={3} fill="#f43f5e" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {(weekSkippedTotal > 0 || weekMissedTotal > 0) && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-3">
            این هفته: {toPersianNumbers(weekSkippedTotal)} مورد رد شده، {toPersianNumbers(weekMissedTotal)} مورد فراموش شده.{' '}
            {weekMissedTotal > weekSkippedTotal
              ? 'روند فراموشی بالاتره — احتمالاً باید یادآورها را بررسی کنید.'
              : 'بیشتر موارد آگاهانه رد شده‌اند، نه فراموش.'}
          </p>
        )}
      </div>
    </div>
  );
};
