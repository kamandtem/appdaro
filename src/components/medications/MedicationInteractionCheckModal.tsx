import React, { useMemo } from 'react';
import { ShieldAlert, X, AlertTriangle, Info, Sparkles, HelpCircle } from 'lucide-react';
import { Medication } from '../../types';
import { toPersianNumbers } from '../../utils/persian';
import { checkUserMedicationInteractions } from '../../utils/interactionMatcher';
import { ResultRow } from '../interactions/InteractionsView';
import { DrugInteractionResult } from '../../data/interactionsData';

interface MedicationInteractionCheckModalProps {
  medications: Medication[];
  onClose: () => void;
}

/**
 * مودالی که تداخلات دارویی بین داروهای واقعاً ثبت‌شده‌ی کاربر (نه انتخاب دستی
 * دو دارو مثل تب «تداخلات») را نمایش می‌دهد. این مودال جایگزین تب دستی تداخلات
 * نیست و کاملاً مستقل از آن کار می‌کند.
 */
export const MedicationInteractionCheckModal: React.FC<MedicationInteractionCheckModalProps> = ({
  medications,
  onClose
}) => {
  // فقط داروهای فعال کاربر بررسی می‌شوند؛ داروهای غیرفعال درحال‌حاضر مصرف نمی‌شوند.
  const activeMedications = useMemo(() => medications.filter(m => m.isActive), [medications]);

  const { matched, unmatched, interactions } = useMemo(
    () => checkUserMedicationInteractions(activeMedications),
    [activeMedications]
  );

  const dangerResults: DrugInteractionResult[] = interactions
    .filter(i => i.severity === 'danger')
    .map(i => ({
      id: i.id,
      kind: 'drug' as const,
      label: `${i.medA.name} + ${i.medB.name}`,
      severity: i.severity,
      summary: i.summary,
      description: i.description,
      advice: i.advice
    }));

  const cautionResults: DrugInteractionResult[] = interactions
    .filter(i => i.severity === 'caution')
    .map(i => ({
      id: i.id,
      kind: 'drug' as const,
      label: `${i.medA.name} + ${i.medB.name}`,
      severity: i.severity,
      summary: i.summary,
      description: i.description,
      advice: i.advice
    }));

  const canCheck = activeMedications.length >= 2;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-lg border border-white/60 dark:border-slate-800 relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-5 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-md shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-slate-100 text-base sm:text-lg">
                بررسی تداخل داروهای من
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                بررسی خودکار داروهای فعال ثبت‌شده در برنامه
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 text-slate-300 hover:text-slate-500 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 pb-5 space-y-4">
          {/* Disclaimer */}
          <div className="flex items-start gap-2.5 bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 rounded-2xl p-3.5">
            <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-sky-800 dark:text-sky-200 leading-5 font-medium">
              این بررسی فقط جنبه آموزشی و اطلاع‌رسانی دارد، شامل همه تداخلات ممکن نیست و جایگزین مشاوره با پزشک یا داروساز نمی‌شود.
            </p>
          </div>

          {!canCheck ? (
            <div className="text-center py-8 bg-white/40 dark:bg-slate-800/40 rounded-[28px] border border-white/50 dark:border-slate-700/50">
              <Sparkles className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                برای بررسی تداخل حداقل به دو داروی فعال نیاز است.
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                داروهای فعال بیشتری اضافه کنید تا بتوانیم تداخل بین آن‌ها را بررسی کنیم.
              </p>
            </div>
          ) : (
            <>
              {interactions.length === 0 ? (
                <div className="text-center py-8 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-[28px] border border-emerald-200 dark:border-emerald-900/50">
                  <Sparkles className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    تداخل شناخته‌شده‌ای بین داروهای فعلی شما یافت نشد.
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    همچنان پیش از هرگونه تغییر در مصرف دارو با پزشک یا داروساز مشورت کنید.
                  </p>
                </div>
              ) : (
                <>
                  {dangerResults.length > 0 && (
                    <div className="space-y-2.5">
                      <h4 className="font-black text-rose-600 dark:text-rose-400 text-sm flex items-center gap-1.5 px-1">
                        <AlertTriangle className="w-4 h-4" />
                        تداخلات خطرناک ({toPersianNumbers(dangerResults.length)})
                      </h4>
                      {dangerResults.map(r => <ResultRow key={r.id} result={r} />)}
                    </div>
                  )}
                  {cautionResults.length > 0 && (
                    <div className="space-y-2.5">
                      <h4 className="font-black text-amber-600 dark:text-amber-400 text-sm flex items-center gap-1.5 px-1">
                        <Info className="w-4 h-4" />
                        موارد نیازمند احتیاط ({toPersianNumbers(cautionResults.length)})
                      </h4>
                      {cautionResults.map(r => <ResultRow key={r.id} result={r} />)}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Unmatched medications notice */}
          {unmatched.length > 0 && (
            <div className="flex items-start gap-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5">
              <HelpCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11.5px] text-slate-600 dark:text-slate-300 leading-5 font-bold">
                  {toPersianNumbers(unmatched.length)} دارو در دیتابیس تداخلات پیدا نشد و بررسی نشد:
                </p>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-5 mt-0.5">
                  {unmatched.map(m => m.name).join('، ')}
                </p>
              </div>
            </div>
          )}

          {matched.length > 0 && (
            <p className="text-[10.5px] text-slate-400 text-center">
              {toPersianNumbers(matched.length)} داروی فعال از {toPersianNumbers(activeMedications.length)} دارو بررسی شد.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
