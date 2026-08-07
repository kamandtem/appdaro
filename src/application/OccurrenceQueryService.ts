// OccurrenceQueryService — لایه‌ی application (بخش ۴ سند: «چیزی که UI/App.tsx
// صدا می‌زند»، نه ResolverEngine مستقیم). UI فقط از این سرویس و از
// HomeQueueService می‌خواند — نه از DoseOccurrenceRepository خام — تا منطق
// «پله‌ی یادآوری فعلی» و «آیا امروز رفع‌شده» یک‌جا باشد (بخش ۰).

import { DoseOccurrence, Medication } from '../types';
import { ClockAdapter } from '../adapters/ClockAdapter';
import { DoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import { isExemptFromDeadlineSystem } from '../domain/rules/RuleEngine';

export type EscalationStep = 0 | 1 | 2 | 3;

export class OccurrenceQueryService {
  constructor(private repo: DoseOccurrenceRepository, private clock: ClockAdapter) {}

  /** پله‌ی یادآوری فعلی یک occurrence — نسخه‌ی جدید getEscalationStepForSlot
   *  قدیمی، ولی روی reminderPlan منجمدشده (نه محاسبه‌ی دوباره). */
  escalationStep(occurrence: DoseOccurrence, med: Medication | undefined): EscalationStep {
    if (!med || isExemptFromDeadlineSystem(med)) return 0;
    if (occurrence.status !== 'pending') return 0;
    const now = this.clock.now().getTime();
    if (now >= new Date(occurrence.deadlineAt).getTime()) return 3;
    const r2 = occurrence.reminderPlan.entries.find(e => e.kind === 'r2');
    const r1 = occurrence.reminderPlan.entries.find(e => e.kind === 'r1');
    if (r2 && now >= new Date(r2.at).getTime()) return 2;
    if (r1 && now >= new Date(r1.at).getTime()) return 1;
    return 0;
  }

  /** occurrenceهای یک بازه‌ی محلی مشخص (روز/هفته) — بازه با ClockAdapter
   *  محاسبه شده، نه با toISOString().split('T')[0] (بخش ۱۶ - نیمه‌شب). */
  occurrencesForLocalDateRange(startInstant: Date, endInstant: Date): DoseOccurrence[] {
    return this.repo.inRange(startInstant, endInstant);
  }

  /** بازه‌ی instant متناظر با یک روز تقویمی محلی مشخص — کمکی برای
   *  ReportsView تا خودش دیگر Date خام دستکاری نکند. */
  localDayRange(referenceInstant: Date, timeZoneId: string): { start: Date; end: Date } {
    const d = this.clock.instantToZonedDate(referenceInstant, timeZoneId);
    const start = this.clock.zonedTimeToInstant({ year: d.year, month: d.month, day: d.day, hour: 0, minute: 0 }, timeZoneId);
    const end = this.clock.zonedTimeToInstant({ year: d.year, month: d.month, day: d.day, hour: 23, minute: 59 }, timeZoneId);
    return { start, end: new Date(end.getTime() + 60 * 1000) };
  }

  todayOccurrences(timeZoneId: string): DoseOccurrence[] {
    const { start, end } = this.localDayRange(this.clock.now(), timeZoneId);
    return this.occurrencesForLocalDateRange(start, end);
  }
}
