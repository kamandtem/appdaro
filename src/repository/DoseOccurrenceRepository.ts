// DoseOccurrenceRepository — بخش ۸ سند طراحی.
//
// این Repository به‌جای نگه‌داشتن state خودش، روی آرایه‌ای از DoseOccurrence که
// از AppState (منبع واحد state در این اپ React) گرفته می‌شود کار می‌کند —
// یعنی wrapper نازک با کوئری‌های استاندارد، نه یک DB مستقل. این تصمیم عمدی است:
// اپ همچنان از یک useState واحد در App.tsx تغذیه می‌شود (بخش ۹ - Adapter Layer
// روی همین واقعیت طراحی شده)، ولی هیچ کامپوننتی دیگر مستقیماً آرایه‌ی خام را
// فیلتر نمی‌کند — همه از متدهای این کلاس عبور می‌کنند، تا منطق کوئری یک‌جا
// باشد (بخش ۰ - ریشه‌ی واقعی مشکل: منابع محاسبه‌ی پراکنده).

import { DoseOccurrence, OccurrenceStatus } from '../types';

const RETENTION_DAYS = 120;

export class DoseOccurrenceRepository {
  constructor(private occurrences: DoseOccurrence[]) {}

  all(): DoseOccurrence[] {
    return this.occurrences;
  }

  byId(id: string): DoseOccurrence | undefined {
    return this.occurrences.find(o => o.id === id);
  }

  forMedication(medId: string): DoseOccurrence[] {
    return this.occurrences.filter(o => o.medId === medId);
  }

  /** تمام occurrenceهای هنوز pending — ورودی اصلی sweepMissed و
   *  NotificationEngine.syncOccurrence (بخش ۴ و ۶). */
  pending(): DoseOccurrence[] {
    return this.occurrences.filter(o => o.status === 'pending');
  }

  byStatus(status: OccurrenceStatus): DoseOccurrence[] {
    return this.occurrences.filter(o => o.status === status);
  }

  /** آخرین occurrence شناخته‌شده برای یک (medId, slotId) — برای اینکه
   *  Occurrence Generator بداند از کجا به بعد باید افق را ادامه دهد. */
  latestForSlot(medId: string, slotId: string): DoseOccurrence | undefined {
    return this.occurrences
      .filter(o => o.medId === medId && o.slotId === slotId)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
  }

  /** کلید طبیعی idempotency (بخش ۳): همان (medId, slotId, scheduledAt) که
   *  قبلاً ساخته شده دوباره ساخته نمی‌شود. */
  existsForSlotAt(medId: string, slotId: string, scheduledAtISO: string): boolean {
    return this.occurrences.some(o => o.medId === medId && o.slotId === slotId && o.scheduledAt === scheduledAtISO);
  }

  /** occurrenceهای یک بازه‌ی محلی مشخص (برای ReportsView — بخش ۱۶: بازه بر
   *  اساس ClockAdapter محاسبه می‌شود، نه توسط این Repository؛ اینجا فقط
   *  فیلتر instant است). */
  inRange(startInstant: Date, endInstant: Date): DoseOccurrence[] {
    const s = startInstant.getTime();
    const e = endInstant.getTime();
    return this.occurrences.filter(o => {
      const t = new Date(o.scheduledAt).getTime();
      return t >= s && t < e;
    });
  }

  /** استراتژی retention (بخش ۸ و ریسک «رشد نامحدود حجم occurrence» در بخش
   *  ۱۵): occurrenceهای resolve‌شده‌ی قدیمی‌تر از RETENTION_DAYS حذف می‌شوند.
   *  pending هرگز pruned نمی‌شود (حتی اگر گذشته باشد — باید توسط sweepMissed
   *  رسیدگی شود، نه گم شود). */
  pruneOld(now: Date): DoseOccurrence[] {
    const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return this.occurrences.filter(o => o.status === 'pending' || new Date(o.scheduledAt).getTime() >= cutoff);
  }
}
