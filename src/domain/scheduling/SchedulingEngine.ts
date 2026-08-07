// SchedulingEngine — بخش ۲ سند طراحی. کاملاً pure: هیچ I/O، هیچ localStorage،
// هیچ Date.now() مستقیم — «الان» و timezone همیشه از بیرون (ClockAdapter) تزریق
// می‌شن. فقط قوانین تولید T0 هر جایگاه، بر اساس frequencyType.

import { MedicationSchedule, ScheduleSlot, FrequencyType } from '../../types';
import { ClockAdapter } from '../../adapters/ClockAdapter';
import { toEnglishNumbers } from '../../utils/persian';

export function parseSlotMinutes(slot: ScheduleSlot): { hour: number; minute: number } {
  const en = toEnglishNumbers(slot.timeOfDay);
  const [h, m] = en.split(':').map(n => parseInt(n, 10));
  return { hour: Number.isNaN(h) ? 8 : h, minute: Number.isNaN(m) ? 0 : m };
}

const WEEKDAY_FA_TO_INDEX: Record<string, number> = {
  'یکشنبه': 0, 'دوشنبه': 1, 'سه‌شنبه': 2, 'چهارشنبه': 3, 'پنجشنبه': 4, 'جمعه': 5, 'شنبه': 6
};

/** آیا این تاریخ (بر اساس weekday محلی) روزی است که طبق frequency باید دوز
 *  تولید شود؟ برای 'هر روز' و 'هر چند ساعت' همیشه true؛ برای 'روزهای هفته'
 *  فقط روزهای انتخاب‌شده؛ برای 'ماهانه' فقط روز مشخص‌شده‌ی ماه. */
export function isScheduledOnDay(schedule: MedicationSchedule, dateInfo: { day: number; weekday: number }): boolean {
  if (schedule.frequency === 'روزهای هفته') {
    if (!schedule.selectedDays || schedule.selectedDays.length === 0) return true;
    return schedule.selectedDays.some(d => WEEKDAY_FA_TO_INDEX[d] === dateInfo.weekday);
  }
  if (schedule.frequency === 'ماهانه') {
    return schedule.monthDay === dateInfo.day;
  }
  return true; // 'هر روز' و 'هر چند ساعت'
}

/** فاصله‌ی واقعی (ساعت) بین یک جایگاه و جایگاه/دوز بعدی — معادل
 *  intervalHoursForSlot قدیمی، ولی روی MedicationSchedule کار می‌کند. */
export function intervalHoursForSlot(schedule: MedicationSchedule, slotId: string): number {
  if (schedule.frequency === 'هر چند ساعت' && schedule.customIntervalHours) {
    return schedule.customIntervalHours;
  }
  const minutesList = schedule.slots
    .map(s => { const { hour, minute } = parseSlotMinutes(s); return { slotId: s.slotId, minutes: hour * 60 + minute }; })
    .sort((a, b) => a.minutes - b.minutes);
  if (minutesList.length < 2) return 24;
  const idx = minutesList.findIndex(m => m.slotId === slotId);
  if (idx === -1) return 24;
  const current = minutesList[idx].minutes;
  const next = idx === minutesList.length - 1 ? minutesList[0].minutes + 24 * 60 : minutesList[idx + 1].minutes;
  return Math.max(0.25, (next - current) / 60);
}

/** T0 (لحظه‌ی مطلق سررسید) یک جایگاه، برای یک روز تقویمی محلی مشخص —
 *  timezone-aware، از طریق ClockAdapter (بخش ۱۶ - DST). */
export function computeSlotInstant(
  slot: ScheduleSlot,
  localDate: { year: number; month: number; day: number },
  timeZoneId: string,
  clock: ClockAdapter
): Date {
  const { hour, minute } = parseSlotMinutes(slot);
  return clock.zonedTimeToInstant({ ...localDate, hour, minute }, timeZoneId);
}

/** آیا این schedule هنوز شروع نشده (scheduleStartAt در آینده نسبت به تاریخ
 *  محلی داده‌شده)؟ */
export function isBeforeScheduleStart(schedule: MedicationSchedule, instant: Date): boolean {
  if (!schedule.scheduleStartAt) return false;
  return instant.getTime() < new Date(schedule.scheduleStartAt).getTime();
}

export type { FrequencyType };

// ---------------------------------------------------------------------------
// پل مهاجرت (بخش ۱۰ و ۱۳): Medication فعلی هنوز فیلدهای پراکنده‌ی قدیمی
// (times/frequency/...) را دارد، نه یک MedicationSchedule واحد — AddMedicationWizard
// در فاز ۴/۵ به‌تدریج به خروجی MedicationSchedule سوییچ می‌کند (بخش ۱۳). تا آن
// زمان، این تابع پل بین دو مدل است: از روی فیلدهای legacy یک MedicationSchedule
// معادل می‌سازد — slotId پایدار از خودِ مقدار ساعت مشتق می‌شود (نه از ایندکس
// در آرایه، که با حذف/جابه‌جایی وعده‌ها تغییر می‌کرد و باعث تولید occurrence
// تکراری می‌شد؛ نگاه کن به توضیح داخل deriveScheduleFromMedication).
import { Medication } from '../../types';

export function deriveScheduleFromMedication(med: Medication): MedicationSchedule {
  const times = med.times && med.times.length > 0 ? med.times : ['۰۸:۰۰'];
  // رفع اساسی باگ بی‌ثباتی slotId (که قبلاً از ایندکس آرایه ساخته می‌شد):
  // slotId حالا از خودِ مقدار ساعت (نه موقعیتش در آرایه) مشتق می‌شود. با این
  // تغییر، حذف/جابه‌جایی یکی از وعده‌های یک دارو دیگر id بقیه‌ی وعده‌ها را
  // عوض نمی‌کند — چون به موقعیت آن‌ها در آرایه‌ی times بستگی ندارد، به مقدار
  // ساعتشان بستگی دارد. قبلاً وقتی کاربر یک وعده را حذف می‌کرد، ایندکس بقیه
  // یک واحد جابه‌جا می‌شد، slotId عوض می‌شد، idempotency-check در
  // OccurrenceGenerator آن را «جایگاه جدید» تشخیص می‌داد و یک occurrence
  // تکراری برای همان دوز واقعی می‌ساخت (کارت/نوتیفیکیشن دوتایی).
  const seen = new Map<string, number>();
  return {
    frequency: med.frequency,
    slots: times.map(t => {
      const normalized = toEnglishNumbers(t);
      const count = seen.get(normalized) ?? 0;
      seen.set(normalized, count + 1);
      // اگر (به‌ندرت) دو وعده دقیقاً یک ساعت یکسان داشته باشند، شمارنده به id
      // اضافه می‌شود تا برخورد نکنند — ولی خودِ ترتیبشان همچنان بی‌اهمیت است.
      const slotId = count === 0 ? `${med.id}::${normalized}` : `${med.id}::${normalized}::${count}`;
      return { slotId, timeOfDay: normalized };
    }),
    customIntervalHours: med.customIntervalHours,
    selectedDays: med.selectedDays,
    monthDay: med.monthDay,
    scheduleStartAt: med.scheduleStartAt
  };
}

/** از روی slotId مشتق‌شده (`${medId}::HH:mm` یا با پسوند شمارنده)، مقدار
 *  ساعتِ آن جایگاه را استخراج می‌کند — برای نگاشت به ایندکس در
 *  medicationTimeSlots(med) هنگام dual-write به DoseLog قدیمی. */
export function timeOfDayFromSlotId(slotId: string): string | undefined {
  const parts = slotId.split('::');
  return parts.length >= 2 ? parts[1] : undefined;
}
