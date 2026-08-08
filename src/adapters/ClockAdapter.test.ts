import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceClockAdapter, FakeClockAdapter } from './ClockAdapter';

// ---------------------------------------------------------------------------
// FakeClockAdapter — «freeze/travel» طبق تعریف بخش ۹
// ---------------------------------------------------------------------------

test('FakeClockAdapter: now() همون instant اولیه رو برمی‌گردونه تا وقتی travelTo صدا نشده', () => {
  const clock = new FakeClockAdapter(1000, 'Asia/Tehran');
  assert.equal(clock.now(), 1000);
  assert.equal(clock.now(), 1000); // فراخوانی دوم — بدون گذر زمان واقعی
});

test('FakeClockAdapter: travelTo زمان رو دقیقاً به همون لحظه می‌پرونه', () => {
  const clock = new FakeClockAdapter(1000, 'Asia/Tehran');
  clock.travelTo(50000);
  assert.equal(clock.now(), 50000);
});

test('FakeClockAdapter: currentTimeZoneId مقدار اولیه رو برمی‌گردونه', () => {
  const clock = new FakeClockAdapter(0, 'Asia/Tehran');
  assert.equal(clock.currentTimeZoneId(), 'Asia/Tehran');
});

test('FakeClockAdapter: setTimeZoneId با مقدار جدید همه‌ی listenerها رو صدا می‌زنه', () => {
  const clock = new FakeClockAdapter(0, 'Asia/Tehran');
  let calls = 0;
  clock.onTimeZoneChange(() => { calls++; });
  clock.setTimeZoneId('Europe/London');
  assert.equal(calls, 1);
  assert.equal(clock.currentTimeZoneId(), 'Europe/London');
});

test('FakeClockAdapter: setTimeZoneId با همون مقدار قبلی هیچ listenerای رو صدا نمی‌زنه', () => {
  const clock = new FakeClockAdapter(0, 'Asia/Tehran');
  let calls = 0;
  clock.onTimeZoneChange(() => { calls++; });
  clock.setTimeZoneId('Asia/Tehran'); // بدون تغییر واقعی
  assert.equal(calls, 0);
});

test('FakeClockAdapter: unsubscribe جلوی صدازدن listener رو می‌گیره', () => {
  const clock = new FakeClockAdapter(0, 'Asia/Tehran');
  let calls = 0;
  const unsubscribe = clock.onTimeZoneChange(() => { calls++; });
  unsubscribe();
  clock.setTimeZoneId('Europe/London');
  assert.equal(calls, 0);
});

test('FakeClockAdapter: چند listener مستقل، هر کدوم جدا unsubscribe می‌شن', () => {
  const clock = new FakeClockAdapter(0, 'Asia/Tehran');
  let callsA = 0;
  let callsB = 0;
  const unsubA = clock.onTimeZoneChange(() => { callsA++; });
  clock.onTimeZoneChange(() => { callsB++; });
  unsubA();
  clock.setTimeZoneId('Europe/London');
  assert.equal(callsA, 0, 'A باید unsubscribe شده باشه');
  assert.equal(callsB, 1, 'B همچنان باید صدا زده بشه');
});

// ---------------------------------------------------------------------------
// DeviceClockAdapter — با injected getTimeZoneId (بدون وابستگی به Intl واقعی)
// و تایمر جعلی node:test برای تست polling بدون صبر واقعی
// ---------------------------------------------------------------------------

test('DeviceClockAdapter: now() یک عدد نزدیک به Date.now() واقعیه', () => {
  const clock = new DeviceClockAdapter();
  const before = Date.now();
  const value = clock.now();
  const after = Date.now();
  assert.ok(value >= before && value <= after);
});

test('DeviceClockAdapter: currentTimeZoneId() از تابع injectشده می‌خونه', () => {
  const clock = new DeviceClockAdapter(60_000, () => 'Asia/Dubai');
  assert.equal(clock.currentTimeZoneId(), 'Asia/Dubai');
});

test('DeviceClockAdapter: با گذشت polling interval، تغییر تایم‌زون تشخیص داده می‌شه', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let tz = 'Asia/Tehran';
  const clock = new DeviceClockAdapter(60_000, () => tz);

  let calls = 0;
  clock.onTimeZoneChange(() => { calls++; });

  // هنوز تغییری نکرده — نباید صدا بخوره
  t.mock.timers.tick(60_000);
  assert.equal(calls, 0);

  // حالا واقعاً عوض می‌شه (مثلاً کاربر سفر کرده)
  tz = 'Europe/London';
  t.mock.timers.tick(60_000);
  assert.equal(calls, 1);

  // بدون تغییر بیشتر — نباید دوباره صدا بخوره
  t.mock.timers.tick(60_000);
  assert.equal(calls, 1);
});

test('DeviceClockAdapter: بدون هیچ listenerای، اصلاً polling شروع نمی‌شه (بدون setInterval بی‌مورد)', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let readCount = 0;
  new DeviceClockAdapter(60_000, () => { readCount++; return 'Asia/Tehran'; });
  // فقط همون یک بار توی constructor (برای lastKnownTimeZoneId) خونده می‌شه
  const afterConstruct = readCount;
  t.mock.timers.tick(120_000);
  assert.equal(readCount, afterConstruct, 'بدون subscriber نباید polling اجرا بشه');
});

test('DeviceClockAdapter: unsubscribe کردن آخرین listener، polling رو متوقف می‌کنه', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let tz = 'Asia/Tehran';
  const clock = new DeviceClockAdapter(60_000, () => tz);
  let calls = 0;
  const unsubscribe = clock.onTimeZoneChange(() => { calls++; });
  unsubscribe();

  tz = 'Europe/London';
  t.mock.timers.tick(120_000);
  assert.equal(calls, 0, 'بعد از unsubscribe نباید هیچ چیزی صدا بخوره');
});
