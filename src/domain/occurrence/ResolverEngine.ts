// ResolverEngine — بخش ۴ سند طراحی.
//
// تنها مسیر مجاز برای تغییر وضعیت یک DoseOccurrence. هیچ کد UI مستقیماً
// occurrence.status را عوض نمی‌کند — همه از این کلاس عبور می‌کنند (بخش ۱۶ -
// Missed: «فقط و فقط Resolver Engine.sweepMissed مجاز به این transition
// است»). خروجی هر عملیات شامل «رویداد دامنه» (Domain Event) است تا لایه‌های
// دیگر (NotificationEngine برای cancel، dual-write به DoseLog) بدون coupling
// مستقیم به همین کلاس، واکنش نشان دهند.

import { DoseOccurrence, OccurrenceStatus, SkipReason } from '../../types';
import { ClockAdapter } from '../../adapters/ClockAdapter';
import { isExemptFromDeadlineSystem } from '../rules/RuleEngine';
import { Medication } from '../../types';

export type ResolverEvent =
  | { type: 'resolved'; occurrence: DoseOccurrence; previousStatus: OccurrenceStatus }
  | { type: 'missed'; occurrence: DoseOccurrence }
  | { type: 'snoozed'; occurrence: DoseOccurrence };

export interface ResolverResult {
  occurrence: DoseOccurrence;
  event: ResolverEvent;
}

/** وضعیت‌هایی که یعنی «تکلیف این occurrence برای همیشه مشخص شده» — بعد از
 *  این هیچ یادآور پله‌ای دیگری نباید برایش شلیک شود (بخش ۴). */
const RESOLVED_STATUSES: OccurrenceStatus[] = ['taken', 'skipped', 'missed'];

export class ResolverEngine {
  constructor(private clock: ClockAdapter) {}

  /** «مصرف شد» / «رد شد» — تنها راه رسیدن یک occurrence به یکی از این دو
   *  وضعیت نهایی. concurrency guarantee (بخش ۴): اگر occurrence از قبل
   *  resolved باشد، عملیات idempotent است — همان occurrence بدون تغییر
   *  برگردانده می‌شود، دوباره resolve نمی‌شود (جلوگیری از دوبار کم‌شدن
   *  remainingCount در تپ دوبل). */
  resolve(occurrence: DoseOccurrence, status: 'taken' | 'skipped', skipReason?: SkipReason): ResolverResult {
    if (RESOLVED_STATUSES.includes(occurrence.status)) {
      return { occurrence, event: { type: 'resolved', occurrence, previousStatus: occurrence.status } };
    }
    const previousStatus = occurrence.status;
    const updated: DoseOccurrence = {
      ...occurrence,
      status,
      resolvedAt: this.clock.now().toISOString(),
      skipReason: status === 'skipped' ? skipReason : undefined
    };
    return { occurrence: updated, event: { type: 'resolved', occurrence: updated, previousStatus } };
  }

  /** «بعداً» — بخش ۱۶ (Snooze): تغییری در ددلاین/reminderPlan نمی‌دهد، فقط
   *  snoozeCount را بالا می‌برد؛ status همچنان 'pending' می‌ماند. */
  snooze(occurrence: DoseOccurrence): ResolverResult {
    if (RESOLVED_STATUSES.includes(occurrence.status)) {
      return { occurrence, event: { type: 'snoozed', occurrence } };
    }
    const updated: DoseOccurrence = { ...occurrence, snoozeCount: occurrence.snoozeCount + 1 };
    return { occurrence: updated, event: { type: 'snoozed', occurrence: updated } };
  }

  /** sweepMissed — بخش ۱۶ (Missed). روی کل backlog pending اجرا می‌شود (نه
   *  فقط «امروز») تا دوزهای ازدست‌رفته حتی وقتی گوشی چند روز خاموش بوده هم
   *  در گزارش‌ها گم نشوند. داروهای مستثنا (critical/تک‌دوزه) هرگز خودکار
   *  missed نمی‌شوند. */
  sweepMissed(occurrences: DoseOccurrence[], medications: Medication[]): ResolverResult[] {
    const now = this.clock.now();
    const medById = new Map(medications.map(m => [m.id, m]));
    const results: ResolverResult[] = [];

    occurrences.forEach(occ => {
      if (occ.status !== 'pending') return;
      const med = medById.get(occ.medId);
      if (!med || isExemptFromDeadlineSystem(med)) return;
      if (now.getTime() < new Date(occ.deadlineAt).getTime()) return;

      const updated: DoseOccurrence = { ...occ, status: 'missed', resolvedAt: now.toISOString() };
      results.push({ occurrence: updated, event: { type: 'missed', occurrence: updated } });
    });

    return results;
  }
}
