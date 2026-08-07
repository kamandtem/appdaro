import React, { useMemo, useState } from 'react';
import { Store, Search, X, ChevronLeft } from 'lucide-react';
import { MEDICATION_CATALOG, searchMedicationCatalog, MedicationCatalogEntry } from '../../data/medicationCatalog';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { toPersianNumbers } from '../../utils/persian';
import { MedicationDetailView } from './MedicationDetailView';

interface PharmacyViewProps {
  /** کاربر از صفحه‌ی جزئیات دارو، «افزودن به داروهای من» را زده است. */
  onAddToMyMeds: (entry: MedicationCatalogEntry) => void;
}

export const PharmacyView: React.FC<PharmacyViewProps> = ({ onAddToMyMeds }) => {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // بدون جست‌وجو: کل دیتابیس (که خودش بر اساس نام فارسی مرتب شده) نمایش داده می‌شود؛
  // با جست‌وجو، از همان موتور جست‌وجوی مشترک با ویزارد افزودن دارو استفاده می‌شود.
  const results: MedicationCatalogEntry[] = useMemo(() => {
    if (!debouncedQuery.trim()) return MEDICATION_CATALOG;
    return searchMedicationCatalog(debouncedQuery, 60);
  }, [debouncedQuery]);

  const selectedEntry = selectedId ? MEDICATION_CATALOG.find(e => e.id === selectedId) ?? null : null;

  if (selectedEntry) {
    return (
      <MedicationDetailView
        entry={selectedEntry}
        onBack={() => setSelectedId(null)}
        onAddToMyMeds={() => onAddToMyMeds(selectedEntry)}
      />
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto py-4 px-3 sm:px-4 pb-24">
      <div className="flex flex-col items-center text-center gap-4 mb-6">
        <div>
          <h2 className="font-black text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2 text-xl sm:text-2xl">
            <Store className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>داروخانه</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            مرجع کامل {toPersianNumbers(MEDICATION_CATALOG.length)} دارو — جست‌وجو کنید یا برای اطلاعات کامل هر دارو ضربه بزنید
          </p>
        </div>
      </div>

      {/* Search box */}
      <div className="relative mb-5">
        <Search className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی نام دارو (فارسی یا انگلیسی)..."
          autoComplete="off"
          className="w-full pr-11 pl-9 py-3 bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results list */}
      <div className="space-y-2">
        {results.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm font-bold">
            دارویی با این نام پیدا نشد
          </div>
        )}
        {results.map(entry => (
          <button
            key={entry.id}
            onClick={() => setSelectedId(entry.id)}
            className="w-full flex items-center justify-between gap-3 bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-right hover:bg-white dark:hover:bg-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-slate-800 dark:text-slate-100 text-sm truncate">
                  {entry.fa}
                </span>
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate" dir="ltr">
                  {entry.en}
                </span>
              </div>
              <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 truncate max-w-full">
                {entry.category}
              </span>
            </div>
            <ChevronLeft className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-600" />
          </button>
        ))}
      </div>
    </div>
  );
};
