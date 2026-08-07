import React from 'react';
import { ArrowRight, Plus, Tag, ShieldAlert, Info, Sun, Moon, Coffee, Droplets, Milk, Pill } from 'lucide-react';
import { MedicationCatalogEntry, InstructionTag, INSTRUCTION_TAG_LABELS } from '../../data/medicationCatalog';
import { getInteractionsForDrug } from '../../data/interactionsData';
import { ResultRow } from '../interactions/InteractionsView';
import { toPersianNumbers } from '../../utils/persian';

interface MedicationDetailViewProps {
  entry: MedicationCatalogEntry;
  onBack: () => void;
  onAddToMyMeds: () => void;
}

const TAG_ICON: Record<InstructionTag, React.ElementType> = {
  empty_stomach: Pill,
  with_food: Pill,
  in_morning: Sun,
  in_evening: Moon,
  avoid_dairy: Milk,
  avoid_iron_gap: Pill,
  avoid_tea_coffee: Coffee,
  drowsiness: Droplets,
  no_alcohol: ShieldAlert
};

export const MedicationDetailView: React.FC<MedicationDetailViewProps> = ({ entry, onBack, onAddToMyMeds }) => {
  const interactions = getInteractionsForDrug(entry.id);
  const dangerInteractions = interactions.filter(i => i.severity === 'danger');
  const cautionInteractions = interactions.filter(i => i.severity === 'caution');
  const tradeNames = [...(entry.aliases ?? []), ...(entry.enAliases ?? [])];

  return (
    <div className="w-full max-w-2xl mx-auto py-4 px-3 sm:px-4 pb-32">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-bold text-sm mb-4 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        بازگشت به داروخانه
      </button>

      {/* Name + category */}
      <div className="bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 mb-4">
        <h2 className="font-black text-slate-800 dark:text-slate-100 text-xl sm:text-2xl">{entry.fa}</h2>
        <p className="text-sm text-slate-400 dark:text-slate-500 font-medium mt-0.5" dir="ltr">{entry.en}</p>
        <span className="inline-block mt-3 text-[11px] font-bold px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
          {entry.category}
        </span>
      </div>

      {/* Use */}
      <div className="bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 mb-4">
        <h3 className="flex items-center gap-1.5 font-black text-slate-700 dark:text-slate-200 text-sm mb-2">
          <Info className="w-4 h-4 text-teal-500" />
          کاربرد
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-6">{entry.use}</p>
      </div>

      {/* Instruction tags */}
      {entry.instructionTags && entry.instructionTags.length > 0 && (
        <div className="bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 mb-4">
          <h3 className="flex items-center gap-1.5 font-black text-slate-700 dark:text-slate-200 text-sm mb-3">
            <Pill className="w-4 h-4 text-teal-500" />
            راهنمای مصرف
          </h3>
          <div className="flex flex-wrap gap-2">
            {entry.instructionTags.map(tag => {
              const Icon = TAG_ICON[tag];
              return (
                <span
                  key={tag}
                  className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {INSTRUCTION_TAG_LABELS[tag]}
                </span>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 leading-5">
            این موارد راهنمای کلی مصرف است، نه دوز دارو؛ دستور پزشک یا داروساز همیشه در اولویت است.
          </p>
        </div>
      )}

      {/* Warnings / interactions */}
      {(dangerInteractions.length > 0 || cautionInteractions.length > 0) && (
        <div className="mb-4">
          <h3 className="flex items-center gap-1.5 font-black text-slate-700 dark:text-slate-200 text-sm mb-3 px-1">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            تداخلات و هشدارهای مهم
          </h3>
          <div className="space-y-2">
            {dangerInteractions.map(r => <ResultRow key={r.id} result={r} />)}
            {cautionInteractions.slice(0, 5).map(r => <ResultRow key={r.id} result={r} />)}
          </div>
          {cautionInteractions.length > 5 && (
            <p className="text-[11px] text-slate-400 mt-2 px-1">
              {toPersianNumbers(cautionInteractions.length - 5)} مورد احتیاط دیگر هم ثبت شده — برای فهرست کامل به تب «تداخلات» سر بزنید.
            </p>
          )}
        </div>
      )}

      {/* Trade names */}
      {tradeNames.length > 0 && (
        <div className="bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 mb-4">
          <h3 className="flex items-center gap-1.5 font-black text-slate-700 dark:text-slate-200 text-sm mb-3">
            <Tag className="w-4 h-4 text-slate-400" />
            نام‌های تجاری رایج
          </h3>
          <div className="flex flex-wrap gap-2">
            {tradeNames.map(t => (
              <span
                key={t}
                className="text-[12px] font-bold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sticky add-to-my-meds button */}
      <div className="fixed bottom-24 left-0 right-0 z-30 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <button
            onClick={onAddToMyMeds}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-tr from-emerald-600 via-teal-500 to-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-emerald-500/30 hover:scale-[1.02] active:scale-95 transition-all px-5 py-3.5 text-sm"
          >
            <Plus className="w-5 h-5" />
            افزودن به داروهای من
          </button>
        </div>
      </div>
    </div>
  );
};
