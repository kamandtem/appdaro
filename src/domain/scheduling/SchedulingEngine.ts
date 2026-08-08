// Scheduling Engine (DESIGN.md بخش ۲) — تابعی خالص (pure) که یک
// MedicationSchedule + یک بازه‌ی زمانی مرجع (from, to) می‌گیرد و فهرست
// لحظات مطلق (scheduledAt) هر «وعده»ای که در آن بازه باید رخ دهد را
// برمی‌گرداند — بدون آگاهی از «امروز»، بدون side effect، بدون دسترسی به
// دیتابیس یا نوتیفیکیشن. تنها dependency خارجی‌اش TimeZoneConverter است که
// از بیرون تزریق می‌شود (DI) — نه importشده مستقیم — تا این ماژول همچنان
// unit-testable با تایم‌زون جعلی بماند (DESIGN.md بخش ۹ و ۱۲).

import { Instant, MedicationSchedule } from '../../types';
import { LocalDate, addDays, compareLocalDate } from '../shared/calendar';
import { TimeZoneConverter } from '../shared/TimeZoneConverter';
import { isDueOn } from '../rules/RuleEngine';

export interface ScheduledOccurrence {
  slotId: string;
  scheduledAt: Instant;
}

/**
 * یک روزِ padding در هر دو طرف بازه اضافه می‌کنیم چون تبدیل «لحظه‌ی مرزی
 * بازه → تاریخ محلی» ممکن است تاریخی را نشان بدهد که یک وعده‌ی نزدیک به
 * نیمه‌شبِ همان روز، بعد از تبدیل به instant، دقیقاً همان لحظه‌ی مرزی را رد
 * کند یا نکند — بدون padding ممکن است یک وعده‌ی معتبر در لبه‌ی بازه از قلم
 * بیفتد. خودِ فیلتر نهایی (`instant >= from && instant <= to`) هر occurrence
 * خارج از بازه‌ی واقعی را حذف می‌کند، پس padding هرگز باعث نشتی به بیرون از
 * بازه نمی‌شود — فقط از نشتی به داخل (miss کردن یک occurrence مرزی) جلوگیری
 * می‌کند.
 */
function localDateRangeInclusive(
  range: { from: Instant; to: Instant },
  converter: TimeZoneConverter,
  timezoneId: string
): LocalDate[] {
  const startLocal = converter.toLocal(range.from, timezoneId);
  const endLocal = converter.toLocal(range.to, timezoneId);

  const dates: LocalDate[] = [];
  let cursor: LocalDate = addDays(startLocal, -1);
  const end: LocalDate = addDays(endLocal, 1);
  // محافظ در برابر بازه‌های غیرمعقول بزرگ که به‌اشتباه پاس داده شده باشند —
  // Occurrence Generator (فاز ۱) این تابع را فقط با یک افق rolling محدود
  // (مثلاً ۷۲ ساعت) صدا می‌زند، نه کل تاریخ آینده (DESIGN.md بخش ۱۵، ریسک
  // «سهمیه‌ی alarm دقیق اندروید»).
  let guard = 0;
  const GUARD_LIMIT = 3660; // ~۱۰ سال، صرفاً به‌عنوان سقف ایمنی نه یک محدودیت کاربردی
  while (compareLocalDate(cursor, end) <= 0 && guard < GUARD_LIMIT) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard++;
  }
  return dates;
}

/** مسیر daily/weekly/monthly: با حلقه‌زدن روی تاریخ‌های تقویمی محلی بازه،
 *  از RuleEngine.isDueOn برای فیلتر weekday/monthDay استفاده می‌کند
 *  (DESIGN.md بخش ۲: «Scheduling Engine جدید این فیلتر را در هسته‌ی تولید
 *  اعمال می‌کند، نه در لایه‌ی UI»). */
function expandByCalendarDate(
  schedule: MedicationSchedule,
  range: { from: Instant; to: Instant },
  converter: TimeZoneConverter
): ScheduledOccurrence[] {
  const tz = schedule.timezoneId;
  const dates = localDateRangeInclusive(range, converter, tz);
  const results: ScheduledOccurrence[] = [];

  for (const date of dates) {
    if (!isDueOn(schedule, date)) continue;
    for (const slot of schedule.slots) {
      const scheduledAt = converter.toInstant(
        { year: date.year, month: date.month, day: date.day, hour: slot.timeOfDay.hour, minute: slot.timeOfDay.minute },
        tz
      );
      if (scheduledAt >= range.from && scheduledAt <= range.to) {
        results.push({ slotId: slot.slotId, scheduledAt });
      }
    }
  }

  results.sort((a, b) => a.scheduledAt - b.scheduledAt);
  return results;
}

/**
 * مسیر interval: «یک زنجیره‌ی تکرارشونده با فاصله‌ی intervalHours، لنگرشده به
 * scheduleStartAt... نه دوباره‌محاسبه‌ی کدام ساعت الان سررسیده در هر بار
 * اجرا» (DESIGN.md بخش ۲). بر خلاف daily/weekly/monthly، این مسیر به
 * TimeZoneConverter نیازی ندارد — چون گام‌ها فاصله‌ی زمانی مطلق‌اند (نه
 * ساعت دیواری)، از یک لحظه‌ی مطلق (scheduleStartAt) جلو می‌روند.
 *
 * هویت این occurrenceها به `schedule.slots[0]` گره می‌خورد — برای interval،
 * مدل یک «جایگاه» تکرارشونده‌ی واحد است (نه چند وعده‌ی متفاوت در روز مثل
 * daily)، پس فقط یک ScheduleSlot معنا دارد.
 */
function expandInterval(
  schedule: MedicationSchedule,
  range: { from: Instant; to: Instant }
): ScheduledOccurrence[] {
  if (!schedule.intervalHours || schedule.intervalHours <= 0) return [];
  if (schedule.scheduleStartAt === undefined) return [];
  const slot = schedule.slots[0];
  if (!slot) return [];

  const stepMs = schedule.intervalHours * 60 * 60 * 1000;
  const anchor = schedule.scheduleStartAt;

  // اولین گام زنجیره که >= range.from است (یا خودِ anchor، اگر زنجیره هنوز
  // شروع نشده — یعنی anchor خودش داخل یا بعد از range.from باشد).
  let steps = Math.ceil((range.from - anchor) / stepMs);
  if (steps < 0) steps = 0;

  const results: ScheduledOccurrence[] = [];
  let t = anchor + steps * stepMs;
  while (t <= range.to) {
    if (t >= range.from) {
      results.push({ slotId: slot.slotId, scheduledAt: t });
    }
    t += stepMs;
  }
  return results;
}

/**
 * SchedulingEngine.expand — نقطه‌ی ورود عمومی (DESIGN.md بخش ۲).
 * برای هر frequencyType به مسیر مناسب می‌رود؛ خروجی همیشه بر اساس
 * scheduledAt صعودی مرتب است.
 */
export function expand(
  schedule: MedicationSchedule,
  range: { from: Instant; to: Instant },
  converter: TimeZoneConverter
): ScheduledOccurrence[] {
  if (range.to < range.from) return [];
  if (schedule.frequencyType === 'interval') {
    return expandInterval(schedule, range);
  }
  return expandByCalendarDate(schedule, range, converter);
}
