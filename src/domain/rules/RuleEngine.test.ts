import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderPolicyFor, maxAllowedDelayHours, monthDayFallback, isDueOn, intervalHoursForSlot, activationLeadMinutes } from './RuleEngine';
import { weekdayOf } from '../shared/calendar';
import { MedicationSchedule } from '../../types';

// ---------------------------------------------------------------------------
// reminderPolicyFor — معادل isExemptFromDeadlineSystem قدیمی
// ---------------------------------------------------------------------------

test('reminderPolicyFor: safetyLevel critical => exempt', () => {
  const policy = reminderPolicyFor({ safetyLevel: 'critical' }, 8);
  assert.deepEqual(policy, { kind: 'exempt' });
});

test('reminderPolicyFor: isSingleDose true => exempt', () => {
  const policy = reminderPolicyFor({ isSingleDose: true }, 24);
  assert.deepEqual(policy, { kind: 'exempt' });
});

test('reminderPolicyFor: normal safety => standard با همان intervalHours', () => {
  const policy = reminderPolicyFor({ safetyLevel: 'normal' }, 8);
  assert.deepEqual(policy, { kind: 'standard', intervalHours: 8 });
});

test('reminderPolicyFor: بدون safety profile (داروی آزادتایپ‌شده) => standard', () => {
  const policy = reminderPolicyFor(undefined, 12);
  assert.deepEqual(policy, { kind: 'standard', intervalHours: 12 });
});

// ---------------------------------------------------------------------------
// maxAllowedDelayHours
// ---------------------------------------------------------------------------

test('maxAllowedDelayHours: برابر همان ثابت قدیمی (۶ ساعت)', () => {
  assert.equal(maxAllowedDelayHours(), 6);
});

// ---------------------------------------------------------------------------
// weekdayOf — صحت مبنایی که isDueOn(weekly) رویش بنا شده
// ---------------------------------------------------------------------------

test('weekdayOf: ۶ ژانویه ۲۰۲۴ واقعاً شنبه بوده (fact واقعی، نه محاسبه‌ی خودمون)', () => {
  assert.equal(weekdayOf({ year: 2024, month: 1, day: 6 }), 'شنبه');
});

test('weekdayOf: ۱ ژانویه ۲۰۲۴ واقعاً دوشنبه بوده', () => {
  assert.equal(weekdayOf({ year: 2024, month: 1, day: 1 }), 'دوشنبه');
});

// ---------------------------------------------------------------------------
// monthDayFallback — سیاست ماه‌های کوتاه‌تر
// ---------------------------------------------------------------------------

test('monthDayFallback: روز ۳۱ در آوریل (۳۰ روزه) => ۳۰', () => {
  const result = monthDayFallback(31, { year: 2024, month: 4 });
  assert.deepEqual(result, { year: 2024, month: 4, day: 30 });
});

test('monthDayFallback: روز ۱۵ در ماهی که ۱۵ روز رو داره => بدون تغییر', () => {
  const result = monthDayFallback(15, { year: 2024, month: 4 });
  assert.deepEqual(result, { year: 2024, month: 4, day: 15 });
});

test('monthDayFallback: روز ۲۹ فوریه در سال کبیسه (۲۰۲۴) => ۲۹ (بدون افتادن)', () => {
  const result = monthDayFallback(29, { year: 2024, month: 2 });
  assert.deepEqual(result, { year: 2024, month: 2, day: 29 });
});

test('monthDayFallback: روز ۲۹ فوریه در سال غیرکبیسه (۲۰۲۳) => ۲۸', () => {
  const result = monthDayFallback(29, { year: 2023, month: 2 });
  assert.deepEqual(result, { year: 2023, month: 2, day: 28 });
});

// ---------------------------------------------------------------------------
// isDueOn — قلب رفع باگ «weekly/monthly چک نمی‌شه» (DESIGN.md بخش ۰)
// ---------------------------------------------------------------------------

const baseSlot = { slotId: 'slot-1', timeOfDay: { hour: 8, minute: 0 }, order: 0 };

test('isDueOn: daily همیشه true است', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [baseSlot],
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(isDueOn(schedule, { year: 2024, month: 1, day: 1 }), true);
  assert.equal(isDueOn(schedule, { year: 2024, month: 6, day: 15 }), true);
});

test('isDueOn: weekly فقط در روزهای انتخاب‌شده true است — رفع باگ اصلی', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'weekly',
    slots: [baseSlot],
    selectedWeekdays: ['دوشنبه', 'چهارشنبه'],
    timezoneId: 'Asia/Tehran'
  };
  // ۱ ژانویه ۲۰۲۴ دوشنبه بود => باید due باشه
  assert.equal(isDueOn(schedule, { year: 2024, month: 1, day: 1 }), true);
  // ۲ ژانویه ۲۰۲۴ سه‌شنبه بود => نباید due باشه (این دقیقاً همون چیزیه که
  // سیستم فعلی رعایت نمی‌کنه)
  assert.equal(isDueOn(schedule, { year: 2024, month: 1, day: 2 }), false);
  // ۳ ژانویه ۲۰۲۴ چهارشنبه بود => باید due باشه
  assert.equal(isDueOn(schedule, { year: 2024, month: 1, day: 3 }), true);
});

test('isDueOn: weekly بدون selectedWeekdays => هیچ روزی due نیست', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'weekly',
    slots: [baseSlot],
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(isDueOn(schedule, { year: 2024, month: 1, day: 1 }), false);
});

test('isDueOn: monthly فقط در روز monthDay (با fallback ماه کوتاه) true است', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'monthly',
    slots: [baseSlot],
    monthDay: 31,
    timezoneId: 'Asia/Tehran'
  };
  // آوریل ۳۰ روزه => fallback به ۳۰
  assert.equal(isDueOn(schedule, { year: 2024, month: 4, day: 30 }), true);
  assert.equal(isDueOn(schedule, { year: 2024, month: 4, day: 29 }), false);
  // ماه ۳۱روزه => دقیقاً همون ۳۱
  assert.equal(isDueOn(schedule, { year: 2024, month: 5, day: 31 }), true);
  assert.equal(isDueOn(schedule, { year: 2024, month: 5, day: 30 }), false);
});

test('isDueOn: interval همیشه true است (قانون تاریخ‌محور روش این نوع نیست)', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'interval',
    slots: [baseSlot],
    intervalHours: 8,
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(isDueOn(schedule, { year: 2024, month: 1, day: 1 }), true);
});

// ---------------------------------------------------------------------------
// intervalHoursForSlot — معادل جدید intervalHoursForSlot قدیمی RuleEngine/ReminderEngine
// (تیکه ۶: ورودی مستقیم reminderPolicyFor در Occurrence Generator)
// ---------------------------------------------------------------------------

test('intervalHoursForSlot: interval => مستقیماً همون schedule.intervalHours', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'interval',
    slots: [baseSlot],
    intervalHours: 6,
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(intervalHoursForSlot(schedule, 'slot-1'), 6);
});

test('intervalHoursForSlot: interval بدون intervalHours معتبر => fallback ۲۴', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'interval',
    slots: [baseSlot],
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(intervalHoursForSlot(schedule, 'slot-1'), 24);
});

test('intervalHoursForSlot: daily با یک جایگاه => fallback ۲۴ (کمتر از ۲ جایگاه)', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [baseSlot],
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(intervalHoursForSlot(schedule, 'slot-1'), 24);
});

test('intervalHoursForSlot: daily با سه جایگاه (۸، ۱۴، ۲۱) => فاصله‌ی واقعی تا بعدی، با چرخش', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [
      { slotId: 'morning', timeOfDay: { hour: 8, minute: 0 }, order: 0 },
      { slotId: 'noon', timeOfDay: { hour: 14, minute: 0 }, order: 1 },
      { slotId: 'night', timeOfDay: { hour: 21, minute: 0 }, order: 2 }
    ],
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(intervalHoursForSlot(schedule, 'morning'), 6); // 8 -> 14
  assert.equal(intervalHoursForSlot(schedule, 'noon'), 7); // 14 -> 21
  assert.equal(intervalHoursForSlot(schedule, 'night'), 11); // 21 -> 8 فردا (24-21+8)
});

test('intervalHoursForSlot: ترتیب slots در آرایه مهم نیست، بر اساس timeOfDay مرتب می‌شه', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [
      { slotId: 'night', timeOfDay: { hour: 21, minute: 0 }, order: 2 },
      { slotId: 'morning', timeOfDay: { hour: 8, minute: 0 }, order: 0 },
      { slotId: 'noon', timeOfDay: { hour: 14, minute: 0 }, order: 1 }
    ],
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(intervalHoursForSlot(schedule, 'morning'), 6);
});

test('intervalHoursForSlot: slotId ناموجود => fallback ۲۴', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [
      { slotId: 'morning', timeOfDay: { hour: 8, minute: 0 }, order: 0 },
      { slotId: 'noon', timeOfDay: { hour: 14, minute: 0 }, order: 1 }
    ],
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(intervalHoursForSlot(schedule, 'does-not-exist'), 24);
});

test('intervalHoursForSlot: حداقل ۰.۲۵ ساعت (۱۵ دقیقه) — کف امنیتی معادل کد قدیمی', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [
      { slotId: 'a', timeOfDay: { hour: 8, minute: 0 }, order: 0 },
      { slotId: 'b', timeOfDay: { hour: 8, minute: 5 }, order: 1 }
    ],
    timezoneId: 'Asia/Tehran'
  };
  assert.equal(intervalHoursForSlot(schedule, 'a'), 0.25);
});

test('activationLeadMinutes: یک عدد ثابت مثبت و بزرگ‌تر از یادآور اول (۱۵ دقیقه) است', () => {
  const lead = activationLeadMinutes();
  assert.ok(lead > 15, 'کارت باید پیش از اولین یادآور واقعی روی صفحه بیاید');
  assert.equal(lead, activationLeadMinutes(), 'باید قطعی و بدون state باشد');
});
