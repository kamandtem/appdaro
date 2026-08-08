// runtime (تیکه ۸ — composition root سبک) — تنها جایی که پیاده‌سازی‌های
// *واقعی* Adapter/Repository Layer (نه fake های تست) ساخته و singleton
// می‌شن، تا App.tsx مجبور نباشه خودش `new LocalStoragePersistenceAdapter(...)`
// و بقیه رو inline بسازه. این فایل عمداً *تست نمی‌شه* با `tsx --test` —
// برخلاف ResolverEngine.ts (که کاملاً DI-based و pure-testable مونده)، این
// فایل مستقیماً `IanaTimeZoneConverter` (که به `date-fns-tz` وابسته‌ست) و
// `ulid` رو import می‌کنه؛ طبق یادداشت خودِ HANDOFF.md («محیط اجرا»)، این دو
// پکیج فقط وقتی شبکه در دسترسه نصب می‌شن. منطق قابل‌تست (نگاشت
// منطق وضعیت فقط در ResolverEngine و writeهای legacy دیگر وجود ندارند.

import { ulid } from 'ulid';
import { Medication } from '../types';
import { LocalStorageMedicationRepository, MedicationRepository } from '../repository/MedicationRepository';
import { LocalStorageDoseOccurrenceRepository, DoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import { LocalStoragePersistenceAdapter } from '../adapters/LocalStoragePersistenceAdapter';
import { ClockAdapter, DeviceClockAdapter } from '../adapters/ClockAdapter';
import { IanaTimeZoneConverter } from '../adapters/TimeZoneConverterAdapter';
import { CapacitorNotificationAdapter } from '../adapters/CapacitorNotificationAdapter';
import { isNotificationEngineEnabled, createResolverEventBridge, syncOccurrence } from '../notification/NotificationEngine';
import { migrateLegacyData } from '../migration/migrateLegacyData';
import { ResolverEngineDeps } from '../domain/occurrence/ResolverEngine';
import { HomeQueueDeps } from './HomeQueueService';
import { OccurrenceQueryService } from './OccurrenceQueryService';

const persistence = new LocalStoragePersistenceAdapter(localStorage);

export const medicationRepository: MedicationRepository = new LocalStorageMedicationRepository(persistence);
export const occurrenceRepository: DoseOccurrenceRepository = new LocalStorageDoseOccurrenceRepository(persistence);
export const clock: ClockAdapter = new DeviceClockAdapter();
export const converter = new IanaTimeZoneConverter();

/** تیکه ۹ — Notification Engine + Adapter: تک نمونه‌ی واقعی
 *  `CapacitorNotificationAdapter` برای کل اپ (پترن singleton یکسان با بقیه‌ی
 *  Adapterهای بالا). خودش هیچ‌جا مستقیماً از App.tsx صدا زده نمی‌شه — فقط
 *  از طریق `resolverDeps.onEvent` زیر، پشت feature flag. */
export const notificationAdapter = new CapacitorNotificationAdapter();

/** همون سه repository/adapter بالا، بسته‌بندی‌شده به شکل `ResolverEngineDeps`
 *  — تا App.tsx مجبور نباشه هر بار یک آبجکت جدید بسازه.
 *
 * **تیکه ۹ / انحراف مستندشده #۷ (HANDOFF.md):** `onEvent` اینجا به
 * `createResolverEventBridge` وصل شده — یعنی هر `OccurrenceResolved`/
 * `OccurrenceMissed` که از `ResolverEngine.resolve`/`sweepMissed` (از طریق
 * `ResolverEngine`، همون مسیری که App.tsx تیکه ۸ استفاده می‌کنه) منتشر بشه،
 * به `NotificationEngine.cancelRemaining` می‌رسه — **فقط اگه** feature flag
 * (`isNotificationEngineEnabled`) روشن باشه. پیش‌فرض این پرچم **خاموش**ه
 * (کلید `localStorage` هنوز جایی ست نشده)، پس همین الان که این wiring اضافه
 * شد، هیچ رفتار واقعی کاربری عوض نشد — دقیقاً طبق «rollback = نگه‌داشتن
 * پرچم خاموش» که خودِ NotificationEngine.ts مستند کرده. روشن‌کردن این
 * پرچم (و صدا زدن `NotificationEngine.syncOccurrence` برای واقعاً
 * schedule-کردن نوتیفیکیشن‌های تازه) هنوز جایی در App.tsx وصل نشده — این
 * محدودیت شناخته‌شده‌ی همین تیکه‌ست، نگاه کن به یادداشت پایین همین فایل. */
export const resolverDeps: ResolverEngineDeps = {
  medicationRepository,
  occurrenceRepository,
  clock,
  onEvent: createResolverEventBridge(
    { adapter: notificationAdapter },
    () => isNotificationEngineEnabled(localStorage)
  )
};

/** تیکه ۱۰ — DESIGN.md بخش ۱۷: همان چهار وابستگی، بسته‌بندی‌شده برای
 *  `HomeQueueService`. عمداً همان نمونه‌های singleton بالا هستند (نه
 *  نمونه‌های تازه) تا پنل خانه دقیقاً همان Repositoryای را بخواند که
 *  `ResolverEngine` می‌نویسد — «منبع واحد» بخش ۱۷.۲/۱۷.۶. */
export const homeQueueDeps: HomeQueueDeps = {
  medicationRepository,
  occurrenceRepository,
  clock,
  converter
};

/** تیکه ۱۱ — منبع واحد read-side برای ReportsView. */
export const occurrenceQueryService = new OccurrenceQueryService({
  occurrenceRepository,
  medicationRepository,
  clock,
  converter
});


/** بعد از تولید افق، همه‌ی occurrenceهای pending همان افق را به‌صورت diff
 *  روی Notification Engine جدید sync می‌کند. مسیر قدیمی cancel-all حذف شده؛
 *  خاموش‌کردن feature flag فقط rollback اضطراری است. */
export async function syncPendingNotifications(): Promise<void> {
  if (!isNotificationEngineEnabled(localStorage)) return;
  const now = clock.now();
  const occurrences = occurrenceRepository.findByDateRange({
    from: now,
    to: now + HORIZON_HOURS * 60 * 60 * 1000
  }).filter(occurrence => occurrence.status === 'pending');
  for (const occurrence of occurrences) {
    await syncOccurrence(occurrence, {
      adapter: notificationAdapter,
      clock,
      occurrenceRepository,
      resolveMedication: (medicationId) => {
        const med = medicationRepository.getById(medicationId);
        return med ? { name: med.name, dose: med.dose, form: med.form } : undefined;
      }
    });
  }
}

/** پیش‌فرض افق rolling — طبق پیشنهاد بخش ۱۵ (۷۲ ساعت)، همونی که
 *  `migrateLegacyData` هم به‌صورت پیش‌فرض استفاده می‌کنه. */
const HORIZON_HOURS = 72;

/**
 * syncOccurrences — پل بین state لجسی (`state.medications` توی App.tsx) و
 * لایه‌ی جدید. `migrateLegacyData` idempotent است (تیکه ۶) و در هر بار صدا
 * زدن، هم مهاجرت (برای داروهای تازه) و هم `ensureHorizon` (برای افق rolling
 * همه‌ی داروها، مهاجرت‌شده یا نه) رو انجام می‌ده — پس صدا زدنش در mount و هر
 * `resume` (دقیقاً طبق بخش ۳ - «چه زمانی صدا زده می‌شود») امن است.
 *
 * **انحراف/محدودیت مستندشده:** طبق بخش ۳ سند، `ensureHorizon` باید «بعد از
 * ساخت/ویرایش/حذف/فعال‌سازی هر دارو» هم صدا زده بشه. این تابع الان فقط در
 * mount/resume (و در App.tsx، هر بار `state.medications` عوض بشه — چون همون
 * effect به این آرایه وابسته‌ست) صدا زده می‌شه، نه به‌صورت مجزا و صریح به‌ازای
 * هر عملیات CRUD روی دارو. چون effect به `state.medications` وابسته‌ست، در
 * عمل افزودن/ویرایش/حذف/toggle هر دارو (که همگی این آرایه رو عوض می‌کنن) هم
 * باعث یک sync دوباره می‌شه — پس این محدودیت عملاً پوشش داده می‌شه، فقط از
 * طریق وابستگی effect نه یک فراخوانی صریح جدا به‌ازای هر action. مسئولیت
 * دقیق‌تر (مثلاً ابطال فوری occurrenceهای آینده‌ی یک داروی تازه‌غیرفعال‌شده)
 * طبق انحراف #۴ تیکه ۶ همچنان به `MedicationEditService` (هنوز ساخته نشده)
 * واگذار شده.
 */
export function syncOccurrences(legacyMedications: Medication[]): void {
  migrateLegacyData(legacyMedications, {
    medicationRepository,
    occurrenceRepository,
    converter,
    clock,
    generateId: () => ulid(),
    horizonHours: HORIZON_HOURS
  });
}

// `syncPendingNotifications` در mount/resume بعد از تولید occurrenceها اجرا می‌شود؛
// مسیر قدیمی cancel-all دیگر وجود ندارد و مقدار صریح feature flag فقط rollback است.
