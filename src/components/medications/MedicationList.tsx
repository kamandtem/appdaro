import React, { useState } from 'react';
import { Medication, MedicationForm } from '../../types';
import { toPersianNumbers } from '../../utils/persian';
import { Pill, Droplet, Syringe, Pipette, Bandage, AlertTriangle, Plus, Trash2, Pencil, CheckCircle, Search, Filter, Clock, X, ShieldAlert, PackageX, ChevronDown } from 'lucide-react';
import { MedicationInteractionCheckModal } from './MedicationInteractionCheckModal';
import { toEnglishNumbers } from '../../utils/persian';

const parseTimeToMinutes = (time: string): number | null => {
  const [hour, minute] = toEnglishNumbers(time).split(':').map(Number);
  if (!Number.isFinite(hour)) return null;
  return hour * 60 + (Number.isFinite(minute) ? minute : 0);
};

interface MedicationListProps {
  medications: Medication[];
  onToggleActive: (id: string) => void;
  onDeleteMedication: (id: string) => void;
  onEditMedication: (med: Medication) => void;
  onRefillStock: (id: string, amount: number) => void;
  onOpenAddWizard: () => void;
}

// Same icon set used in the add-medication wizard's type picker, so a medication's
// icon looks identical everywhere in the app (no emoji here).
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

// برچسب کوتاه دلیل غیرفعال شدن — فقط وقتی دارو غیرفعال است و از طریق «مصرف
// نکردم» با یک دلیل مشخص خارج از چرخه شده (نه خاموش‌کردن دستی).
const pauseReasonLabel = (reason: NonNullable<Medication['pauseReason']>): string => {
  switch (reason) {
    case 'side_effects': return 'به دلیل عوارض دارو';
    case 'doctor_advice': return 'به توصیه پزشک';
    case 'awaiting_refill': return 'در انتظار تهیه مجدد';
    default: return '';
  }
};

// نزدیک‌ترین نوبت بعدیِ مصرف دارو نسبت به همین لحظه — اگر همه‌ی نوبت‌های امروز
// گذشته باشند، به اولین نوبت (فردا) برمی‌گردد.
const getNextDoseTime = (med: Medication): string | null => {
  if (!med.times || med.times.length === 0) return null;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const parsed = med.times
    .map(t => ({ t, m: parseTimeToMinutes(t) }))
    .filter((x): x is { t: string; m: number } => x.m !== null)
    .sort((a, b) => a.m - b.m);
  if (parsed.length === 0) return null;
  const next = parsed.find(x => x.m >= nowMinutes) ?? parsed[0];
  return next.t;
};

export const MedicationList: React.FC<MedicationListProps> = ({
  medications,
  onToggleActive,
  onDeleteMedication,
  onEditMedication,
  onRefillStock,
  onOpenAddWizard
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterForm, setFilterForm] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<Medication | null>(null);
  const [showInteractionCheck, setShowInteractionCheck] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredMeds = medications.filter(med => {
    const matchesSearch = med.name.toLowerCase().includes(searchTerm.toLowerCase()) || med.notes?.toLowerCase().includes(searchTerm.toLowerCase()) || med.reason?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesForm = filterForm === 'all' || med.form === filterForm;
    return matchesSearch && matchesForm;
  });

  const lowStockCount = medications.filter(m => m.remainingCount <= m.alertThreshold).length;

  return (
    <div className="w-full max-w-2xl mx-auto py-4 px-3 sm:px-4 pb-24">
      {/* Top Banner & Title - centered */}
      <div className="flex flex-col items-center text-center gap-4 mb-6">
        <div>
          <h2 className="font-black text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2 text-xl sm:text-2xl">
            <Pill className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>داروهای من و مدیریت موجودی</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            مشاهده لیست داروها، تنظیم یادآورها و کنترل موجودی بسته‌ها
          </p>
        </div>

        <div className="flex items-center justify-center gap-2.5 flex-wrap">
          <button
            onClick={onOpenAddWizard}
            className="flex items-center justify-center gap-2 bg-gradient-to-tr from-emerald-600 via-teal-500 to-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all px-4 py-2.5 text-xs sm:text-sm"
          >
            <Plus className="w-5 h-5" />
            <span>افزودن داروی جدید</span>
          </button>

          <button
            onClick={() => setShowInteractionCheck(true)}
            className="flex items-center justify-center gap-2 bg-white/70 dark:bg-slate-900/60 border border-violet-200 dark:border-violet-900/50 text-violet-600 dark:text-violet-400 font-bold rounded-2xl shadow-md hover:scale-105 active:scale-95 transition-all px-4 py-2.5 text-xs sm:text-sm"
          >
            <ShieldAlert className="w-5 h-5" />
            <span>بررسی تداخل داروها</span>
          </button>
        </div>
      </div>

      {showInteractionCheck && (
        <MedicationInteractionCheckModal
          medications={medications}
          onClose={() => setShowInteractionCheck(false)}
        />
      )}

      {/* Inventory Alert Notice Box */}
      {lowStockCount > 0 && (
        <div className="bg-amber-50/80 dark:bg-amber-950/60 backdrop-blur-md border-2 border-amber-300 dark:border-amber-800 rounded-[24px] p-4 mb-6 shadow-md flex items-start gap-3 animate-pulse-glow">
          <div className="p-2.5 rounded-xl bg-amber-500 text-white shrink-0 shadow-xs">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-black text-amber-900 dark:text-amber-200 text-sm sm:text-base">
              هشدار موجودی دارو ({toPersianNumbers(lowStockCount)} دارو رو به اتمام است!)
            </h4>
            <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 font-medium mt-1">
              موجودی برخی از داروهای شما تا کمتر از ۳ روز دیگر تمام می‌شود. لطفاً با زدن دکمه «+۱۰ شارژ مجدد» یا تهیه از داروخانه، موجودی را بروزرسانی کنید.
            </p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="جستجوی نام دارو یا علت مصرف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-3 py-2.5 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-white/60 dark:border-slate-700/60 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 shadow-xs transition-all"
          />
        </div>

        <div className="grid grid-cols-6 gap-1.5 sm:w-fit">
          {(['all', 'قرص', 'شربت', 'آمپول', 'قطره', 'پماد'] as const).map(form => {
            const Icon = form === 'all' ? Filter : formIcon(form);
            const isActive = filterForm === form;
            return (
              <button
                key={form}
                onClick={() => setFilterForm(form)}
                title={form === 'all' ? 'همه داروها' : form}
                className={`flex items-center justify-center py-2.5 rounded-2xl transition-all backdrop-blur-sm ${
                  isActive
                    ? 'bg-gradient-to-tr from-teal-600 to-emerald-500 text-white shadow-md'
                    : 'bg-white/40 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 border border-white/50 dark:border-slate-700/50 hover:bg-white/60 shadow-2xs'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={2.25} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Medications List */}
      {filteredMeds.length === 0 ? (
        <div className="bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl rounded-[32px] p-8 text-center border border-white/50 dark:border-slate-700/50 shadow-lg">
          <Pill className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
          <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">دارویی پیدا نشد</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">می‌توانید با زدن دکمه «افزودن داروی جدید» داروها را اضافه کنید.</p>
        </div>
      ) : (
        <div className="space-y-3.5 sm:space-y-4">
          {filteredMeds.map(med => {
            const isLowStock = med.remainingCount <= med.alertThreshold;
            const isExpanded = expandedIds.has(med.id);
            const nextDoseTime = getNextDoseTime(med);

            return (
              <div
                key={med.id}
                className={`group bg-white/50 dark:bg-slate-800/50 backdrop-blur-xl rounded-[22px] border transition-all shadow-xl hover:shadow-2xl hover:bg-white/70 dark:hover:bg-slate-800/70 overflow-hidden ${
                  !med.isActive
                    ? 'opacity-60 border-white/30 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40'
                    : isLowStock
                    ? 'border-amber-400 dark:border-amber-700 ring-1 ring-amber-300/50'
                    : 'border-white/50 dark:border-slate-700/40 hover:border-teal-400'
                }`}
              >
                {/* Accordion header — collapsed summary row, always visible */}
                <button
                  type="button"
                  onClick={() => toggleExpand(med.id)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-right"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Gradient squircle icon - matching the home panel card style */}
                    {med.photoUrl ? (
                      <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white/80 dark:border-teal-700 shadow-md shrink-0 bg-slate-100 dark:bg-slate-800">
                        <img src={med.photoUrl} alt={med.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center shadow-md text-white shrink-0">
                        {(() => {
                          const Icon = formIcon(med.form);
                          return <Icon className="w-5 h-5" strokeWidth={2.25} />;
                        })()}
                      </div>
                    )}

                    <div className="min-w-0 text-right">
                      <h3 className="font-black text-slate-900 dark:text-white truncate text-base sm:text-lg">
                        {med.name}
                      </h3>
                      {nextDoseTime && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                          <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          نوبت بعدی: {toPersianNumbers(nextDoseTime)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 ${
                        med.isActive
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300'
                          : med.pauseReason === 'awaiting_refill'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {med.isActive ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : med.pauseReason === 'awaiting_refill' ? (
                        <PackageX className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {med.isActive
                          ? 'فعال'
                          : med.pauseReason === 'awaiting_refill'
                          ? 'در انتظار تهیه'
                          : 'غیرفعال'}
                      </span>
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Accordion body — full details, only rendered when expanded */}
                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-5 sm:pb-6 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-700/80 flex items-start justify-between gap-3">
                      {/* Schedule & Dose pill rows, matching the home panel card rows */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="flex items-center gap-1 bg-white/70 dark:bg-slate-900/50 rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-white/70 dark:border-slate-700/50">
                          <Pill className="w-3.5 h-3.5 text-emerald-500" />
                          {med.dose}
                        </span>
                        <span className="flex items-center gap-1 bg-white/70 dark:bg-slate-900/50 rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-white/70 dark:border-slate-700/50">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          {med.times.map(t => toPersianNumbers(t)).join('، ')}
                        </span>
                        {med.reason && (
                          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            علت مصرف: {med.reason}
                          </span>
                        )}
                      </div>

                      {/* Active / Inactive / Awaiting-refill Switch */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <button
                          onClick={() => onToggleActive(med.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                            med.isActive
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300'
                              : med.pauseReason === 'awaiting_refill'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                          }`}
                          title={med.pauseReason === 'awaiting_refill' ? 'با تهیه مجدد دارو، اینجا بزنید تا دوباره فعال شود' : undefined}
                        >
                          {med.isActive ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : med.pauseReason === 'awaiting_refill' ? (
                            <PackageX className="w-3.5 h-3.5" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {med.isActive
                              ? 'فعال'
                              : med.pauseReason === 'awaiting_refill'
                              ? 'در انتظار تهیه'
                              : 'غیرفعال'}
                          </span>
                        </button>
                        {!med.isActive && med.pauseReason && med.pauseReason !== 'awaiting_refill' && (
                          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            {pauseReasonLabel(med.pauseReason)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Inventory Status Bar & Refill button */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          موجودی باقیمانده:
                        </span>
                        <span className={`text-sm font-black px-2.5 py-0.5 rounded-lg ${
                          isLowStock
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 animate-pulse'
                            : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {toPersianNumbers(med.remainingCount)} از {toPersianNumbers(med.totalCount)} عدد
                        </span>

                        {isLowStock && (
                          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            تا {toPersianNumbers(Math.max(1, Math.floor(med.remainingCount / 2)))} روز دیگر تمام می‌شود!
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => onRefillStock(med.id, 10)}
                          className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-bold transition-all shadow-2xs"
                          title="افزودن ۱۰ عدد به موجودی دارو"
                        >
                          +۱۰ شارژ مجدد
                        </button>

                        <button
                          onClick={() => onEditMedication(med)}
                          className="p-1.5 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-xl transition-colors"
                          title="ویرایش دارو"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setDeleteTarget(med)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                          title="حذف دارو"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-xs p-6 text-center border border-white/60 dark:border-slate-800 relative">
            <button
              onClick={() => setDeleteTarget(null)}
              className="absolute top-4 left-4 p-1.5 text-slate-300 hover:text-slate-500 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="font-black text-slate-800 dark:text-white text-lg mb-2">
              حذف {deleteTarget.name}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              آیا از حذف این دارو اطمینان دارید؟ این عملیات قابل بازگشت نیست.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                خیر
              </button>
              <button
                onClick={() => {
                  onDeleteMedication(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 text-white font-black shadow-lg shadow-rose-500/30 hover:scale-[1.02] active:scale-95 transition-all"
              >
                بله
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
