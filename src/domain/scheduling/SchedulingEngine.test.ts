import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expand } from './SchedulingEngine';
import { FixedOffsetTimeZoneConverter } from '../shared/TimeZoneConverter';
import { MedicationSchedule } from '../../types';

// آفست تهران: UTC+03:30 = ۲۱۰ دقیقه. طبق DESIGN.md بخش ۱۶، ایران از ۱۴۰۱
// دیگر DST ندارد — همین باعث می‌شه FixedOffsetTimeZoneConverter برای این
// تست‌ها یک fake دقیق (نه فقط ساده‌شده) باشه.
const TEHRAN_OFFSET_MINUTES = 210;
const converter = new FixedOffsetTimeZoneConverter(TEHRAN_OFFSET_MINUTES);
const TZ = 'Asia/Tehran';

function utc(y: number, m: number, d: number, h = 0, min = 0): number {
  return Date.UTC(y, m - 1, d, h, min, 0, 0);
}

// ---------------------------------------------------------------------------
// daily
// ---------------------------------------------------------------------------

test('expand: daily با یک slot، هر روز در بازه یک occurrence می‌سازه', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [{ slotId: 'morning', timeOfDay: { hour: 8, minute: 0 }, order: 0 }],
    timezoneId: TZ
  };
  // بازه: از نیمه‌شب ۶ ژانویه تا نیمه‌شب ۸ ژانویه (به وقت UTC، برای سادگی بازه)
  const range = { from: utc(2024, 1, 6, 0, 0), to: utc(2024, 1, 8, 0, 0) };
  const result = expand(schedule, range, converter);

  // ساعت ۰۸:۰۰ محلی تهران = ۰۴:۳۰ UTC (چون تهران ۳:۳۰ جلوتره)
  const expected = [
    utc(2024, 1, 6, 4, 30),
    utc(2024, 1, 7, 4, 30)
    // ۸ ژانویه ۰۴:۳۰ UTC از range.to (نیمه‌شب ۸ ژانویه UTC) بزرگ‌تره، پس نیست
  ];
  assert.deepEqual(result.map(r => r.scheduledAt), expected);
  assert.ok(result.every(r => r.slotId === 'morning'));
});

test('expand: daily با چند slot، همه‌ی slotها هر روز تولید می‌شن', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [
      { slotId: 'morning', timeOfDay: { hour: 8, minute: 0 }, order: 0 },
      { slotId: 'night', timeOfDay: { hour: 21, minute: 0 }, order: 1 }
    ],
    timezoneId: TZ
  };
  const range = { from: utc(2024, 1, 6, 0, 0), to: utc(2024, 1, 7, 0, 0) };
  const result = expand(schedule, range, converter);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(r => r.slotId).sort(), ['morning', 'night']);
});

// ---------------------------------------------------------------------------
// weekly — رفع باگ اصلی (DESIGN.md بخش ۰)
// ---------------------------------------------------------------------------

test('expand: weekly فقط در روزهای انتخاب‌شده occurrence می‌سازه، نه هر روز', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'weekly',
    slots: [{ slotId: 'evening', timeOfDay: { hour: 20, minute: 0 }, order: 0 }],
    selectedWeekdays: ['شنبه'], // فقط شنبه‌ها
    timezoneId: TZ
  };
  // بازه‌ی ۱۰روزه که دو شنبه توش هست: ۶ ژانویه (شنبه) و ۱۳ ژانویه (شنبه)
  const range = { from: utc(2024, 1, 5, 0, 0), to: utc(2024, 1, 15, 0, 0) };
  const result = expand(schedule, range, converter);

  assert.equal(result.length, 2, 'فقط ۲ occurrence باید تولید بشه (دو شنبه)، نه ۱۰ تا برای هر روز');
  assert.deepEqual(result.map(r => r.scheduledAt), [
    utc(2024, 1, 6, 16, 30), // ۶ ژانویه ۲۰:۰۰ تهران = ۱۶:۳۰ UTC
    utc(2024, 1, 13, 16, 30)
  ]);
});

// ---------------------------------------------------------------------------
// monthly — با fallback ماه کوتاه‌تر
// ---------------------------------------------------------------------------

test('expand: monthly با monthDay=31 در آوریل (۳۰روزه) روی ۳۰ اُم می‌افته', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'monthly',
    slots: [{ slotId: 'monthly-dose', timeOfDay: { hour: 7, minute: 0 }, order: 0 }],
    monthDay: 31,
    timezoneId: TZ
  };
  const range = { from: utc(2024, 4, 1, 0, 0), to: utc(2024, 5, 1, 0, 0) };
  const result = expand(schedule, range, converter);

  assert.equal(result.length, 1);
  assert.equal(result[0].scheduledAt, utc(2024, 4, 30, 3, 30)); // ۰۷:۰۰ تهران = ۰۳:۳۰ UTC
});

// ---------------------------------------------------------------------------
// interval — زنجیره‌ی لنگرشده، نه حدس زنده
// ---------------------------------------------------------------------------

test('expand: interval هر ۸ ساعت از anchor، داخل یک بازه‌ی ۲۴ساعته ۳ occurrence می‌سازه', () => {
  const anchor = utc(2024, 1, 6, 6, 0); // یک لحظه‌ی مطلق دلخواه به‌عنوان شروع
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'interval',
    slots: [{ slotId: 'every-8h', timeOfDay: { hour: 0, minute: 0 }, order: 0 }],
    intervalHours: 8,
    scheduleStartAt: anchor,
    timezoneId: TZ
  };
  const range = { from: anchor, to: anchor + 24 * 60 * 60 * 1000 };
  const result = expand(schedule, range, converter);

  assert.deepEqual(result.map(r => r.scheduledAt), [
    anchor,
    anchor + 8 * 60 * 60 * 1000,
    anchor + 16 * 60 * 60 * 1000,
    anchor + 24 * 60 * 60 * 1000
  ]);
  assert.ok(result.every(r => r.slotId === 'every-8h'));
});

test('expand: interval وقتی بازه از وسط زنجیره شروع می‌شه، درست resume می‌کنه (نه از anchor)', () => {
  const anchor = utc(2024, 1, 1, 0, 0);
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'interval',
    slots: [{ slotId: 'every-6h', timeOfDay: { hour: 0, minute: 0 }, order: 0 }],
    intervalHours: 6,
    scheduleStartAt: anchor,
    timezoneId: TZ
  };
  // بازه از ۵ روز بعد از anchor شروع می‌شه — زنجیره باید همچنان دقیقاً روی
  // مضرب‌های ۶ساعته‌ی anchor بمونه، نه یک anchor جدید حدسی
  const from = anchor + 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000; // anchor + ۵روز و ۳ساعت
  const to = from + 12 * 60 * 60 * 1000;
  const result = expand(schedule, range_(from, to), converter);

  // اولین مضرب ۶ساعته‌ی anchor که >= from باشه:
  const stepMs = 6 * 60 * 60 * 1000;
  const firstExpected = anchor + Math.ceil((from - anchor) / stepMs) * stepMs;
  assert.ok(result.length >= 1);
  assert.equal(result[0].scheduledAt, firstExpected);
  assert.equal((result[0].scheduledAt - anchor) % stepMs, 0, 'باید دقیقاً روی مضرب زنجیره‌ی اصلی بمونه');
});

function range_(from: number, to: number) {
  return { from, to };
}

test('expand: interval بدون scheduleStartAt چیزی تولید نمی‌کنه', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'interval',
    slots: [{ slotId: 'every-8h', timeOfDay: { hour: 0, minute: 0 }, order: 0 }],
    intervalHours: 8,
    timezoneId: TZ
  };
  const result = expand(schedule, { from: utc(2024, 1, 1), to: utc(2024, 1, 2) }, converter);
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// edge cases عمومی
// ---------------------------------------------------------------------------

test('expand: بازه‌ی معکوس (to < from) همیشه آرایه‌ی خالی برمی‌گردونه', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [{ slotId: 'morning', timeOfDay: { hour: 8, minute: 0 }, order: 0 }],
    timezoneId: TZ
  };
  const result = expand(schedule, { from: utc(2024, 1, 10), to: utc(2024, 1, 5) }, converter);
  assert.deepEqual(result, []);
});

test('expand: خروجی همیشه بر اساس scheduledAt صعودی مرتبه', () => {
  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [
      { slotId: 'night', timeOfDay: { hour: 21, minute: 0 }, order: 1 },
      { slotId: 'morning', timeOfDay: { hour: 8, minute: 0 }, order: 0 }
    ],
    timezoneId: TZ
  };
  const range = { from: utc(2024, 1, 6, 0, 0), to: utc(2024, 1, 8, 0, 0) };
  const result = expand(schedule, range, converter);
  const times = result.map(r => r.scheduledAt);
  const sorted = [...times].sort((a, b) => a - b);
  assert.deepEqual(times, sorted);
});
