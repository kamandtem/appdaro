// Occurrence Generator (DESIGN.md بخش ۳) — پل بین Scheduling Engine (خالص) و
// Repository (پایدار). یک بازه‌ی افق (rolling horizon) را برای هر داروی
// فعال expand می‌کند و نتیجه را به‌صورت idempotent در DoseOccurrenceRepository
// upsert می‌کند.
//
// این تیکه (۶) دقیقاً همان حفره‌ای را پر می‌کند که در پایان تیکه ۵ در
// HANDOFF.md مستند شده بود: «از تیکه ۶ (Occurrence Generator) به بعد، حفره‌ی
// TimeZoneConverter واقعاً مسدودکننده می‌شه» — به همین خاطر، طبق دستور
// صریح کاربر، پیش از این فایل، `IanaTimeZoneConverter` واقعی
// (src/adapters/TimeZoneConverterAdapter.ts) ساخته و تست شد؛ این ماژول از
// طریق DI همان converter را (نه هیچ پیاده‌سازی مشخصی) می‌گیرد.

import { DoseOccurrence, Instant, MedicationAggregate, OccurrenceId } from '../../types';
import type { ClockAdapter } from '../../adapters/ClockAdapter';
import { DoseOccurrenceRepository } from '../../repository/DoseOccurrenceRepository';
import { TimeZoneConverter } from '../shared/TimeZoneConverter';
import { expand } from '../scheduling/SchedulingEngine';
import { intervalHoursForSlot, reminderPolicyFor } from '../rules/RuleEngine';
import { plan } from '../reminders/ReminderEngine';

/**
 * وقتی `ReminderPolicy` از نوع `'exempt'` است (داروهای safetyLevel:'critical'
 * یا isSingleDose)، `ReminderEngine.plan` هیچ entry از نوع `'deadline'`
 * تولید نمی‌کند (بخش ۵: «برای exempt: فقط dose_time در plan قرار می‌گیرد»).
 * اما `DoseOccurrence.deadlineAt` در بخش ۱ یک فیلد الزامی (نه اختیاری) است.
 *
 * این یک نقطه‌ای است که DESIGN.md صریحاً پرش نکرده (نه بخش ۱، نه بخش ۵)، و
 * دقیقاً طبق راهنمای پایان HANDOFF.md («اگه سؤالی... خودت با توجیه مستند
 * تصمیم بگیر») اینجا حل می‌شود: کد قدیمی (`checkMissedDoses` در App.tsx)
 * صراحتاً داروهای exempt را از فیلتر ورودی‌اش کنار می‌گذارد
 * (`.filter(m => m.isActive && !isExemptFromDeadlineSystem(m))`) — یعنی این
 * داروها هرگز به‌صورت خودکار missed نمی‌شوند. برای حفظ همین رفتار در معماری
 * جدید (که `ResolverEngine.sweepMissed`، تیکه ۷، صرفاً `deadlineAt < now` را
 * چک می‌کند، بدون آگاهی از exempt بودن)، به occurrenceهای exempt یک
 * `deadlineAt` در آینده‌ی عملاً غیرقابل‌دسترس داده می‌شود — نه `Infinity`
 * (که در JSON.stringify به `null` تبدیل می‌شود و round-trip پایداری را
 * می‌شکند)، بلکه بزرگ‌ترین timestamp معتبر جاوااسکریپت
 * (`8640000000000000` — سال ۲۷۵۷۶۰ میلادی، مستند در ECMA-262 بخش Date). اگر
 * تیکه ۷ (Resolver Engine) بعداً به این فرض نیاز پیدا کرد که «exempt یعنی
 * هرگز missed نشو»، باید این ثابت را به‌جای یک عدد جادویی/تلویحی، از همین‌جا
 * import و استفاده کند.
 */
export const EXEMPT_DEADLINE_SENTINEL: Instant = 8_640_000_000_000_000;

export interface OccurrenceGeneratorDeps {
  converter: TimeZoneConverter;
  clock: ClockAdapter;
  occurrenceRepository: DoseOccurrenceRepository;
  /** تولیدکننده‌ی id — در production یک ULID واقعی (`ulid` از پکیج `ulid`)،
   *  در تست یک شمارنده‌ی قطعی، تا تست‌ها بدون وابستگی به تصادف قابل‌اجرا
   *  بمانند. */
  generateId: () => OccurrenceId;
}

export interface OccurrenceGeneratorResult {
  /** occurrenceهای واقعاً جدید (نه آن‌هایی که با کلید طبیعی از قبل موجود بودند). */
  created: number;
  /** occurrenceهای pending با scheduleVersion قدیمی که به‌خاطر ویرایش برنامه‌ی
   *  دارو canceled شدند (بخش ۳ - «وقتی schedule یک دارو عوض می‌شود»). */
  canceled: number;
}

/**
 * OccurrenceGenerator.ensureHorizon — امضای بخش ۳ سند، با یک انحراف مستندشده:
 * پارامتر اول به‌جای `Medication[]` خام، `MedicationAggregate[]` است — چون
 * تنها این نوع (`schedule`/`safety` دارد) اطلاعات لازم برای expand کردن را
 * حمل می‌کند؛ دقیقاً همان انحراف الگویی که تیکه ۲ برای
 * `RuleEngine.reminderPolicyFor` مستند کرده بود (Aggregate جدید هنوز به
 * UI/App.tsx وصل نیست، ولی خودِ تایپش از تیکه ۵ آماده است).
 *
 * دو مسئولیت (به ترتیب، برای هر دارو):
 *   ۱) **ابطال نسخه‌ی قدیمی** — طبق بخش ۳: اگر `scheduleVersion` فعلی دارو
 *      با نسخه‌ی یک occurrence آینده‌ی هنوز pending فرق دارد، آن occurrence
 *      `canceled` می‌شود (نه حذف — تاریخچه می‌ماند). occurrenceهای گذشته یا
 *      resolve‌شده دست‌نخورده می‌مانند (immutability rule).
 *   ۲) **تولید idempotent** — expand طبق SchedulingEngine، بعد upsertIfAbsent
 *      طبق کلید طبیعی بخش ۳ (`medicationId, slotId, scheduledAt`).
 *
 * فقط داروهای `isActive` پردازش می‌شوند. برای داروهای غیرفعال، این تابع
 * عمداً **هیچ کاری نمی‌کند** — نه تولید، نه ابطال — چون بخش ۳ سند فقط ابطال
 * به‌خاطر «تغییر scheduleVersion» را توصیف کرده، نه ابطال به‌خاطر
 * غیرفعال‌شدن دارو (که در تعریف enum بخش ۱ برای `'canceled'` ذکر شده، ولی
 * مسئولش مشخص نشده). مسئولیت ابطال occurrenceهای یک داروی تازه‌غیرفعال‌شده،
 * طبق دیاگرام بخش ۱۱ (`MS --> GEN`)، به لایه‌ی Application
 * (`MedicationEditService`، هنوز ساخته نشده) واگذار شده تا این تابع
 * تک‌مسئولیتی و قابل پیش‌بینی بماند — این یک محدودیت شناخته‌شده است که
 * باید موقع ساخت آن سرویس (تیکه‌های بعدی) رعایت شود.
 */
export function ensureHorizon(
  medications: MedicationAggregate[],
  horizon: { from: Instant; to: Instant },
  deps: OccurrenceGeneratorDeps
): OccurrenceGeneratorResult {
  const now = deps.clock.now();
  let created = 0;
  let canceled = 0;

  for (const med of medications) {
    if (!med.isActive) continue;

    // ۱) ابطال occurrenceهای آینده‌ی pending با scheduleVersion قدیمی.
    const existingForMed = deps.occurrenceRepository.findByMedication(med.id);
    for (const occ of existingForMed) {
      const isStaleVersion = occ.scheduleVersion !== med.schedule.scheduleVersion;
      const isFuture = occ.scheduledAt > now;
      if (occ.status === 'pending' && isStaleVersion && isFuture) {
        deps.occurrenceRepository.update({
          ...occ,
          status: 'canceled',
          resolvedAt: now,
          resolvedBy: 'system',
          updatedAt: now
        });
        canceled++;
      }
    }

    // ۲) expand + upsert idempotent برای افق فعلی.
    const scheduledSlots = expand(med.schedule, horizon, deps.converter);
    for (const s of scheduledSlots) {
      const intervalHours = intervalHoursForSlot(med.schedule, s.slotId);
      const policy = reminderPolicyFor(med.safety, intervalHours);
      const reminderPlan = plan({ scheduledAt: s.scheduledAt }, policy);
      const deadlineEntry = reminderPlan.entries.find(e => e.kind === 'deadline');

      const occurrence: DoseOccurrence = {
        id: deps.generateId(),
        medicationId: med.id,
        slotId: s.slotId,
        scheduleVersion: med.schedule.scheduleVersion,
        scheduledAt: s.scheduledAt,
        deadlineAt: deadlineEntry ? deadlineEntry.fireAt : EXEMPT_DEADLINE_SENTINEL,
        reminderPlan,
        status: 'pending',
        snoozeCount: 0,
        notificationIds: {},
        timezoneAtGeneration: deps.clock.currentTimeZoneId(),
        createdAt: now,
        updatedAt: now
      };

      const result = deps.occurrenceRepository.upsertIfAbsent(occurrence);
      if (result === 'created') created++;
    }
  }

  return { created, canceled };
}
