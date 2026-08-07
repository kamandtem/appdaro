// legacyToOccurrenceMigration — بخش ۱۰ سند طراحی.
//
// اجرا فقط یک‌بار، در اولین باز شدن اپ بعد از آپدیت (بخش ۱۰ - گام‌های مهاجرت).
// idempotent: صدا زدن دوباره روی داده‌ای که قبلاً مهاجرت کرده، هیچ اثر
// اضافه‌ای ندارد (چون OccurrenceGenerator خودش idempotent است — بخش ۳). قبل
// از اجرا، یک نسخه‌ی پشتیبان کامل از AppState فعلی گرفته می‌شود (بخش ۱۵ -
// ریسک «مهاجرت داده‌ی کاربران فعلی»). قابل dry-run: با `dryRun: true` فقط
// occurrenceهای پیشنهادی را برمی‌گرداند، چیزی را در state واقعی نمی‌نویسد.
//
// چرا یک‌باره سوییچ نمی‌کنیم (بخش ۱۰): DoseLog قدیمی حذف نمی‌شود — فقط از این
// پس read-only/legacy است؛ occurrenceهای جدید فقط رو به آینده تولید می‌شوند
// (تاریخچه‌ی گذشته از DoseLog برای گزارش‌ها همچنان معتبر می‌ماند، بخش ۱۳).

import { AppState, DoseOccurrence } from '../types';
import { OccurrenceGenerator, DEFAULT_HORIZON_DAYS } from '../domain/occurrence/OccurrenceGenerator';
import { ClockAdapter } from '../adapters/ClockAdapter';
import { persistenceAdapter, STORAGE_KEY, STORAGE_BACKUP_KEY } from '../adapters/LocalStoragePersistenceAdapter';

export interface MigrationResult {
  ranMigration: boolean;
  createdOccurrences: DoseOccurrence[];
}

export function runLegacyToOccurrenceMigration(
  state: AppState,
  clock: ClockAdapter,
  options: { dryRun?: boolean } = {}
): MigrationResult {
  if (state.hasMigratedOccurrences && !options.dryRun) {
    return { ranMigration: false, createdOccurrences: [] };
  }

  if (!options.dryRun) {
    // پشتیبان‌گیری خودکار قبل از هر نوشتنی — بخش ۱۵.
    const currentRaw = persistenceAdapter.getItem(STORAGE_KEY);
    if (currentRaw) {
      persistenceAdapter.setItem(STORAGE_BACKUP_KEY, currentRaw);
    }
  }

  const generator = new OccurrenceGenerator(clock);
  const createdOccurrences = generator.ensureHorizonForAll(
    state.medications,
    state.doseOccurrences || [],
    DEFAULT_HORIZON_DAYS
  );

  return { ranMigration: true, createdOccurrences };
}
