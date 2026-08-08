import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IanaTimeZoneConverter } from './TimeZoneConverterAdapter';

const converter = new IanaTimeZoneConverter();

// ---------------------------------------------------------------------------
// آفست ثابت (Asia/Tehran — بدون DST از ۱۴۰۱ به بعد، DESIGN.md بخش ۱۶) —
// نتیجه باید دقیقاً همون چیزی باشه که FixedOffsetTimeZoneConverter(210) هم
// می‌داد، تا مطمئن بشیم پیاده‌سازی واقعی حداقل روی حالت ساده هم درست جواب می‌ده.
// ---------------------------------------------------------------------------

test('toInstant: Asia/Tehran (UTC+03:30) — ساعت ۰۸:۰۰ محلی به instant درست تبدیل می‌شه', () => {
  const instant = converter.toInstant({ year: 2026, month: 3, day: 15, hour: 8, minute: 0 }, 'Asia/Tehran');
  // ۰۸:۰۰ تهران == ۰۴:۳۰ UTC همون روز
  assert.equal(new Date(instant).toISOString(), '2026-03-15T04:30:00.000Z');
});

test('toLocal: عکسِ toInstant برای Asia/Tehran — round-trip دقیق', () => {
  const original = { year: 2026, month: 3, day: 15, hour: 8, minute: 0 };
  const instant = converter.toInstant(original, 'Asia/Tehran');
  const back = converter.toLocal(instant, 'Asia/Tehran');
  assert.deepEqual(back, original);
});

// ---------------------------------------------------------------------------
// DST واقعی — دقیقاً چیزی که FixedOffsetTimeZoneConverter (تیکه ۲) نمی‌تونه
// درست انجام بده، چون یک آفست ثابت فرض می‌کنه. اینجا با America/New_York
// (تایم‌زونی که واقعاً DST داره) نشون می‌دیم همون «ساعت دیواری ۰۸:۰۰» در دو
// فصل مختلف، دو آفست UTC متفاوت می‌گیره — دقیقاً طبق DESIGN.md بخش ۱۶.
// ---------------------------------------------------------------------------

test('DST: ۰۸:۰۰ محلی در زمستان (EST، UTC-05:00) با تابستان (EDT، UTC-04:00) یک ساعت فرق داره', () => {
  const winter = converter.toInstant({ year: 2026, month: 1, day: 15, hour: 8, minute: 0 }, 'America/New_York');
  const summer = converter.toInstant({ year: 2026, month: 7, day: 15, hour: 8, minute: 0 }, 'America/New_York');

  assert.equal(new Date(winter).toISOString(), '2026-01-15T13:00:00.000Z'); // EST = UTC-5
  assert.equal(new Date(summer).toISOString(), '2026-07-15T12:00:00.000Z'); // EDT = UTC-4

  // اگه یک آفست ثابت (مثل FixedOffsetTimeZoneConverter) استفاده می‌شد، این
  // دو تفاوت ساعتی هرگز رخ نمی‌داد — این خودِ نکته‌ای‌ست که این تست ثابت می‌کنه.
  const winterOffsetMs = winter - Date.UTC(2026, 0, 15, 8, 0);
  const summerOffsetMs = summer - Date.UTC(2026, 6, 15, 8, 0);
  assert.notEqual(winterOffsetMs, summerOffsetMs);
});

test('DST: round-trip toLocal روی هر دو طرف مرز DST درست کار می‌کنه', () => {
  for (const local of [
    { year: 2026, month: 1, day: 15, hour: 8, minute: 0 },
    { year: 2026, month: 7, day: 15, hour: 8, minute: 0 }
  ]) {
    const instant = converter.toInstant(local, 'America/New_York');
    const back = converter.toLocal(instant, 'America/New_York');
    assert.deepEqual(back, local);
  }
});

test('DST: عبور از لحظه‌ی spring-forward — یک زنجیره‌ی instant با فاصله‌ی ۲۴ساعته، ساعت دیواری رو حفظ نمی‌کنه چون DST جابجا شده', () => {
  // ۸ مارس ۲۰۲۶ ساعت ۰۲:۰۰ محلی نیویورک، ساعت‌ها یک ساعت جلو می‌رن (DST شروع می‌شه).
  const before = converter.toInstant({ year: 2026, month: 3, day: 7, hour: 8, minute: 0 }, 'America/New_York');
  const after = converter.toInstant({ year: 2026, month: 3, day: 9, hour: 8, minute: 0 }, 'America/New_York');
  const diffHours = (after - before) / (60 * 60 * 1000);
  // دو روز == ۴۸ ساعت دیواری، ولی چون یکی از این دو روز فقط ۲۳ ساعت واقعی
  // داره (spring-forward)، فاصله‌ی instant واقعی ۴۷ ساعته، نه ۴۸.
  assert.equal(diffHours, 47);
});

// ---------------------------------------------------------------------------
// تایم‌زون با آفست غیر-ساعت‌گرد (Asia/Tehran +03:30) — چک این‌که دقایق هم
// درست هندل می‌شن، نه فقط ساعت‌های صحیح.
// ---------------------------------------------------------------------------

test('toInstant: دقیقه‌های غیرصفر هم درست منتقل می‌شن (Asia/Tehran)', () => {
  const instant = converter.toInstant({ year: 2026, month: 6, day: 1, hour: 23, minute: 45 }, 'Asia/Tehran');
  assert.equal(new Date(instant).toISOString(), '2026-06-01T20:15:00.000Z');
});

// ---------------------------------------------------------------------------
// مستقل از تایم‌زون سیستم اجراکننده — نتیجه نباید به TZ محیط اجرا (که توی
// این sandbox معمولاً UTC هست) وابسته باشه. این تست صریحاً یک تایم‌زون با
// آفست مثبت (تهران) و یکی منفی (نیویورک) رو برای همون «ساعت دیواری» مقایسه
// می‌کنه تا مطمئن بشیم نتیجه از process.env.TZ استخراج نشده.
// ---------------------------------------------------------------------------

test('نتیجه واقعاً به timezoneId ورودی وابسته‌ست، نه به TZ سیستم اجراکننده', () => {
  const local = { year: 2026, month: 6, day: 1, hour: 12, minute: 0 };
  const tehran = converter.toInstant(local, 'Asia/Tehran');
  const newYork = converter.toInstant(local, 'America/New_York');
  assert.notEqual(tehran, newYork);
  // تهران (UTC+03:30) باید زودتر از نیویورک (UTC-04:00 در تابستان) باشه —
  // یعنی instant تهران برای همون ساعت دیواری، عددش کوچیک‌تره.
  assert.ok(tehran < newYork);
});
