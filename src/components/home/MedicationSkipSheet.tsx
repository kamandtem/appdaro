import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SkipReason } from '../../types';
import {
  X,
  ChevronLeft,
  ChevronRight,
  AlarmClockOff,
  Frown,
  Stethoscope,
  PackageX,
  Search
} from 'lucide-react';

interface MedicationSkipSheetProps {
  open: boolean;
  medName: string;
  onClose: () => void;
  /** «تغییر زمان یادآور» — پنل ویرایش دارو مستقیماً روی بخش زمان مصرف باز می‌شود. */
  onConfirmTiming: () => void;
  /** «دارو را از چرخه یادآوری خارج کن» */
  onConfirmSideEffects: () => void;
  /** «خارج کردن از چرخه یادآوری» */
  onConfirmDoctorAdvice: () => void;
  /** «انتقال دارو به وضعیت در انتظار تهیه» */
  onConfirmOutOfStock: () => void;
}

const REASONS: { id: SkipReason; label: string; icon: React.ElementType }[] = [
  { id: 'timing', label: 'زمان مصرف مناسب نیست', icon: AlarmClockOff },
  { id: 'side_effects', label: 'حس می‌کنم دارو عوارض سنگینی دارد', icon: Frown },
  { id: 'doctor_advice', label: 'طبق توصیه پزشک مصرف نمی‌کنم', icon: Stethoscope },
  { id: 'out_of_stock', label: 'دارو تمام شده بود', icon: PackageX }
];

/** Bottom Sheet «چرا این دارو را مصرف نکردید؟» — از کارت فعال خانه با دکمه‌ی
 *  کوچک «مصرف نکردم» باز می‌شود. پشت آن کل صفحه بلر می‌شود؛ با هر اقدام نهایی
 *  (یا با دکمه‌ی بازگشت/بستن) خودش را می‌بندد و کاربر دوباره همان کارت/صفحه‌ی
 *  خانه را می‌بیند — هیچ ناوبری جداگانه‌ای اضافه نمی‌کند. */
export const MedicationSkipSheet: React.FC<MedicationSkipSheetProps> = ({
  open,
  medName,
  onClose,
  onConfirmTiming,
  onConfirmSideEffects,
  onConfirmDoctorAdvice,
  onConfirmOutOfStock
}) => {
  const [reason, setReason] = useState<SkipReason | null>(null);

  // هر بار سیت از نو باز می‌شود، همیشه از لیست دلایل شروع کن — نه از جایی که
  // دفعه‌ی قبل رهایش کرده بودیم.
  useEffect(() => {
    if (open) setReason(null);
  }, [open]);

  if (!open) return null;

  const selected = REASONS.find(r => r.id === reason);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* بقیه‌ی صفحه بلر می‌شود */}
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-md" />

      {/*
        سیت به‌جای چسبیدن به لبه‌ی پایین صفحه، با یک فاصله (pb) از پایین شناور
        می‌ماند تا زیر نوار ناوبری شناور پایین (Navigation.tsx: bottom-4 + ارتفاعش)
        قایم نشود؛ به همین خاطر هر چهار گوشه‌اش هم گرد است، نه فقط بالا.
      */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md mx-3 sm:mx-4 mb-[calc(6.75rem+env(safe-area-inset-bottom))] bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl shadow-slate-900/25 dark:shadow-black/50 ring-1 ring-black/5 dark:border dark:border-slate-800 max-h-[75vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
      >
        {/* دستگیره */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* هدر: بازگشت (فقط داخل صفحه‌ی جزئیات) + بستن */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-1 pb-1">
          {reason ? (
            <button
              type="button"
              onClick={() => setReason(null)}
              className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-bold text-xs hover:text-slate-700 dark:hover:text-slate-200 transition-colors -mr-1.5 py-1 pr-1.5 pl-2"
            >
              <ChevronRight className="w-4 h-4" />
              بازگشت
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            title="بستن"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* برند: عنوان مشکی «برنامه داروتو» + نشان سبز «بررسی علت»، زیرش
            زیرعنوان خاکستری «یادآور دارو» — الگو از کارت مرجع (عنوان مشکی +
            نشان سبز POPULAR بالای کارت، زیرنویس خاکستری زیرش). */}
        {!reason && (
          <div className="px-5 sm:px-6 pb-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-black text-slate-900 dark:text-white text-base sm:text-lg">
                برنامه داروتو
              </h2>
              <span className="flex items-center gap-1 shrink-0 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm shadow-emerald-500/30">
                <Search className="w-3 h-3" strokeWidth={2.5} />
                بررسی علت
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
              یادآور دارو
            </p>
          </div>
        )}

        <div className="px-5 sm:px-6 pb-8">
          {!reason ? (
            <>
              <h3 className="font-black text-slate-800 dark:text-white text-base sm:text-lg text-center mb-5">
                چرا این دارو را مصرف نکردید؟
              </h3>

              <div className="space-y-2.5">
                {REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReason(r.id)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/70 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-50/60 dark:hover:bg-teal-950/30 active:scale-[0.99] transition-all text-right"
                  >
                    <span className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-300">
                      <r.icon className="w-5 h-5" strokeWidth={2.25} />
                    </span>
                    <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-xs sm:text-sm">
                      {r.label}
                    </span>
                    <ChevronLeft className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center pt-1 animate-in fade-in duration-150">
              <div
                className={`w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                  reason === 'timing'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-500'
                    : reason === 'side_effects'
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-500'
                    : reason === 'doctor_advice'
                    ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-600'
                    : 'bg-purple-50 dark:bg-purple-950/40 text-purple-500'
                }`}
              >
                {selected && <selected.icon className="w-7 h-7" strokeWidth={2.25} />}
              </div>

              <h4 className="font-black text-slate-800 dark:text-white text-sm sm:text-base mb-2.5">
                {selected?.label}
              </h4>

              {reason === 'timing' && (
                <>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                    می‌توانید ساعت یادآوری این دارو را تغییر دهید تا در زمان مناسب‌تری به شما یادآوری شود.
                  </p>
                  <button
                    type="button"
                    onClick={onConfirmTiming}
                    className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/30 font-black text-sm hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    تغییر زمان یادآور
                  </button>
                </>
              )}

              {reason === 'side_effects' && (
                <>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium mb-6 leading-relaxed">
                    اگر این دارو باعث ایجاد عوارض شده است، بهتر است قبل از قطع یا تغییر مصرف، با پزشک یا داروساز مشورت کنید.
                  </p>
                  <button
                    type="button"
                    onClick={onConfirmSideEffects}
                    className="w-full py-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-300 rounded-2xl font-black text-sm hover:bg-rose-100 dark:hover:bg-rose-950 active:scale-95 transition-all"
                  >
                    دارو را از چرخه یادآوری خارج کن
                  </button>
                </>
              )}

              {reason === 'doctor_advice' && (
                <>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium mb-6 leading-relaxed">
                    این دارو از چرخه یادآوری خارج خواهد شد.
                  </p>
                  <button
                    type="button"
                    onClick={onConfirmDoctorAdvice}
                    className="w-full py-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-300 rounded-2xl font-black text-sm hover:bg-rose-100 dark:hover:bg-rose-950 active:scale-95 transition-all"
                  >
                    خارج کردن از چرخه یادآوری
                  </button>
                </>
              )}

              {reason === 'out_of_stock' && (
                <>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium mb-6 leading-relaxed">
                    دارو موقتاً از چرخه یادآوری خارج می‌شود تا زمانی که دوباره آن را تهیه کنید.
                  </p>
                  <button
                    type="button"
                    onClick={onConfirmOutOfStock}
                    className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/30 font-black text-sm hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    انتقال دارو به وضعیت «در انتظار تهیه»
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
