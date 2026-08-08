// Rule Engine — تنها محل تصمیمات کسب‌وکاری خالص (بدون state، بدون I/O)
// (DESIGN.md بخش ۷). امروز این تصمیمات در سه‌جای مختلف RuleEngine/ReminderEngine
// پراکنده‌اند (isExemptFromDeadlineSystem، isCriticalSafetyMed،
// MAX_ALLOWED_DELAY_HOURS) + یک قانون که اصلاً پیاده نشده (فیلتر
// weekday/monthDay). این فایل جایگزین همه‌ی این‌ها می‌شود.
//
// این ماژول توسط SchedulingEngine (برای isDueOn) و ReminderEngine (برای
// reminderPolicyFor) صدا زده می‌شود؛ خودش به هیچ‌کدام وابسته نیست — جهت
// وابستگی یک‌طرفه است (DESIGN.md بخش ۱۲).

import { MedicationSafetyProfile, MedicationSchedule, ReminderPolicy, Weekday } from '../../types';
import { LocalDate, daysInMonth, weekdayOf } from '../shared/calendar';

/** سقف قابل‌تغییر مهلت مصرف دیرهنگام — جلوی ددلاین‌های نامعقول (مثل دوز صبح
 *  که تا نیمه‌شب مهلت داشته باشد) را می‌گیرد. معادل مستقیم همان ثابت در
 *  RuleEngine/ReminderEngine قدیمی، فقط حالا در یک نقطه‌ی متمرکز (Rule Engine)، نه یک
 *  export پراکنده در یک فایل utils. فقط همین‌جا تغییرش بده. */
const MAX_ALLOWED_DELAY_HOURS = 6;

/**
 * سیاست یادآوری یک دارو، بر اساس پروفایل ایمنی cache‌شده‌اش.
 *
 * ورودی این تابع عمداً `MedicationSafetyProfile` است، نه کل Medication
 * Aggregate جدید (که هنوز به‌طور کامل در فاز ۰ به کد اپ وصل نشده — طبق تصمیم
 * تیکه‌ی ۱: مدل قدیمی `Medication` در types/index.ts دست‌نخورده ماند و
 * Aggregate جدید هنوز به AddMedicationWizard/App.tsx وصل نیست). Rule Engine
 * فقط چیزی را می‌گیرد که واقعاً لازم دارد — این با DESIGN.md بخش ۷ سازگار
 * است (خروجی یک تابع خالص بر اساس ورودی مینیمال)؛ وقتی در فاز ۲/۱۲ کل
 * Medication Aggregate وصل شود، فراخوانی این تابع به‌سادگی
 * `RuleEngine.reminderPolicyFor(medication.safety)` می‌شود.
 *
 * منطق: معادل دقیق `isExemptFromDeadlineSystem` امروز — safetyLevel:
 * 'critical' یا isSingleDose یعنی exempt؛ در غیر این صورت استاندارد، با
 * intervalHours همان فاصله‌ی واقعی بین دو دوز (که SchedulingEngine محاسبه و
 * پاس می‌دهد).
 */
export function reminderPolicyFor(safety: MedicationSafetyProfile | undefined, intervalHours: number): ReminderPolicy {
  const isExempt = safety?.safetyLevel === 'critical' || safety?.isSingleDose === true;
  if (isExempt) {
    return { kind: 'exempt' };
  }
  return { kind: 'standard', intervalHours };
}

/** سقف مهلت دیرکرد — config متمرکز، نه ثابت پراکنده در چند فایل. */
export function maxAllowedDelayHours(): number {
  return MAX_ALLOWED_DELAY_HOURS;
}

/**
 * سیاست صریح برای monthDay در ماه‌هایی که آن روز را ندارند (مثلاً ۳۱ در یک
 * ماه ۳۰روزه). طبق پیشنهاد DESIGN.md بخش ۲: fallback به آخرین روز همان ماه.
 * این یک تصمیم محصولی مستند‌شده است، نه حدس ضمنی در کد.
 */
export function monthDayFallback(monthDay: number, month: { year: number; month: number }): LocalDate {
  const lastDay = daysInMonth(month.year, month.month);
  const day = Math.min(Math.max(1, monthDay), lastDay);
  return { year: month.year, month: month.month, day };
}

/**
 * آیا طبق این `MedicationSchedule`، در این تاریخ تقویمی مشخص، دارو باید مصرف
 * شود؟ (DESIGN.md بخش ۷).
 *
 * - `daily`: همیشه true — هر روز.
 * - `weekly`: فقط اگر روز هفته‌ی `calendarDate` در `selectedWeekdays` باشد.
 *   **این دقیقاً همان فیلتری است که در سیستم فعلی پیاده نشده و باگ زنده‌ی
 *   امروز است** (DESIGN.md بخش ۰ و ۲) — اینجا اولین بار اعمال می‌شود.
 * - `monthly`: فقط اگر روز `calendarDate` با نتیجه‌ی `monthDayFallback`
 *   برای همان ماه برابر باشد (نه لزوماً خودِ `monthDay` خام، برای ماه‌های
 *   کوتاه‌تر).
 * - `interval`: این تابع برای این نوع معنا ندارد — زنجیره‌ی interval روی
 *   لحظات مطلق (نه تاریخ تقویمی) پیش می‌رود و به‌طور مستقل توسط خودِ
 *   SchedulingEngine جلو برده می‌شود (DESIGN.md بخش ۲: «نه دوباره‌محاسبه‌ی
 *   کدام ساعت الان سررسیده... خود Occurrence Generator زنجیره را جلو
 *   می‌برد»)؛ اینجا صرفاً true برمی‌گرداند تا این قانون مانع تولید نشود.
 */
export function isDueOn(schedule: MedicationSchedule, calendarDate: LocalDate): boolean {
  switch (schedule.frequencyType) {
    case 'daily':
    case 'interval':
      return true;
    case 'weekly': {
      const allowed: Weekday[] = schedule.selectedWeekdays ?? [];
      return allowed.includes(weekdayOf(calendarDate));
    }
    case 'monthly': {
      if (schedule.monthDay === undefined) return false;
      const resolved = monthDayFallback(schedule.monthDay, { year: calendarDate.year, month: calendarDate.month });
      return resolved.day === calendarDate.day;
    }
    default:
      return false;
  }
}

function timeOfDayToMinutes(t: { hour: number; minute: number }): number {
  return t.hour * 60 + t.minute;
}

/**
 * فاصله‌ی واقعی (ساعت) بین دوز یک `slotId` مشخص و دوز *بعدی* — ورودی مستقیم
 * `RuleEngine.reminderPolicyFor` (بخش ۵: «intervalHours همان فاصله‌ی واقعی
 * بین دو دوز که SchedulingEngine محاسبه و پاس می‌دهد»؛ در عمل این محاسبه
 * اینجاست، نه در SchedulingEngine، چون خالص و بر پایه‌ی زمان تقویمی است، نه
 * تولید occurrence).
 *
 * این تابع معادل دقیق `intervalHoursForSlot` قدیمی در `RuleEngine/ReminderEngine`
 * است (تیکه ۳ همان فرمول سه‌گانه را روی خروجی این نوع محاسبه کراس‌چک کرد)،
 * فقط حالا روی `ScheduleSlot[]` جدید (به‌جای رشته‌های `med.times`) کار
 * می‌کند — نه بر ایندکس آرایه بلکه بر `slotId` پایدار (DESIGN.md بخش ۱ -
 * «چرا slotId به‌جای slotIndex»):
 *
 * - `frequencyType: 'interval'`: مستقیماً خودِ `schedule.intervalHours`
 *   (معادل رفتار قدیمی `customIntervalHours`).
 * - بقیه (`daily`/`weekly`/`monthly`): فاصله تا نزدیک‌ترین `ScheduleSlot`
 *   بعدی در همون روز، بر اساس `timeOfDay` مرتب‌شده؛ اگر `slotId` آخرین
 *   جایگاه روز باشد، فاصله تا اولین جایگاه *روز بعد* (چرخش +۲۴ساعت) —
 *   دقیقاً همان رفتار قدیمی. اگر کمتر از ۲ جایگاه وجود داشته باشد یا
 *   `slotId` پیدا نشود، به ۲۴ ساعت fallback می‌شود (معادل حالت
 *   `minutesList.length < 2` قدیمی).
 */
export function intervalHoursForSlot(schedule: MedicationSchedule, slotId: string): number {
  if (schedule.frequencyType === 'interval') {
    return schedule.intervalHours && schedule.intervalHours > 0 ? schedule.intervalHours : 24;
  }
  if (schedule.slots.length < 2) return 24;

  const sorted = [...schedule.slots].sort(
    (a, b) => timeOfDayToMinutes(a.timeOfDay) - timeOfDayToMinutes(b.timeOfDay)
  );
  const idx = sorted.findIndex(s => s.slotId === slotId);
  if (idx === -1) return 24;

  const current = timeOfDayToMinutes(sorted[idx].timeOfDay);
  const isLast = idx === sorted.length - 1;
  const nextRaw = timeOfDayToMinutes(sorted[isLast ? 0 : idx + 1].timeOfDay);
  const next = isLast ? nextRaw + 24 * 60 : nextRaw;

  return Math.max(0.25, (next - current) / 60);
}

/**
 * «پنجره‌ی فعال‌سازی» نمایش کارت در پنل خانه — چند دقیقه مانده به وقت مصرف،
 * یک occurrence وارد صف *دیدنی* می‌شود (DESIGN.md بخش ۱۷.۲، قانون ۱).
 *
 * سند صراحتاً می‌گوید «عدد دقیقش یک پارامتر Rule Engine است، نه چیز
 * hardcoded» — پس همین‌جا زندگی می‌کند، کنار `maxAllowedDelayHours`، نه داخل
 * `HomeQueueService` و قطعاً نه داخل کامپوننت UI.
 *
 * مقدار پیش‌فرض ۳۰ دقیقه: سند خودش عددی پیشنهاد نداده بود. ۳۰ دقیقه انتخاب
 * شد چون از `r1` (یادآور اول، T0+۱۵ دقیقه) بزرگ‌تر است — یعنی کارت همیشه
 * *پیش* از اولین یادآوری واقعی روی صفحه هست، نه بعد از آن؛ و هم‌زمان به‌قدری
 * کوتاه است که پنل خانه دوباره به همان شلوغی‌ای که بخش ۱۷.۲ می‌خواهد رفعش
 * کند برنگردد. تغییرش فقط از همین‌جا.
 */
const ACTIVATION_LEAD_MINUTES = 30;

export function activationLeadMinutes(): number {
  return ACTIVATION_LEAD_MINUTES;
}
