import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKeyValueStorage, LocalStoragePersistenceAdapter } from '../../adapters/LocalStoragePersistenceAdapter';
import { LocalStorageDoseOccurrenceRepository } from '../../repository/DoseOccurrenceRepository';
import { FakeClockAdapter } from '../../adapters/ClockAdapter';
import { FixedOffsetTimeZoneConverter } from '../shared/TimeZoneConverter';
import { ensureHorizon, EXEMPT_DEADLINE_SENTINEL, OccurrenceGeneratorDeps } from './OccurrenceGenerator';
import { MedicationAggregate, MedicationSchedule } from '../../types';

const TEHRAN_OFFSET_MINUTES = 210; // UTC+03:30

function makeDeps(nowInstant: number): OccurrenceGeneratorDeps {
  const repo = new LocalStorageDoseOccurrenceRepository(new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage()));
  const clock = new FakeClockAdapter(nowInstant, 'Asia/Tehran');
  const converter = new FixedOffsetTimeZoneConverter(TEHRAN_OFFSET_MINUTES);
  let counter = 0;
  return {
    converter,
    clock,
    occurrenceRepository: repo,
    generateId: () => `occ-${++counter}`
  };
}

function schedule(overrides: Partial<MedicationSchedule> = {}): MedicationSchedule {
  return {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [{ slotId: 'morning', timeOfDay: { hour: 8, minute: 0 }, order: 0 }],
    timezoneId: 'Asia/Tehran',
    ...overrides
  };
}

function med(overrides: Partial<MedicationAggregate> = {}): MedicationAggregate {
  return {
    id: 'med-1',
    name: 'قرص تست',
    form: 'قرص',
    dose: '۱ عدد',
    schedule: schedule(),
    safety: {},
    remainingCount: 30,
    totalCount: 30,
    alertThreshold: 5,
    isActive: true,
    familyMemberId: 'me',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// تولید پایه — یک داروی daily با یک جایگاه، افق یک‌روزه
// ---------------------------------------------------------------------------

test('ensureHorizon: برای یک داروی daily، دقیقاً یک occurrence در افق یک‌روزه می‌سازه', () => {
  const now = Date.UTC(2026, 2, 1, 0, 0); // 2026-03-01T00:00:00Z
  const deps = makeDeps(now);
  const horizon = { from: now, to: now + 24 * 60 * 60 * 1000 };

  const result = ensureHorizon([med()], horizon, deps);

  assert.equal(result.created, 1);
  assert.equal(result.canceled, 0);
  const all = deps.occurrenceRepository.findByMedication('med-1');
  assert.equal(all.length, 1);
  assert.equal(all[0].status, 'pending');
  assert.equal(all[0].slotId, 'morning');
  assert.equal(all[0].scheduleVersion, 1);
});

test('ensureHorizon: idempotent — صدازدن دوباره با همون افق رکورد تکراری نمی‌سازه', () => {
  const now = Date.UTC(2026, 2, 1, 0, 0);
  const deps = makeDeps(now);
  const horizon = { from: now, to: now + 24 * 60 * 60 * 1000 };

  ensureHorizon([med()], horizon, deps);
  const second = ensureHorizon([med()], horizon, deps);

  assert.equal(second.created, 0);
  assert.equal(deps.occurrenceRepository.findByMedication('med-1').length, 1);
});

test('ensureHorizon: داروی غیرفعال هیچ occurrence ای تولید نمی‌کنه', () => {
  const now = Date.UTC(2026, 2, 1, 0, 0);
  const deps = makeDeps(now);
  const horizon = { from: now, to: now + 24 * 60 * 60 * 1000 };

  const result = ensureHorizon([med({ isActive: false })], horizon, deps);

  assert.equal(result.created, 0);
  assert.equal(deps.occurrenceRepository.findByMedication('med-1').length, 0);
});

// ---------------------------------------------------------------------------
// reminderPlan / deadlineAt — یک‌بار محاسبه‌شده، منجمد روی خود occurrence
// ---------------------------------------------------------------------------

test('ensureHorizon: reminderPlan و deadlineAt طبق فرمول استاندارد محاسبه می‌شن', () => {
  const now = Date.UTC(2026, 2, 1, 0, 0);
  const deps = makeDeps(now);
  const horizon = { from: now, to: now + 24 * 60 * 60 * 1000 };

  // یک جایگاه تنها => intervalHoursForSlot به ۲۴ fallback می‌کنه (کمتر از ۲ جایگاه)
  ensureHorizon([med({ safety: { safetyLevel: 'normal' } })], horizon, deps);

  const [occurrence] = deps.occurrenceRepository.findByMedication('med-1');
  const kinds = occurrence.reminderPlan.entries.map(e => e.kind).sort();
  assert.deepEqual(kinds, ['deadline', 'dose_time', 'r1', 'r2']);

  const deadlineEntry = occurrence.reminderPlan.entries.find(e => e.kind === 'deadline')!;
  assert.equal(occurrence.deadlineAt, deadlineEntry.fireAt);
  // interval=24 => deadline = min(24/2, 6) = 6 ساعت بعد از scheduledAt
  assert.equal(occurrence.deadlineAt, occurrence.scheduledAt + 6 * 60 * 60 * 1000);
});

test('ensureHorizon: داروی exempt (critical) فقط dose_time داره و deadlineAt به sentinel می‌ره', () => {
  const now = Date.UTC(2026, 2, 1, 0, 0);
  const deps = makeDeps(now);
  const horizon = { from: now, to: now + 24 * 60 * 60 * 1000 };

  ensureHorizon([med({ safety: { safetyLevel: 'critical' } })], horizon, deps);

  const [occurrence] = deps.occurrenceRepository.findByMedication('med-1');
  assert.deepEqual(occurrence.reminderPlan.entries.map(e => e.kind), ['dose_time']);
  assert.equal(occurrence.deadlineAt, EXEMPT_DEADLINE_SENTINEL);
});

test('ensureHorizon: timezoneAtGeneration از ClockAdapter.currentTimeZoneId گرفته می‌شه', () => {
  const now = Date.UTC(2026, 2, 1, 0, 0);
  const deps = makeDeps(now);
  const horizon = { from: now, to: now + 24 * 60 * 60 * 1000 };

  ensureHorizon([med()], horizon, deps);

  const [occurrence] = deps.occurrenceRepository.findByMedication('med-1');
  assert.equal(occurrence.timezoneAtGeneration, 'Asia/Tehran');
});

// ---------------------------------------------------------------------------
// ابطال occurrenceهای آینده‌ی pending با scheduleVersion قدیمی (بخش ۳)
// ---------------------------------------------------------------------------

test('ensureHorizon: تغییر schedule (نسخه جدید) occurrenceهای آینده‌ی pending نسخه‌ی قدیمی رو canceled می‌کنه', () => {
  const now = Date.UTC(2026, 2, 1, 0, 0);
  const deps = makeDeps(now);
  const horizon = { from: now, to: now + 3 * 24 * 60 * 60 * 1000 };

  ensureHorizon([med()], horizon, deps); // نسخه ۱ — چند occurrence ساخته می‌شه

  const versionedMed = med({
    schedule: schedule({ scheduleVersion: 2, slots: [{ slotId: 'morning-v2', timeOfDay: { hour: 9, minute: 0 }, order: 0 }] })
  });
  const result = ensureHorizon([versionedMed], horizon, deps);

  assert.ok(result.canceled >= 1);
  const all = deps.occurrenceRepository.findByMedication('med-1');
  const oldVersionOnes = all.filter(o => o.scheduleVersion === 1);
  const newVersionOnes = all.filter(o => o.scheduleVersion === 2);
  assert.ok(oldVersionOnes.every(o => o.status === 'canceled'));
  assert.ok(newVersionOnes.every(o => o.status === 'pending'));
  assert.ok(newVersionOnes.length > 0);
});

test('ensureHorizon: occurrenceهای گذشته (scheduledAt <= now) هرگز canceled نمی‌شن، حتی با نسخه‌ی قدیمی', () => {
  const now = Date.UTC(2026, 2, 5, 0, 0);
  const deps = makeDeps(now);

  // یک occurrence دستی از گذشته با نسخه‌ی ۱ بسازیم، جوری که هنوز pending باشه
  // (فرض: کاربر هنوز باز نکرده اپ رو تا Resolver اون رو missed کنه).
  deps.occurrenceRepository.upsertIfAbsent({
    id: 'past-occ',
    medicationId: 'med-1',
    slotId: 'morning',
    scheduleVersion: 1,
    scheduledAt: now - 60 * 60 * 1000, // یک ساعت قبل از «الان»
    deadlineAt: now - 30 * 60 * 1000,
    reminderPlan: { entries: [{ kind: 'dose_time', fireAt: now - 60 * 60 * 1000 }] },
    status: 'pending',
    snoozeCount: 0,
    notificationIds: {},
    timezoneAtGeneration: 'Asia/Tehran',
    createdAt: now - 2 * 60 * 60 * 1000,
    updatedAt: now - 2 * 60 * 60 * 1000
  });

  const versionedMed = med({ schedule: schedule({ scheduleVersion: 2 }) });
  const horizon = { from: now, to: now + 24 * 60 * 60 * 1000 };
  ensureHorizon([versionedMed], horizon, deps);

  const past = deps.occurrenceRepository.getById('past-occ')!;
  assert.equal(past.status, 'pending'); // دست‌نخورده — immutability rule
});

test('ensureHorizon: occurrenceهای resolve‌شده (taken/skipped/missed) هرگز canceled نمی‌شن', () => {
  const now = Date.UTC(2026, 2, 1, 0, 0);
  const deps = makeDeps(now);

  deps.occurrenceRepository.upsertIfAbsent({
    id: 'resolved-occ',
    medicationId: 'med-1',
    slotId: 'morning',
    scheduleVersion: 1,
    scheduledAt: now + 60 * 60 * 1000, // در آینده، ولی از قبل resolve شده
    deadlineAt: now + 3 * 60 * 60 * 1000,
    reminderPlan: { entries: [{ kind: 'dose_time', fireAt: now + 60 * 60 * 1000 }] },
    status: 'taken',
    resolvedAt: now,
    resolvedBy: 'user',
    snoozeCount: 0,
    notificationIds: {},
    timezoneAtGeneration: 'Asia/Tehran',
    createdAt: now - 60 * 60 * 1000,
    updatedAt: now
  });

  const versionedMed = med({ schedule: schedule({ scheduleVersion: 2 }) });
  const horizon = { from: now, to: now + 24 * 60 * 60 * 1000 };
  ensureHorizon([versionedMed], horizon, deps);

  const resolved = deps.occurrenceRepository.getById('resolved-occ')!;
  assert.equal(resolved.status, 'taken'); // دست‌نخورده
});

// ---------------------------------------------------------------------------
// چند دارو هم‌زمان — یکی نباید روی دیگری اثر بذاره
// ---------------------------------------------------------------------------

test('ensureHorizon: چند دارو مستقل از هم پردازش می‌شن', () => {
  const now = Date.UTC(2026, 2, 1, 0, 0);
  const deps = makeDeps(now);
  const horizon = { from: now, to: now + 24 * 60 * 60 * 1000 };

  const medA = med({ id: 'med-a' });
  const medB = med({ id: 'med-b', schedule: schedule({ slots: [{ slotId: 'noon', timeOfDay: { hour: 14, minute: 0 }, order: 0 }] }) });

  const result = ensureHorizon([medA, medB], horizon, deps);

  assert.equal(result.created, 2);
  assert.equal(deps.occurrenceRepository.findByMedication('med-a').length, 1);
  assert.equal(deps.occurrenceRepository.findByMedication('med-b').length, 1);
});
