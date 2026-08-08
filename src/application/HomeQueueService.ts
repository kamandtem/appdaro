// HomeQueueService — بخش ۱۷.۲ سند طراحی.
//
// «الان چه چیزی روی صفحه‌ی خانه دیده شود؟» — این لایه‌ی presentation کاملاً
// جدا از Domain است (Domain همچنان همه‌ی occurrenceهای افق را در Repository
// دارد و نوتیفیکیشن‌هایشان طبق بخش ۶ زمان‌بندی می‌شود). هم StackedCards
// (پنل خانه) و هم نوار اعلان «نوبت بعدی» بالای صفحه (بخش ۱۷.۶) دقیقاً از
// همین یک تابع می‌خوانند — منبع واحد، نه دو محاسبه‌ی مستقل.

import { DoseOccurrence, Medication } from '../types';
import { ClockAdapter } from '../adapters/ClockAdapter';
import { OccurrenceQueryService } from './OccurrenceQueryService';
import { ACTIVATION_LEAD_MINUTES, MAX_VISIBLE_HOME_CARDS } from '../domain/rules/RuleEngine';

export class HomeQueueService {
  constructor(
    private queryService: OccurrenceQueryService,
    private clock: ClockAdapter
  ) {}

  /** قانون ۱: فقط occurrenceهای pending که scheduledAt - activationLeadMinutes
   *  <= now باشند «فعال»اند.
   *  قانون ۲: از میان فعال‌ها، حداکثر MAX_VISIBLE_HOME_CARDS تا، به ترتیب
   *  اولویت (سررسیدشده‌ترین/بالاترین پله‌ی escalation اول، دقیقاً طبق همان
   *  منطق escalation-step قبلی).
   *  قانون ۳ و ۴: بقیه در همین محاسبه (نه در Repository) صف می‌مانند و از دید
   *  UI پنهان‌اند تا نوبتشان برسد. */
  visibleCards(occurrences: DoseOccurrence[], medications: Medication[]): DoseOccurrence[] {
    const now = this.clock.now();
    const leadMs = ACTIVATION_LEAD_MINUTES * 60 * 1000;
    const medById = new Map(medications.map(m => [m.id, m]));

    const active = occurrences.filter(o => {
      if (o.status !== 'pending') return false;
      const activationTime = new Date(o.scheduledAt).getTime() - leadMs;
      return activationTime <= now.getTime();
    });

    const sorted = [...active].sort((a, b) => {
      const stepA = this.queryService.escalationStep(a, medById.get(a.medId));
      const stepB = this.queryService.escalationStep(b, medById.get(b.medId));
      if (stepA !== stepB) return stepB - stepA; // سررسیدشده‌ترین/بالاترین پله اول
      // بین دو occurrence با پله‌ی یکسان: کارت «بعداً»خورده (snoozeCount > 0)
      // یک پله عقب‌تر می‌رود (بخش ۱۷.۳).
      const snoozedA = a.snoozeCount > 0 ? 1 : 0;
      const snoozedB = b.snoozeCount > 0 ? 1 : 0;
      if (snoozedA !== snoozedB) return snoozedA - snoozedB;
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    });

    return sorted.slice(0, MAX_VISIBLE_HOME_CARDS);
  }

  /** اولین آیتم visibleCards — دقیقاً چیزی که نوار «نوبت بعدی» بالای صفحه
   *  باید نشان دهد (بخش ۱۷.۶). */
  nextUp(occurrences: DoseOccurrence[], medications: Medication[]): DoseOccurrence | undefined {
    return this.visibleCards(occurrences, medications)[0];
  }
}
