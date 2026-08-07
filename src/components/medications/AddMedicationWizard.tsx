import React, { useState, useEffect, useRef } from 'react';
import { Medication, MedicationForm, FrequencyType } from '../../types';
import { toPersianNumbers, toEnglishNumbers } from '../../utils/persian';
import { Pill, Droplet, Syringe, Pipette, Bandage, Package, Plus, X, CheckCircle2, Camera, ChevronDown, Check, Pencil } from 'lucide-react';
import { CylinderTimePicker, computeIntervalTimes, computeIntervalTimesFromClock, computeWeekdaySchedule } from '../common/CylinderTimePicker';
import { WheelPicker, WheelPickerItem } from '../common/WheelPicker';
import { ScheduleStartAtPicker } from './ScheduleStartAtPicker';
import { resizeImageFile } from '../../utils/image';
import { searchMedicationCatalog, getCatalogEntryById, MedicationCatalogEntry } from '../../data/medicationCatalog';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

interface AddMedicationWizardProps {
  onAddMedication: (med: Medication) => void;
  onUpdateMedication?: (med: Medication) => void;
  onClose: () => void;
  editMedication?: Medication;
  initialName?: string;
  initialForm?: MedicationForm;
  initialDose?: string;
  initialTimes?: string[];
  initialInstructions?: string;
  /** وقتی از صفحه‌ی «داروخانه» با دکمه‌ی «افزودن به داروهای من» باز می‌شود، id این
   *  دارو در دیتابیس مرکزی از پیش مشخص است — دیگر نیازی به تطبیق fuzzy نیست. */
  initialCatalogId?: string;
  /** وقتی از Bottom Sheet «مصرف نکردم» (دلیل «زمان مصرف مناسب نیست») باز می‌شود،
   *  پنل مستقیماً روی بخش «زمان مصرف» اسکرول و هایلایت می‌شود. */
  focusSection?: 'times';
}

type DoseType = 'count' | 'ml' | 'ftu';

// Per-form dose step options for the "count" dose type — each medication form counts
// its dose differently: pills allow halves up to 3, drops/ampoules are whole numbers up to 3.
const countStepsForForm = (form: MedicationForm): number[] => {
  if (form === 'قرص') return [0.25, 0.5, 1, 2, 3];
  if (form === 'قطره') return Array.from({ length: 10 }, (_, i) => i + 1); // ۱ تا ۱۰ قطره
  return [1, 2, 3]; // آمپول
};

const spoonLabel = (ml: number): string => {
  const spoons = Math.round(ml / 5);
  return `${toPersianNumbers(spoons)} قاشق مرباخوری`;
};

// FTU (Fingertip Unit) label — abbreviated per the app's convention as "بند انگشت"
const ftuLabel = (n: number): string => `${toPersianNumbers(n)} بند انگشت`;

// Best-effort parse of a free-form dose string (e.g. "۲ عدد", "۵ میلی‌لیتر(cc) - ..." or
// "۱ بند انگشت") back into the wizard's structured dose type/value, used when opening the
// wizard to edit a medication.
const parseDoseForEdit = (
  doseStr: string,
  form: MedicationForm
): { doseType: DoseType; countValue: number; mlValue: number; ftuValue: number } => {
  const en = toEnglishNumbers(doseStr);
  const mlMatch = en.match(/(\d+(?:\.\d+)?)\s*(?:میلی‌لیتر|ml|cc)/i);
  if (mlMatch) {
    const val = Number(mlMatch[1]);
    const options = [2.5, 5, 7.5, 10, 12.5, 15, 20];
    const nearest = options.reduce((a, b) => (Math.abs(b - val) < Math.abs(a - val) ? b : a));
    return { doseType: 'ml', countValue: 1, mlValue: nearest, ftuValue: 1 };
  }
  const ftuMatch = en.match(/(\d+(?:\.\d+)?)\s*بند\s*انگشت/);
  if (ftuMatch) {
    const val = Math.min(3, Math.max(1, Math.round(Number(ftuMatch[1]))));
    return { doseType: 'ftu', countValue: 1, mlValue: 5, ftuValue: val };
  }
  const countMatch = en.match(/(\d+(?:\.\d+)?)\s*(?:عدد|قرص|پرل|قطره)/);
  if (countMatch) {
    const steps = countStepsForForm(form);
    const raw = Number(countMatch[1]);
    const val = steps.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
    return { doseType: 'count', countValue: val, mlValue: 5, ftuValue: 1 };
  }
  return { doseType: 'count', countValue: 1, mlValue: 5, ftuValue: 1 };
};

export const AddMedicationWizard: React.FC<AddMedicationWizardProps> = ({
  onAddMedication,
  onUpdateMedication,
  onClose,
  editMedication,
  initialName = '',
  initialForm = 'قرص',
  initialTimes = [],
  initialInstructions = '',
  initialCatalogId,
  focusSection
}) => {
  const isEditing = !!editMedication;
  const parsedDose = editMedication ? parseDoseForEdit(editMedication.dose, editMedication.form) : null;

  const [name, setName] = useState(editMedication?.name ?? initialName);
  const [catalogId, setCatalogId] = useState<string | undefined>(editMedication?.catalogId ?? initialCatalogId);
  // اگر این دارو از داروخانه (initialCatalogId) پیش‌پرشده و آن محصول فقط با یک
  // فرم مشخص عرضه می‌شود (مثل قطره چشمی/آمپول/پماد)، همان فرم پیش‌فرض می‌شود.
  const initialCatalogEntry = catalogId ? getCatalogEntryById(catalogId) : undefined;
  const [form, setForm] = useState<MedicationForm>(
    editMedication?.form ?? initialCatalogEntry?.availableForms?.[0] ?? initialForm
  );

  // وقتی داروی انتخاب‌شده (از اتوکامپلیت یا داروخانه) فقط یک فرم مشخص دارد،
  // انتخاب فرم برای کاربر قفل می‌شود — چون در واقعیت آن دارو با فرم دیگری
  // وجود ندارد (مثل قطره چشمی که هرگز قرص نیست).
  const selectedCatalogEntry = catalogId ? getCatalogEntryById(catalogId) : undefined;
  const lockedForms = selectedCatalogEntry?.availableForms;
  const [frequency, setFrequency] = useState<FrequencyType>(editMedication?.frequency ?? 'هر چند ساعت');
  const [isFrequencyOpen, setIsFrequencyOpen] = useState(false);
  const frequencyRef = useRef<HTMLDivElement>(null);
  // بخش «زمان مصرف» — وقتی focusSection === 'times' باشد (باز شدن از Bottom Sheet
  // «مصرف نکردم» → «زمان مصرف مناسب نیست»)، پنل مستقیماً به همین بخش اسکرول و
  // چند لحظه هایلایت می‌شود تا کاربر بلافاصله متوجه‌ی محل تغییر ساعت یادآوری شود.
  const timesSectionRef = useRef<HTMLDivElement>(null);
  const [highlightTimesSection, setHighlightTimesSection] = useState(false);

  // Medication name autocomplete (offline suggestion list, prefix-matched) — the
  // search itself is debounced so it doesn't re-scan the catalog on every single
  // keystroke, only once typing pauses for a moment.
  const [nameQuery, setNameQuery] = useState(editMedication?.name ?? initialName);
  const debouncedNameQuery = useDebouncedValue(nameQuery, 200);
  const [nameSuggestions, setNameSuggestions] = useState<MedicationCatalogEntry[]>([]);
  const [isNameSuggestOpen, setIsNameSuggestOpen] = useState(false);
  const nameSuggestRef = useRef<HTMLDivElement>(null);
  // Only auto-open the suggestion dropdown from real typing, not from the initial
  // value when opening the wizard to edit an existing medication.
  const hasTypedNameRef = useRef(false);

  // Repeat pattern fine-tuning (used by the "هر چند ساعت" / "روزهای هفته" schedule modes)
  const [intervalHours, setIntervalHours] = useState<number>(editMedication?.customIntervalHours ?? 8);
  const [intervalDays, setIntervalDays] = useState<number>(1);
  const [monthDay, setMonthDay] = useState<number>(editMedication?.monthDay ?? 1);

  // Dose
  const [doseType, setDoseType] = useState<DoseType>(parsedDose?.doseType ?? 'count');
  const [countValue, setCountValue] = useState<number>(parsedDose?.countValue ?? 1);
  const [mlValue, setMlValue] = useState<number>(parsedDose?.mlValue ?? 5);
  const [ftuValue, setFtuValue] = useState<number>(parsedDose?.ftuValue ?? 1);

  // Schedule times
  const [selectedTimes, setSelectedTimes] = useState<string[]>(editMedication?.times ?? initialTimes);
  const [timeError, setTimeError] = useState(false);
  const [scheduleStartAt, setScheduleStartAt] = useState<string | undefined>(editMedication?.scheduleStartAt);

  // Photo
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(editMedication?.photoUrl);

  // Stock
  const [remainingCount, setRemainingCount] = useState(editMedication?.remainingCount ?? 30);
  const [totalCount, setTotalCount] = useState(editMedication?.totalCount ?? 30);
  const [alertThreshold, setAlertThreshold] = useState(editMedication?.alertThreshold ?? 5);

  // Instructions / Notes
  const [instructions, setInstructions] = useState(editMedication?.instructions ?? initialInstructions);
  const [notes, setNotes] = useState(editMedication?.notes ?? '');
  const [reason, setReason] = useState(editMedication?.reason ?? '');

  // Keep dose type in sync with the selected medication form
  useEffect(() => {
    if (form === 'شربت') {
      setDoseType('ml');
    } else if (form === 'پماد') {
      setDoseType('ftu');
    } else {
      setDoseType('count');
      // Snap the count value onto a step that's valid for this form (e.g. pills
      // allow 0.5, drops/ampoules don't) so the wheel never shows an invalid value.
      setCountValue(prev => {
        const steps = countStepsForForm(form);
        return steps.includes(prev) ? prev : steps.reduce((a, b) => (Math.abs(b - prev) < Math.abs(a - prev) ? b : a), steps[0]);
      });
    }
  }, [form]);

  // Close frequency dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (frequencyRef.current && !frequencyRef.current.contains(e.target as Node)) {
        setIsFrequencyOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close medication-name suggestion dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (nameSuggestRef.current && !nameSuggestRef.current.contains(e.target as Node)) {
        setIsNameSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // اگر پنل از Bottom Sheet «مصرف نکردم» با focusSection="times" باز شده باشد،
  // یک لحظه بعد از رندر (تا لیاوت نهایی شود) به بخش «زمان مصرف» اسکرول می‌کنیم
  // و برای چند ثانیه هایلایتش می‌کنیم؛ فقط یک‌بار در باز شدن پنل، نه با هر رندر.
  useEffect(() => {
    if (focusSection !== 'times') return;
    const scrollId = setTimeout(() => {
      timesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightTimesSection(true);
    }, 250);
    const clearHighlightId = setTimeout(() => setHighlightTimesSection(false), 2600);
    return () => {
      clearTimeout(scrollId);
      clearTimeout(clearHighlightId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSection]);

  // Typing updates the name immediately (so the input feels responsive) but only
  // queues a debounced search — the actual catalog scan runs ~200ms after the user
  // pauses, not on every keystroke.
  const handleNameChange = (value: string) => {
    setName(value);
    setNameQuery(value);
    hasTypedNameRef.current = true;
    // A manual edit invalidates any previously-selected catalog match; if the
    // user picks a suggestion again below, this gets set back.
    setCatalogId(undefined);
  };

  useEffect(() => {
    if (!hasTypedNameRef.current || !debouncedNameQuery.trim()) {
      setNameSuggestions([]);
      setIsNameSuggestOpen(false);
      return;
    }
    const results = searchMedicationCatalog(debouncedNameQuery, 7);
    setNameSuggestions(results);
    setIsNameSuggestOpen(results.length > 0);
  }, [debouncedNameQuery]);

  const selectNameSuggestion = (entry: MedicationCatalogEntry) => {
    // انتخاب یک پیشنهاد یعنی دیگر «تایپ فعال» در جریان نیست؛ این فلگ را همین‌جا
    // خاموش می‌کنیم تا وقتی nameQuery چند خط پایین‌تر روی entry.fa ست می‌شود و
    // debouncedNameQuery با ۲۰۰ میلی‌ثانیه تأخیر به همین مقدار می‌رسد، افکت
    // جست‌وجو دوباره کاتالوگ را اسکن نکند و لیست پیشنهادها را از نو باز نکند —
    // قبلاً همین باعث می‌شد کاربر برای بستن واقعی لیست، مجبور شود دوباره تایید
    // کند.
    hasTypedNameRef.current = false;
    setName(entry.fa);
    setNameQuery(entry.fa);
    setCatalogId(entry.id);
    // اگر این دارو فرم مشخص و بدون ابهامی دارد، همان فرم به‌طور خودکار انتخاب
    // می‌شود (بقیه‌ی گزینه‌ها در UI پایین‌تر غیرفعال می‌شوند).
    if (entry.availableForms && entry.availableForms.length > 0) {
      setForm(entry.availableForms[0]);
    }
    setNameSuggestions([]);
    setIsNameSuggestOpen(false);
  };

  const forms: { id: MedicationForm; label: string; icon: React.ElementType }[] = [
    { id: 'قرص', label: 'قرص', icon: Pill },
    { id: 'شربت', label: 'شربت', icon: Droplet },
    { id: 'آمپول', label: 'آمپول', icon: Syringe },
    { id: 'قطره', label: 'قطره', icon: Pipette },
    { id: 'پماد', label: 'پماد', icon: Bandage }
  ];

  const frequencyOptions: { id: FrequencyType; label: string }[] = [
    { id: 'هر چند ساعت', label: 'هر چند ساعت' },
    { id: 'هر روز', label: 'هر روز' },
    { id: 'روزهای هفته', label: 'روزهای خاص هفته' },
    { id: 'ماهانه', label: 'ماهانه (روز مشخصی از ماه)' }
  ];

  const countItems: WheelPickerItem[] = countStepsForForm(form).map(v => ({
    value: v,
    label: Number.isInteger(v) ? toPersianNumbers(v) : toPersianNumbers(v.toFixed(1))
  }));

  const mlItems: WheelPickerItem[] = [2.5, 5, 7.5, 10, 12.5, 15, 20].map(v => ({
    value: v,
    label: Number.isInteger(v) ? toPersianNumbers(v) : toPersianNumbers(v.toFixed(1))
  }));

  const ftuItems: WheelPickerItem[] = [1, 2, 3].map(v => ({
    value: v,
    label: toPersianNumbers(v)
  }));

  const addSelectedTime = (timeStr: string) => {
    setSelectedTimes(prev => (prev.includes(timeStr) ? prev : [...prev, timeStr]));
    setTimeError(false);
  };

  const removeSelectedTime = (timeStr: string) => {
    setSelectedTimes(prev => (prev.length > 1 ? prev.filter(t => t !== timeStr) : prev));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageFile(file, 480, 0.85);
      setPhotoUrl(resized);
    } catch (err) {
      console.error('Failed to process medication photo:', err);
      alert('پردازش تصویر با خطا مواجه شد. لطفاً تصویر دیگری را امتحان کنید.');
    }
  };

  const submitMedication = () => {
    if (!name.trim()) {
      alert('لطفاً نام دارو را وارد کنید');
      return;
    }

    // 'هر چند ساعت' computes its times automatically; the other two modes need at
    // least one time explicitly added via the "افزودن این زمان" button — otherwise
    // there is nothing real to save (no more silent ۰۸:۰۰ fallback).
    if (frequency !== 'هر چند ساعت' && selectedTimes.length === 0) {
      setTimeError(true);
      return;
    }

    const doseText = doseType === 'ml'
      ? `${toPersianNumbers(mlValue)} میلی‌لیتر(cc) - ${spoonLabel(mlValue)}`
      : doseType === 'ftu'
        ? ftuLabel(ftuValue)
        : `${toPersianNumbers(countValue)} عدد`;

    // Derive the actual clock times / weekdays to store from the selected repeat pattern.
    // If "schedule starts now" was pressed, anchor the interval grid to that exact moment.
    const computedTimes = frequency === 'هر چند ساعت'
      ? (scheduleStartAt
          ? computeIntervalTimesFromClock(intervalHours, new Date(scheduleStartAt).getHours(), new Date(scheduleStartAt).getMinutes())
          : computeIntervalTimes(intervalHours))
      : selectedTimes;

    const computedSelectedDays = frequency === 'روزهای هفته'
      ? computeWeekdaySchedule(intervalDays).allDays
      : undefined;

    const computedIntervalHours = frequency === 'هر چند ساعت' ? intervalHours : undefined;
    const computedMonthDay = frequency === 'ماهانه' ? monthDay : undefined;

    if (isEditing && editMedication) {
      const updatedMed: Medication = {
        ...editMedication,
        name: name.trim(),
        catalogId,
        form,
        dose: doseText,
        times: computedTimes,
        frequency,
        customIntervalHours: computedIntervalHours,
        selectedDays: computedSelectedDays ?? editMedication.selectedDays,
        monthDay: computedMonthDay,
        remainingCount: Number(remainingCount) || 0,
        totalCount: Number(totalCount) || 0,
        alertThreshold: Number(alertThreshold) || 5,
        notes: notes.trim() || editMedication.notes,
        instructions: instructions.trim() || editMedication.instructions,
        reason: reason.trim() || editMedication.reason,
        photoUrl,
        scheduleStartAt
      };
      onUpdateMedication?.(updatedMed);
      onClose();
      return;
    }

    const newMed: Medication = {
      id: 'med_' + Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      catalogId,
      form,
      dose: doseText,
      times: computedTimes,
      frequency,
      customIntervalHours: computedIntervalHours,
      selectedDays: computedSelectedDays,
      monthDay: computedMonthDay,
      remainingCount: Number(remainingCount) || 30,
      totalCount: Number(totalCount) || 30,
      alertThreshold: Number(alertThreshold) || 5,
      isActive: true,
      familyMemberId: 'me',
      notes: notes.trim() || 'ثبت شده توسط کاربر',
      instructions: instructions.trim() || 'مصرف طبق دستور پزشک',
      reason: reason.trim() || undefined,
      photoUrl,
      createdAt: new Date().toLocaleDateString('fa-IR'),
      scheduleStartAt
    };

    onAddMedication(newMed);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMedication();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white/85 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/60 dark:border-slate-800 rounded-[26px] shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden relative flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={submitMedication}
              title={isEditing ? 'ذخیره تغییرات دارو' : 'ثبت نهایی دارو'}
              className="p-2.5 bg-gradient-to-tr from-emerald-500 to-teal-600 text-white rounded-2xl shadow-md hover:scale-105 active:scale-95 transition-all"
            >
              {isEditing ? <Pencil className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
            </button>
            <h3 className="font-black text-slate-800 dark:text-white text-lg sm:text-xl">
              {isEditing ? 'ویرایش دارو' : 'افزودن دارو'}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable body (contained within rounded corners) */}
        <div className="overflow-y-auto px-6 sm:px-8 py-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* STEP 1: Name & Form */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                ۱. نام دارو:
              </label>
              <div className="relative" ref={nameSuggestRef}>
                <input
                  type="text"
                  required
                  placeholder="نام دارو را تایپ کنید..."
                  value={name}
                  autoComplete="off"
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => {
                    if (nameSuggestions.length > 0) setIsNameSuggestOpen(true);
                  }}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                />

                {isNameSuggestOpen && nameSuggestions.length > 0 && (
                  <div className="absolute z-20 top-full mt-2 w-full max-h-64 overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 origin-top">
                    {nameSuggestions.map((entry, idx) => (
                      <button
                        key={`${entry.fa}-${idx}`}
                        type="button"
                        onClick={() => selectNameSuggestion(entry)}
                        className="w-full flex flex-col gap-1 px-4 py-2.5 text-right hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-b-0 first:rounded-t-2xl last:rounded-b-2xl"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 truncate">
                            {entry.fa}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 shrink-0" dir="ltr">
                            {entry.en}
                          </span>
                        </span>
                        {/* کاربرد اصلی دارو — با همان الگوی برچسب کاربردی بخش تداخلات */}
                        <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 truncate">
                          {entry.use}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                ۲. نوع دارو:
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {forms.map(f => {
                  const Icon = f.icon;
                  const isActive = form === f.id;
                  const isLocked = !!lockedForms && !lockedForms.includes(f.id);
                  return (
                    <button
                      type="button"
                      key={f.id}
                      disabled={isLocked}
                      onClick={() => !isLocked && setForm(f.id)}
                      className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm'
                          : isLocked
                          ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-600 opacity-50 cursor-not-allowed'
                          : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                      <span className="text-[10px] font-semibold leading-none">{f.label}</span>
                    </button>
                  );
                })}
              </div>
              {lockedForms && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-1.5">
                  این دارو فقط به همین شکل موجود است.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                علت مصرف <span className="text-slate-400 font-medium">(اختیاری)</span>:
              </label>
              <input
                type="text"
                placeholder="مثلاً: گلودرد"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm"
              />
            </div>

            {/* STEP 2: Dose */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                ۳. دوز مصرفی در هر نوبت:
              </label>

              {/* Unit badge — the dose unit is fully determined by the medication type
                  selected above, so this is just a label (no toggle needed). */}
              <div className="flex items-center justify-center mb-3">
                <span className="py-2 px-4 rounded-2xl text-xs sm:text-sm font-bold bg-gradient-to-tr from-teal-500 to-emerald-500 text-white shadow-md flex items-center gap-1.5">
                  {doseType === 'ml' && <span>واحد: میلی‌لیتر (cc)</span>}
                  {doseType === 'ftu' && <span>واحد: FTU (بند انگشت)</span>}
                  {doseType === 'count' && <span>واحد: عدد</span>}
                </span>
              </div>

              {/* Rotating cylinder dose picker — the number rolls freely; the unit/description
                  lives as a title above and a caption below, never squeezed inside the wheel row */}
              <div className="bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-3xl p-3 shadow-inner">
                <p className="text-center text-sm font-black text-slate-700 dark:text-slate-200 mb-1">
                  {doseType === 'count' && (
                    <>مقدار: <span className="text-teal-600 dark:text-teal-400">{toPersianNumbers(countValue)}</span> عدد</>
                  )}
                  {doseType === 'ml' && (
                    <>مقدار: <span className="text-teal-600 dark:text-teal-400">{toPersianNumbers(mlValue)}</span> میلی‌لیتر (cc)</>
                  )}
                  {doseType === 'ftu' && (
                    <>مقدار: <span className="text-teal-600 dark:text-teal-400">{toPersianNumbers(ftuValue)}</span> بند انگشت</>
                  )}
                </p>
                <div className="flex items-center justify-center">
                  {doseType === 'count' && (
                    <WheelPicker items={countItems} value={countValue} onChange={setCountValue} loop={false} />
                  )}
                  {doseType === 'ml' && (
                    <WheelPicker items={mlItems} value={mlValue} onChange={setMlValue} loop={false} />
                  )}
                  {doseType === 'ftu' && (
                    <WheelPicker items={ftuItems} value={ftuValue} onChange={setFtuValue} loop={false} />
                  )}
                </div>
                {doseType === 'ml' && (
                  <p className="text-center text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                    تقریباً {spoonLabel(mlValue)}
                  </p>
                )}
                {doseType === 'ftu' && (
                  <p className="text-center text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                    هر FTU تقریباً معادل ۱ بند انگشت اشاره
                  </p>
                )}
              </div>
            </div>

            {/* STEP: Frequency (custom styled dropdown) */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                ۴. الگوی تکرار:
              </label>
              <div className="relative" ref={frequencyRef}>
                <button
                  type="button"
                  onClick={() => setIsFrequencyOpen(o => !o)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500 flex items-center justify-between gap-2 transition-colors"
                >
                  <span>{frequencyOptions.find(f => f.id === frequency)?.label}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isFrequencyOpen ? 'rotate-180' : ''}`} />
                </button>

                {isFrequencyOpen && (
                  <div className="absolute z-20 mt-2 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top">
                    {frequencyOptions.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setFrequency(opt.id);
                          setIsFrequencyOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-xs sm:text-sm font-bold transition-colors ${
                          frequency === opt.id
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {frequency === opt.id && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* STEP 3: Times (frequency-aware schedule picker) */}
            <div
              ref={timesSectionRef}
              className={`space-y-3 rounded-3xl transition-all duration-500 ${
                highlightTimesSection
                  ? 'ring-2 ring-teal-400 dark:ring-teal-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 bg-teal-50/60 dark:bg-teal-950/30 p-3 -m-3'
                  : ''
              }`}
            >
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                {frequency === 'هر روز'
                  ? 'ساعت دقیق مصرف دارو'
                  : frequency === 'هر چند ساعت'
                    ? 'فاصلهٔ زمانی مصرف'
                    : frequency === 'ماهانه'
                      ? 'روز مصرف در هر ماه'
                      : 'فاصلهٔ روزهای مصرف'}
              </label>

              <CylinderTimePicker
                frequency={frequency}
                selectedTimes={selectedTimes}
                onAddTime={addSelectedTime}
                onRemoveTime={removeSelectedTime}
                intervalHours={intervalHours}
                onChangeIntervalHours={setIntervalHours}
                intervalDays={intervalDays}
                onChangeIntervalDays={setIntervalDays}
                monthDay={monthDay}
                onChangeMonthDay={setMonthDay}
                scheduleStartAt={scheduleStartAt}
              />

              {timeError && (
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 text-center">
                  لطفاً حداقل یک ساعت مصرف را انتخاب و با دکمهٔ «افزودن این زمان» ثبت کنید.
                </p>
              )}

              {/* "شروع زمان‌بندی از هم‌اکنون" فقط برای الگوی «هر چند ساعت» معنا دارد؛ چون
                  فقط در آن حالت محاسبهٔ نوبت‌ها به لحظهٔ شروع وابسته است. در حالت‌های دیگر
                  (روز مشخص، هر چند روز، ماهانه) کاربر خودش ساعت دقیق را انتخاب می‌کند و
                  همان ملاک است، پس این دکمه بی‌معناست. */}
              {frequency === 'هر چند ساعت' && (
                <ScheduleStartAtPicker scheduleStartAt={scheduleStartAt} onChangeScheduleStartAt={setScheduleStartAt} />
              )}
            </div>

            {/* STEP 3.5: Medication Photo Upload / Camera Capture */}
            <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 space-y-3">
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>تصویر واقعی دارو:</span>
                </span>
                <span className="text-[11px] text-teal-600 font-normal">نمایش در کارت یادآوری</span>
              </label>

              <div className="flex items-center gap-4">
                {photoUrl ? (
                  <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-teal-500 shadow-md shrink-0">
                    <img src={photoUrl} alt="عکس دارو" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(undefined)}
                      className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full shadow-sm"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="w-full flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl hover:border-teal-500 cursor-pointer bg-white dark:bg-slate-700/50 transition-all text-center">
                    <Camera className="w-6 h-6 text-teal-500 mb-1" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      عکاسی از دارو یا انتخاب از گالری
                    </span>
                    <span className="text-[10px] text-slate-400">فرمت JPG یا PNG</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* STEP 4: Stock count — a single field, kept simple */}
            <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-amber-500" />
                <span>۵. تعداد موجودی:</span>
              </h4>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={remainingCount}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value));
                  setRemainingCount(v);
                  // Total tracks along with the remaining count — this keeps the number
                  // consistent with what the medication list / low-stock warnings show.
                  setTotalCount(prev => Math.max(prev, v));
                }}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
            </div>

            {/* Optional instructions / Notes */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                دستور مصرف (اختیاری):
              </label>
              <input
                type="text"
                placeholder="مثلاً: بعد از غذا با یک لیوان آب کامل"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-2xl transition-colors text-xs sm:text-sm"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="w-2/3 py-3.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-600 hover:from-emerald-700 hover:to-blue-700 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/25 transition-all transform hover:scale-[1.02] active:scale-95 text-sm sm:text-base flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>{isEditing ? 'ذخیره تغییرات دارو' : 'ثبت نهایی دارو در داروتو'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
