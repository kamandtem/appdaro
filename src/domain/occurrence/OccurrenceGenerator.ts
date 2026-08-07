// OccurrenceGenerator — بخش ۳ سند طراحی.
//
// وظیفه: برای هر دارو/جایگاه فعال، occurrenceهای pending تا یک افق زمانی
// مشخص (ensureHorizon) تولید کند — idempotent: کلید طبیعی (medId, slotId,
// scheduledAt) دوباره تولید نمی‌شود (بخش ۳ - قانون idempotency). صدا زده
// می‌شود: هنگام تغییر برنامه‌ی یک دارو، هنگام boot/resume، و به‌صورت دوره‌ای
// (بخش ۳ - چه زمانی صدا زده می‌شود).

import { Medication, DoseOccurrence, ScheduleSlot } from '../../types';
import { ClockAdapter } from '../../adapters/ClockAdapter';
import {
  deriveScheduleFromMedication,
  isScheduledOnDay,
  intervalHoursForSlot,
  computeSlotInstant,
  isBeforeScheduleStart
} from '../scheduling/SchedulingEngine';
import { buildReminderPlan } from '../reminders/ReminderEngine';
import { isExemptFromDeadlineSystem } from '../rules/RuleEngine';

/** افق پیش‌فرض تولید — محدود و قابل‌تنظیم (نه کل تاریخ آینده)، طبق ریسک
 *  «سهمیه‌ی alarm دقیق اندروید» در بخش ۱۵ سند. */
export const DEFAULT_HORIZON_DAYS = 3;

function makeOccurrenceId(medId: string, slotId: string, scheduledAtISO: string): string {
  return `occ_${medId}_${slotId}_${scheduledAtISO}`;
}

export class OccurrenceGenerator {
  constructor(private clock: ClockAdapter) {}

  /** occurrenceهای جدید (فقط جدید — موجودها را دست نمی‌زند) لازم برای اینکه
   *  افق «horizonDays روز از الان» برای این دارو کامل باشد. */
  ensureHorizon(
    med: Medication,
    existing: DoseOccurrence[],
    horizonDays: number = DEFAULT_HORIZON_DAYS
  ): DoseOccurrence[] {
    if (!med.isActive) return [];
    const schedule = deriveScheduleFromMedication(med);
    const timeZoneId = this.clock.currentTimeZoneId();
    const now = this.clock.now();
    const nowLocal = this.clock.instantToZonedDate(now, timeZoneId);
    const created: DoseOccurrence[] = [];

    const existingKeys = new Set(existing.filter(o => o.medId === med.id).map(o => `${o.slotId}|${o.scheduledAt}`));

    for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
      const dayInstant = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dayLocal = this.clock.instantToZonedDate(dayInstant, timeZoneId);
      const { year, month, day, weekday } = dayLocal;
      if (!isScheduledOnDay(schedule, { day, weekday })) continue;

      schedule.slots.forEach((slot: ScheduleSlot) => {
        const t0 = computeSlotInstant(slot, { year, month, day }, timeZoneId, this.clock);
        // فقط occurrenceهایی که از «الان» جلوترند تولید می‌شوند (بخش ۳) —
        // اسلات‌هایی که امروز از قبل گذشته‌اند، در روند رول‌بندی روزانه‌ی
        // بعدی resolve/missed می‌شوند، نه اینکه هر بار از نو ساخته شوند؛
        // چون این تابع idempotent است، این فیلتر فقط از تولید occurrence
        // «مرده» (که هرگز pending واقعی نبوده) جلوگیری می‌کند.
        if (t0.getTime() < now.getTime() - 60 * 1000 && dayOffset === 0) return;
        if (isBeforeScheduleStart(schedule, t0)) return;

        const scheduledAtISO = t0.toISOString();
        const key = `${slot.slotId}|${scheduledAtISO}`;
        if (existingKeys.has(key)) return; // idempotency — بخش ۳

        const intervalHours = intervalHoursForSlot(schedule, slot.slotId);
        const exempt = isExemptFromDeadlineSystem(med);
        const { plan, deadlineAt } = buildReminderPlan(t0, intervalHours, exempt);

        const occurrence: DoseOccurrence = {
          id: makeOccurrenceId(med.id, slot.slotId, scheduledAtISO),
          medId: med.id,
          slotId: slot.slotId,
          familyMemberId: med.familyMemberId,
          scheduledAt: scheduledAtISO,
          deadlineAt: deadlineAt.toISOString(),
          status: 'pending',
          reminderPlan: plan,
          notificationIds: [],
          timezoneAtGeneration: timeZoneId,
          snoozeCount: 0,
          createdAt: now.toISOString()
        };
        created.push(occurrence);
        existingKeys.add(key);
      });
    }

    return created;
  }

  /** برای همه‌ی داروهای فعال — نتیجه‌ی جمع‌شده‌ی ensureHorizon، برای صدا زدن
   *  یک‌جا از App.tsx/AppLifecycleAdapter (بخش ۳). */
  ensureHorizonForAll(medications: Medication[], existing: DoseOccurrence[], horizonDays: number = DEFAULT_HORIZON_DAYS): DoseOccurrence[] {
    const created: DoseOccurrence[] = [];
    medications.forEach(med => {
      created.push(...this.ensureHorizon(med, [...existing, ...created], horizonDays));
    });
    return created;
  }

  /** بخش ۱۶ - «تغییر Time Zone»: regeneration فقط-آینده. occurrenceهای
   *  pending با scheduledAt نگذشته حذف و دوباره با timezone جدید ساخته
   *  می‌شوند؛ occurrenceهای گذشته/resolve‌شده دست‌نخورده می‌مانند
   *  (immutability rule). خروجی: { toRemoveIds, toAdd }. */
  regenerateFuturePendingOnTimezoneChange(
    medications: Medication[],
    existing: DoseOccurrence[],
    horizonDays: number = DEFAULT_HORIZON_DAYS
  ): { toRemoveIds: string[]; toAdd: DoseOccurrence[] } {
    const now = this.clock.now();
    const futurePending = existing.filter(o => o.status === 'pending' && new Date(o.scheduledAt).getTime() > now.getTime());
    const toRemoveIds = futurePending.map(o => o.id);
    const remaining = existing.filter(o => !toRemoveIds.includes(o.id));
    const toAdd = this.ensureHorizonForAll(medications, remaining, horizonDays);
    return { toRemoveIds, toAdd };
  }
}
