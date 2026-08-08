import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escalationStepFor, plan } from './ReminderEngine';
function expectedEscalation(intervalHours: number) {
  return { reminder1Minutes: 15, reminder2Minutes: intervalHours / 4 * 60, deadlineMinutes: Math.min(intervalHours / 2, 6) * 60 };
}

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const scheduledAt = Date.UTC(2024, 0, 6, 8, 0, 0, 0); // یک لحظه‌ی دلخواه، فقط برای تست

// ---------------------------------------------------------------------------
// exempt — دقیقاً معادل isExemptFromDeadlineSystem امروز
// ---------------------------------------------------------------------------

test('plan: exempt فقط شامل dose_time است — بدون r1/r2/deadline', () => {
  const result = plan({ scheduledAt }, { kind: 'exempt' });
  assert.deepEqual(result.entries, [{ kind: 'dose_time', fireAt: scheduledAt }]);
});

// ---------------------------------------------------------------------------
// standard — فرمول سه‌گانه
// ---------------------------------------------------------------------------

test('plan: standard با intervalHours=8 — دقیقاً چهار ورودی به ترتیب درست', () => {
  const result = plan({ scheduledAt }, { kind: 'standard', intervalHours: 8 });
  assert.deepEqual(result.entries.map(e => e.kind), ['dose_time', 'r1', 'r2', 'deadline']);
  assert.equal(result.entries[0].fireAt, scheduledAt);
  assert.equal(result.entries[1].fireAt, scheduledAt + 15 * MS_PER_MINUTE);
  assert.equal(result.entries[2].fireAt, scheduledAt + 2 * MS_PER_HOUR); // 8/4 = 2h
  assert.equal(result.entries[3].fireAt, scheduledAt + 4 * MS_PER_HOUR); // min(8/2=4, 6) = 4h
});

test('plan: standard با intervalHours=24 — deadline باید به سقف MAX_ALLOWED_DELAY_HOURS (۶) محدود بشه', () => {
  const result = plan({ scheduledAt }, { kind: 'standard', intervalHours: 24 });
  const deadline = result.entries.find(e => e.kind === 'deadline')!;
  // min(24/2=12, 6) = 6 — بدون این سقف، دوز صبح می‌تونست تا نیمه‌شب مهلت داشته باشه
  assert.equal(deadline.fireAt, scheduledAt + 6 * MS_PER_HOUR);
});

test('plan: standard با intervalHours خیلی کوچیک (۱ ساعت) — r2/deadline هم متناسب کوچیک می‌شن', () => {
  const result = plan({ scheduledAt }, { kind: 'standard', intervalHours: 1 });
  const r2 = result.entries.find(e => e.kind === 'r2')!;
  const deadline = result.entries.find(e => e.kind === 'deadline')!;
  assert.equal(r2.fireAt, scheduledAt + 0.25 * MS_PER_HOUR); // 1/4 = 15min
  assert.equal(deadline.fireAt, scheduledAt + 0.5 * MS_PER_HOUR); // min(0.5, 6) = 0.5h
});

// ---------------------------------------------------------------------------
// خلوص (purity): خروجی فقط به ورودی وابسته است، نه به «الان»
// ---------------------------------------------------------------------------

test('plan: فراخوانی دوباره با همون ورودی دقیقاً همون خروجی رو می‌ده (بدون وابستگی به Date.now)', () => {
  const a = plan({ scheduledAt }, { kind: 'standard', intervalHours: 12 });
  const b = plan({ scheduledAt }, { kind: 'standard', intervalHours: 12 });
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// کراس‌چک با فرمول قراردادشده‌ی طراحی —
// تضمین می‌کند ReminderEngine دقیقاً فرمول مصوب DESIGN.md را حفظ کرده
// «باید حفظ شود» رو حفظ کرده، نه یک نسخه‌ی مشابه ولی کمی متفاوت.
// ---------------------------------------------------------------------------

test('plan: برای چند intervalHours مختلف، افست‌های r1/r2/deadline دقیقاً با فرمول مصوب یکسانه', () => {
  for (const intervalHours of [0.5, 1, 4, 6, 8, 12, 16, 24, 48]) {
    const legacy = expectedEscalation(intervalHours);
    const result = plan({ scheduledAt }, { kind: 'standard', intervalHours });

    const r1 = result.entries.find(e => e.kind === 'r1')!;
    const r2 = result.entries.find(e => e.kind === 'r2')!;
    const deadline = result.entries.find(e => e.kind === 'deadline')!;

    assert.equal(r1.fireAt - scheduledAt, legacy.reminder1Minutes * MS_PER_MINUTE, `r1 mismatch for intervalHours=${intervalHours}`);
    assert.equal(r2.fireAt - scheduledAt, legacy.reminder2Minutes * MS_PER_MINUTE, `r2 mismatch for intervalHours=${intervalHours}`);
    assert.equal(deadline.fireAt - scheduledAt, legacy.deadlineMinutes * MS_PER_MINUTE, `deadline mismatch for intervalHours=${intervalHours}`);
  }
});

// ---------------------------------------------------------------------------
// escalationStepFor (تیکه ۱۰ — DESIGN.md بخش ۱۷.۵)
// ---------------------------------------------------------------------------

test('escalationStepFor: چهار پله دقیقاً روی مرزهای همان plan منجمد', () => {
  const t0 = Date.UTC(2026, 2, 10, 6, 0);
  const p = plan({ scheduledAt: t0 }, { kind: 'standard', intervalHours: 8 });

  assert.equal(escalationStepFor(p, t0 - 1), 0);
  assert.equal(escalationStepFor(p, t0), 0);
  assert.equal(escalationStepFor(p, t0 + 15 * 60 * 1000 - 1), 0);
  assert.equal(escalationStepFor(p, t0 + 15 * 60 * 1000), 1);
  assert.equal(escalationStepFor(p, t0 + 2 * 60 * 60 * 1000), 2); // interval/4
  assert.equal(escalationStepFor(p, t0 + 4 * 60 * 60 * 1000), 3); // interval/2
  assert.equal(escalationStepFor(p, t0 + 50 * 60 * 60 * 1000), 3);
});

test('escalationStepFor: plan داروی exempt (فقط dose_time) همیشه پله‌ی ۰ می‌دهد', () => {
  const t0 = Date.UTC(2026, 2, 10, 6, 0);
  const p = plan({ scheduledAt: t0 }, { kind: 'exempt' });

  assert.equal(escalationStepFor(p, t0), 0);
  assert.equal(escalationStepFor(p, t0 + 100 * 60 * 60 * 1000), 0);
});
