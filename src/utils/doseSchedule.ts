// doseSchedule.ts — فاز ۵ سند طراحی (پاک‌سازی).
//
// این فایل دیگر منطق ندارد — منطق واقعی به‌طور کامل به domain/scheduling،
// domain/rules و domain/reminders منتقل شده (بخش ۱، ۲، ۵، ۷). طبق جدول بخش
// ۱۳، Header.tsx و MedicationList.tsx «بدون تغییر معماری» باقی می‌مانند؛ این
// فایل صرفاً همان چند تابعی را که آن دو هنوز صدا می‌زنند، به‌عنوان یک لایه‌ی
// نازک سازگاری (thin compatibility shim) روی موتورهای جدید ارائه می‌دهد —
// تا بدون دست‌زدن به آن دو فایل (که خارج از دامنه‌ی این مهاجرت‌اند)، دوباره
// همان فرمول‌های تکراری اینجا نوشته نشوند.

import { Medication, DoseLog } from '../types';
import { deriveScheduleFromMedication, intervalHoursForSlot as engineIntervalHoursForSlot, parseSlotMinutes } from '../domain/scheduling/SchedulingEngine';
import { computeEscalation as engineComputeEscalation } from '../domain/reminders/ReminderEngine';
import { isExemptFromDeadlineSystem, isCriticalSafetyMed } from '../domain/rules/RuleEngine';
import { toEnglishNumbers } from './persian';

export { isExemptFromDeadlineSystem, isCriticalSafetyMed };

export function medicationTimeSlots(med: Medication): string[] {
  return med.times && med.times.length > 0 ? med.times : ['۰۸:۰۰'];
}

export function isDoseSlotResolvedToday(medId: string, slotIndex: number, doseLogs: DoseLog[], todayStr: string): boolean {
  return doseLogs.some(l =>
    l.medId === medId &&
    (l.slotIndex ?? 0) === slotIndex &&
    l.date === todayStr &&
    (l.status === 'taken' || l.status === 'skipped' || l.status === 'missed')
  );
}

export function findTodaySlotLog(medId: string, slotIndex: number, doseLogs: DoseLog[], todayStr: string): DoseLog | undefined {
  return doseLogs.find(l => l.medId === medId && (l.slotIndex ?? 0) === slotIndex && l.date === todayStr);
}

export function parseTimeToMinutes(time: string): number | null {
  const en = toEnglishNumbers(time);
  const [h, m] = en.split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

export function intervalHoursForSlot(med: Medication, index: number): number {
  const schedule = deriveScheduleFromMedication(med);
  const slot = schedule.slots[index];
  if (!slot) return 24;
  return engineIntervalHoursForSlot(schedule, slot.slotId);
}

export { engineComputeEscalation as computeEscalation };
export { parseSlotMinutes };
