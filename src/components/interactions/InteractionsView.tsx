import React, { useMemo, useState } from 'react';
import {
  ShieldAlert,
  Search,
  X,
  AlertTriangle,
  Info,
  Pill,
  UtensilsCrossed,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import {
  DrugInfo,
  searchDrugs,
  getInteractionsForDrug,
  DrugInteractionResult,
  DRUG_DRUG_INTERACTIONS,
  DRUG_FOOD_INTERACTIONS,
  getDrugById
} from '../../data/interactionsData';
import { toPersianNumbers } from '../../utils/persian';

// چند داروی پرمصرف برای دسترسی سریع در حالت مرور
const QUICK_PICK_IDS = ['warfarin', 'ibuprofen', 'tramadol', 'alprazolam', 'sertraline'];

export interface ResultRowProps {
  result: DrugInteractionResult;
}

export const ResultRow: React.FC<ResultRowProps> = ({ result }) => {
  const [expanded, setExpanded] = useState(false);
  const isDanger = result.severity === 'danger';

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all ${
        isDanger
          ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
          : 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
      }`}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 p-3.5 text-right"
      >
        <div
          className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
            isDanger
              ? 'bg-rose-500 text-white'
              : 'bg-amber-400 text-white'
          }`}
        >
          {result.kind === 'food' ? <UtensilsCrossed className="w-4 h-4" /> : <Pill className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${isDanger ? 'bg-rose-500' : 'bg-amber-400'}`}
            >
              <span className="sr-only">{isDanger ? 'خطرناک' : 'نیازمند احتیاط'}</span>
            </span>
            <span className="font-black text-slate-800 dark:text-slate-100 text-sm">
              {result.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 truncate">
            {result.summary}
          </p>
        </div>

        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-2 animate-in fade-in duration-150">
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-3 border border-white/60 dark:border-slate-800">
            <p className="text-[11px] font-bold text-slate-400 mb-1">چرا خطرناک است؟</p>
            <p className="text-[13px] text-slate-700 dark:text-slate-200 leading-6">{result.description}</p>
          </div>
          <div className="bg-white/70 dark:bg-slate-900/50 rounded-xl p-3 border border-white/60 dark:border-slate-800">
            <p className="text-[11px] font-bold text-slate-400 mb-1">توصیه</p>
            <p className="text-[13px] text-slate-700 dark:text-slate-200 leading-6">{result.advice}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export interface InteractionsViewProps {
  /** True until the user has dismissed the disclaimer popup for the very first time
   *  they open this section. */
  showDisclaimerPopup?: boolean;
  /** Called when the user dismisses the one-time disclaimer popup. */
  onDismissDisclaimerPopup?: () => void;
}

export const InteractionsView: React.FC<InteractionsViewProps> = ({
  showDisclaimerPopup,
  onDismissDisclaimerPopup
}) => {
  const [query, setQuery] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<DrugInfo | null>(null);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    return searchDrugs(query).slice(0, 8);
  }, [query]);

  const results = useMemo(() => {
    if (!selectedDrug) return [];
    return getInteractionsForDrug(selectedDrug.id);
  }, [selectedDrug]);

  const dangerResults = results.filter(r => r.severity === 'danger');
  const cautionResults = results.filter(r => r.severity === 'caution');

  const handlePick = (drug: DrugInfo) => {
    setSelectedDrug(drug);
    setQuery('');
  };

  const handleClear = () => {
    setSelectedDrug(null);
    setQuery('');
  };

  return (
    <div className="w-full max-w-3xl mx-auto py-4 px-3 sm:px-4 pb-24 space-y-5">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-3">
        <div>
          <h2 className="font-black text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2 text-xl sm:text-2xl">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            <span>تداخلات دارویی</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            یک دارو را انتخاب کنید تا داروها، غذاها و نوشیدنی‌هایی که نباید همراه آن مصرف شوند نمایش داده شود
          </p>
        </div>
      </div>

      {/* Search Box */}
      <div className="relative">
        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/60 dark:border-slate-800 shadow-lg flex items-center gap-2 px-4 py-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              if (selectedDrug) setSelectedDrug(null);
            }}
            placeholder="نام داروی خود را جست‌وجو کنید (مثلاً وارفارین)"
            className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-medium min-w-0"
          />
          {(query || selectedDrug) && (
            <button onClick={handleClear} className="shrink-0 p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="absolute z-20 mt-1.5 w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
            {suggestions.map(d => (
              <button
                key={d.id}
                onClick={() => handlePick(d)}
                className="w-full text-right px-4 py-2.5 flex items-center justify-between hover:bg-teal-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0"
              >
                <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{d.name}</span>
                <span className="text-[10px] text-slate-400 font-medium">{d.category}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedDrug ? (
        <div className="space-y-4">
          {/* Selected drug card */}
          <div className="bg-gradient-to-tr from-teal-600 via-emerald-600 to-cyan-600 rounded-[28px] p-5 text-white shadow-xl shadow-teal-500/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <button
              type="button"
              onClick={handleClear}
              title="بستن و انتخاب داروی دیگر"
              className="absolute top-3 left-3 z-10 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <Pill className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg">{selectedDrug.name}</h3>
                <p className="text-xs text-teal-50/90 font-medium">{selectedDrug.category}</p>
              </div>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-10 bg-white/40 dark:bg-slate-900/40 rounded-[28px] border border-white/50 dark:border-slate-800">
              <Sparkles className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                در حال حاضر تداخل رایج و شناخته‌شده‌ای برای این دارو در این لیست ثبت نشده است.
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                همیشه پیش از مصرف هم‌زمان چند دارو با پزشک یا داروساز مشورت کنید.
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
        </div>
      ) : (
        <div className="space-y-5">
          {/* Quick pick chips */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 px-1 block">دسترسی سریع به داروهای پرمصرف</span>
            <div className="flex flex-wrap gap-2">
              {QUICK_PICK_IDS.map(id => {
                const d = getDrugById(id);
                if (!d) return null;
                return (
                  <button
                    key={id}
                    onClick={() => handlePick(d)}
                    className="px-3.5 py-2 rounded-full bg-white/70 dark:bg-slate-900/60 border border-white/60 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-teal-50 dark:hover:bg-slate-800 hover:border-teal-200 transition-all"
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Browse all - collapsible sections */}
          <BrowseAllSection />
        </div>
      )}

      {/* Disclaimer — moved to the bottom of the page, below the caution/precaution
          sections above (whether from a selected drug's results or the browse-all list). */}
      <div className="flex items-start gap-2.5 bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 rounded-2xl p-3.5">
        <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
        <p className="text-[11.5px] text-sky-800 dark:text-sky-200 leading-5 font-medium">
          این بخش فقط جنبه آموزشی و اطلاع‌رسانی دارد، شامل همه تداخلات ممکن نیست و جایگزین مشاوره با پزشک یا داروساز نمی‌شود. پیش از هرگونه تغییر در مصرف دارو حتماً با پزشک خود مشورت کنید.
        </p>
      </div>

      {/* One-time popup — shown only the very first time the user opens this section. */}
      {showDisclaimerPopup && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-sm p-6 text-center border border-white/60 dark:border-slate-800">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-500 flex items-center justify-center">
              <Info className="w-7 h-7" />
            </div>
            <h3 className="font-black text-slate-800 dark:text-white text-lg mb-2">
              نکته مهم
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-6">
              این بخش فقط جنبه آموزشی و اطلاع‌رسانی دارد، شامل همه تداخلات ممکن نیست و جایگزین مشاوره با پزشک یا داروساز نمی‌شود. پیش از هرگونه تغییر در مصرف دارو حتماً با پزشک خود مشورت کنید.
            </p>
            <button
              onClick={onDismissDisclaimerPopup}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-black shadow-lg shadow-emerald-500/30 hover:scale-[1.02] active:scale-95 transition-all"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const BrowseAllSection: React.FC = () => {
  const [open, setOpen] = useState<'danger' | 'caution' | null>(null);

  const dangerItems: DrugInteractionResult[] = useMemo(() => [
    ...DRUG_DRUG_INTERACTIONS.filter(i => i.severity === 'danger').map(i => ({
      id: i.id,
      kind: 'drug' as const,
      label: `${getDrugById(i.a)?.name ?? i.a} + ${getDrugById(i.b)?.name ?? i.b}`,
      severity: i.severity,
      summary: i.summary,
      description: i.description,
      advice: i.advice
    })),
    ...DRUG_FOOD_INTERACTIONS.filter(i => i.severity === 'danger').map(i => ({
      id: i.id,
      kind: 'food' as const,
      label: `${getDrugById(i.drug)?.name ?? i.drug} + ${i.item}`,
      severity: i.severity,
      summary: i.summary,
      description: i.description,
      advice: i.advice
    }))
  ], []);

  const cautionItems: DrugInteractionResult[] = useMemo(() => [
    ...DRUG_DRUG_INTERACTIONS.filter(i => i.severity === 'caution').map(i => ({
      id: i.id,
      kind: 'drug' as const,
      label: `${getDrugById(i.a)?.name ?? i.a} + ${getDrugById(i.b)?.name ?? i.b}`,
      severity: i.severity,
      summary: i.summary,
      description: i.description,
      advice: i.advice
    })),
    ...DRUG_FOOD_INTERACTIONS.filter(i => i.severity === 'caution').map(i => ({
      id: i.id,
      kind: 'food' as const,
      label: `${getDrugById(i.drug)?.name ?? i.drug} + ${i.item}`,
      severity: i.severity,
      summary: i.summary,
      description: i.description,
      advice: i.advice
    }))
  ], []);

  return (
    <div className="space-y-2.5">
      {/* Danger accordion */}
      <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 overflow-hidden">
        <button
          onClick={() => setOpen(v => (v === 'danger' ? null : 'danger'))}
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <span className="font-black text-rose-600 dark:text-rose-400 text-sm flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            تداخلات خطرناک ({toPersianNumbers(dangerItems.length)})
          </span>
          <ChevronDown className={`w-4 h-4 text-rose-400 transition-transform ${open === 'danger' ? 'rotate-180' : ''}`} />
        </button>
        {open === 'danger' && (
          <div className="px-3 pb-3 space-y-2">
            {dangerItems.map(r => <ResultRow key={r.id} result={r} />)}
          </div>
        )}
      </div>

      {/* Caution accordion */}
      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden">
        <button
          onClick={() => setOpen(v => (v === 'caution' ? null : 'caution'))}
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <span className="font-black text-amber-600 dark:text-amber-400 text-sm flex items-center gap-1.5">
            <Info className="w-4 h-4" />
            موارد نیازمند احتیاط ({toPersianNumbers(cautionItems.length)})
          </span>
          <ChevronDown className={`w-4 h-4 text-amber-400 transition-transform ${open === 'caution' ? 'rotate-180' : ''}`} />
        </button>
        {open === 'caution' && (
          <div className="px-3 pb-3 space-y-2">
            {cautionItems.map(r => <ResultRow key={r.id} result={r} />)}
          </div>
        )}
      </div>
    </div>
  );
};
