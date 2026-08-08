import React, { useMemo } from 'react';
import { Medication, DoseLog } from '../../types';
import { toPersianNumbers } from '../../utils/persian';
import { OccurrenceQueryService } from '../../application/OccurrenceQueryService';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';
import { BarChart3, Calendar, CheckCircle2, XCircle, BellOff, TrendingUp } from 'lucide-react';

interface ReportsViewProps {
  medications: Medication[];
  /** فقط برای تاریخچه‌ی قبل از مهاجرت؛ occurrenceهای جدید اولویت دارند. */
  logs: DoseLog[];
  queryService: OccurrenceQueryService;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ medications, logs, queryService }) => {
  // `medications` عمداً dependency است: وقتی کاربر دارویی را ویرایش/حذف می‌کند،
  // runtime migration ممکن است metadata جدید را روی Aggregate بنویسد و گزارش
  // بعدی باید همان snapshot را از Query Service بخواند.
  const snapshot = useMemo(() => queryService.snapshot(logs), [queryService, logs, medications]);
  const { today, weekly, weekSkippedTotal, weekMissedTotal } = snapshot;

  return (
    <div className="w-full max-w-3xl mx-auto py-4 px-3 sm:px-4 pb-24 space-y-6">
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

      <div className="bg-gradient-to-tr from-emerald-600 via-teal-600 to-blue-700 rounded-[32px] p-6 sm:p-8 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="z-10 relative text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold mb-3">
            <Calendar className="w-3.5 h-3.5" /> وضعیت مصرف امروز
          </span>
          <h3 className="font-black tracking-tight mb-4 text-2xl sm:text-3xl flex items-center justify-center gap-2">
            <span>امروز: {toPersianNumbers(today.taken)} از {toPersianNumbers(today.total)} مصرف شد</span>
            <CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-200 shrink-0" />
          </h3>
          <div className="text-right">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs sm:text-sm font-bold text-slate-100">پیشرفت امروز</span>
              <span className="text-sm sm:text-base font-black text-emerald-200">{toPersianNumbers(today.adherence)}٪</span>
            </div>
            <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${today.adherence}%` }} />
            </div>
            <p className="text-[11px] text-slate-100/90 font-medium mt-1.5">
              {toPersianNumbers(today.taken)} از {toPersianNumbers(today.total)} نوبت مصرف شده
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/15 backdrop-blur-md rounded-2xl px-2 py-2.5 text-center">
              <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-emerald-200" />
              <p className="text-base font-black">{toPersianNumbers(today.taken)}</p>
              <p className="text-[10px] font-bold text-slate-100/90">مصرف شده</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl px-2 py-2.5 text-center">
              <XCircle className="w-4 h-4 mx-auto mb-1 text-amber-200" />
              <p className="text-base font-black">{toPersianNumbers(today.skipped)}</p>
              <p className="text-[10px] font-bold text-slate-100/90">رد شده</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-2xl px-2 py-2.5 text-center">
              <BellOff className="w-4 h-4 mx-auto mb-1 text-rose-200" />
              <p className="text-base font-black">{toPersianNumbers(today.missed)}</p>
              <p className="text-[10px] font-bold text-slate-100/90">فراموش شده</p>
            </div>
          </div>
          {(today.skipped > 0 || today.missed > 0) && (
            <p className="text-[11px] text-slate-100/90 font-medium mt-3 bg-white/10 rounded-xl px-3 py-2">
              {today.missed > today.skipped
                ? 'دوزهای «فراموش‌شده» امروز بیشتر از موارد «رد شده»‌ست — احتمالاً یادآورها را باید بررسی کرد.'
                : 'بیشتر دوزهای مصرف‌نشده‌ی امروز آگاهانه «رد شده»‌اند، نه فراموش.'}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl rounded-[32px] p-6 border border-white/50 dark:border-slate-700/50 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-black text-slate-800 dark:text-slate-100 text-base sm:text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>نمودار مصرف/رد/فراموشی در هفته جاری</span>
          </h3>
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-full">هدف استاندارد: بالای ۹۰٪</span>
        </div>
        <div className="h-64 sm:h-72 w-full flex items-center justify-center -mx-3 sm:-mx-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 10, right: 4, left: 4, bottom: 0 }} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} vertical={false} />
              <XAxis dataKey="name" interval={0} tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'Vazirmatn' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'Vazirmatn' }} tickFormatter={(val) => `${toPersianNumbers(val)}٪`} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: '16px', border: 'none', fontFamily: 'Vazirmatn', fontSize: '13px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)' }} formatter={(value: any, name: any) => [`${toPersianNumbers(value)}٪`, name]} labelStyle={{ fontWeight: 'bold', color: '#38bdf8', marginBottom: '4px' }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Vazirmatn' }} />
              <Bar dataKey="takenRate" name="مصرف شده" stackId="status" fill="#10b981" radius={[0, 0, 0, 0]} barSize={32} />
              <Bar dataKey="skippedRate" name="رد شده" stackId="status" fill="#f59e0b" radius={[0, 0, 0, 0]} barSize={32} />
              <Bar dataKey="missedRate" name="فراموش شده" stackId="status" fill="#f43f5e" radius={[12, 12, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl rounded-[32px] p-6 border border-white/50 dark:border-slate-700/50 shadow-xl">
        <h3 className="font-black text-slate-800 dark:text-slate-100 text-base sm:text-lg mb-1 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>روند رد شدن در برابر فراموشی دوزها</span>
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">«رد شده» یعنی تصمیم آگاهانه‌ی شما بوده؛ «فراموش شده» یعنی یادآوری/دستیار اپ کار نکرده.</p>
        <div className="h-48 w-full flex items-center justify-center -mx-3 sm:-mx-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weekly} margin={{ top: 10, right: 4, left: 4, bottom: 0 }} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.2} />
              <XAxis dataKey="name" interval={0} tick={{ fontSize: 9, fill: '#64748b', fontFamily: 'Vazirmatn' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value: any, name: any) => [`${toPersianNumbers(value)}٪`, name]} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Vazirmatn' }} />
              <Area type="monotone" dataKey="skippedRate" name="رد شده" stroke="#f59e0b" strokeWidth={3} fill="#f59e0b" fillOpacity={0.15} />
              <Area type="monotone" dataKey="missedRate" name="فراموش شده" stroke="#f43f5e" strokeWidth={3} fill="#f43f5e" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {(weekSkippedTotal > 0 || weekMissedTotal > 0) && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-3">
            این هفته: {toPersianNumbers(weekSkippedTotal)} مورد رد شده، {toPersianNumbers(weekMissedTotal)} مورد فراموش شده.{' '}
            {weekMissedTotal > weekSkippedTotal ? 'روند فراموشی بالاتره — احتمالاً باید یادآورها را بررسی کنید.' : 'بیشتر موارد آگاهانه رد شده‌اند، نه فراموش.'}
          </p>
        )}
      </div>
    </div>
  );
};
