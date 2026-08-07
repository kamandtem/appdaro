/**
 * ⚠️ DEPRECATED — منبع داده به src/data/medicationCatalog.ts منتقل شده است.
 *
 * این فایل قبلاً یک دیتاست جدا و مستقل از اسامی دارو بود (بدون id، بدون ارتباط
 * با دیتابیس تداخلات). اکنون فقط یک لایه‌ی سازگاری نازک (thin compatibility shim)
 * روی دیتابیس مرکزی است تا کدهای قدیمی‌تری که هنوز از اینجا import می‌کنند بشکنند.
 * کد جدید باید مستقیماً از src/data/medicationCatalog.ts استفاده کند
 * (MEDICATION_CATALOG / searchMedicationCatalog) که هم id پایدار دارد و هم به
 * دیتابیس تداخلات وصل است.
 */

import { MEDICATION_CATALOG, searchMedicationCatalog } from './medicationCatalog';

export interface MedicationNameEntry {
  fa: string;
  en: string;
  use: string;
}

export const MEDICATION_NAMES: MedicationNameEntry[] = MEDICATION_CATALOG.map(e => ({
  fa: e.fa,
  en: e.en,
  use: e.use
}));

/** @deprecated از searchMedicationCatalog در medicationCatalog.ts استفاده کنید. */
export function searchMedicationNames(query: string, limit = 7): MedicationNameEntry[] {
  return searchMedicationCatalog(query, limit).map(e => ({ fa: e.fa, en: e.en, use: e.use }));
}
