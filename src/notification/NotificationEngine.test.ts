import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKeyValueStorage, LocalStoragePersistenceAdapter } from '../adapters/LocalStoragePersistenceAdapter';
import { LocalStorageDoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import { FakeClockAdapter } from '../adapters/ClockAdapter';
import { FakeNotificationAdapter } from '../adapters/CapacitorNotificationAdapter';
import {
  syncOccurrence,
  cancelRemaining,
  isNotificationEngineEnabled,
  setNotificationEngineEnabled,
  createResolverEventBridge,
  NotificationEngineDeps,
  NotificationMedicationInfo
} from './NotificationEngine';
import { DoseOccurrence } from '../types';
import type { ResolverEvent } from '../domain/occurrence/ResolverEngine';

const NOW = Date.UTC(2026, 2, 1, 12, 0);

const MED: NotificationMedicationInfo = { name: 'استامینوفن', dose: '۱ قرص', form: 'قرص' };

function occ(overrides: Partial<DoseOccurrence> = {}): DoseOccurrence {
  return {
    id: 'occ-1',
    medicationId: 'med-1',
    slotId: 'slot-1',
    scheduleVersion: 1,
    scheduledAt: NOW + 60 * 60 * 1000,
    deadlineAt: NOW + 90 * 60 * 1000,
    reminderPlan: {
      entries: [
        { kind: 'dose_time', fireAt: NOW + 60 * 60 * 1000 },
        { kind: 'r1', fireAt: NOW + 60 * 60 * 1000 + 15 * 60 * 1000 },
        { kind: 'r2', fireAt: NOW + 75 * 60 * 1000 },
        { kind: 'deadline', fireAt: NOW + 90 * 60 * 1000 }
      ]
    },
    status: 'pending',
    snoozeCount: 0,
    notificationIds: {},
    timezoneAtGeneration: 'Asia/Tehran',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function makeDeps(nowInstant: number = NOW): NotificationEngineDeps & {
  occurrenceRepository: LocalStorageDoseOccurrenceRepository;
  adapter: FakeNotificationAdapter;
  clock: FakeClockAdapter;
} {
  const repo = new LocalStorageDoseOccurrenceRepository(new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage()));
  const clock = new FakeClockAdapter(nowInstant, 'Asia/Tehran');
  const adapter = new FakeNotificationAdapter();
  return {
    occurrenceRepository: repo,
    clock,
    adapter,
    resolveMedication: () => MED
  };
}

// ---------------------------------------------------------------------------
// syncOccurrence — حالت پایه
// ---------------------------------------------------------------------------

test('syncOccurrence: برای occurrence pending تازه، هر ۴ entry رو schedule می‌کنه', async () => {
  const deps = makeDeps();
  const occurrence = occ();
  deps.occurrenceRepository.upsertIfAbsent(occurrence);

  await syncOccurrence(occurrence, deps);

  assert.equal(deps.adapter.scheduled.length, 4);
  assert.equal(deps.adapter.channelEnsured, true);
});

test('syncOccurrence: id هر entry رو با occurrenceId+kind واقعی روی خودِ occurrence ذخیره می‌کنه', async () => {
  const deps = makeDeps();
  const occurrence = occ();
  deps.occurrenceRepository.upsertIfAbsent(occurrence);

  await syncOccurrence(occurrence, deps);

  const updated = deps.occurrenceRepository.getById('occ-1')!;
  assert.ok(updated.notificationIds.dose_time !== undefined);
  assert.ok(updated.notificationIds.r1 !== undefined);
  assert.ok(updated.notificationIds.r2 !== undefined);
  assert.ok(updated.notificationIds.deadline !== undefined);
});

test('syncOccurrence: extra هر entry شامل occurrenceId و kind واقعیه، نه هش حدسی', async () => {
  const deps = makeDeps();
  const occurrence = occ();
  deps.occurrenceRepository.upsertIfAbsent(occurrence);

  await syncOccurrence(occurrence, deps);

  const doseTimeEntry = deps.adapter.scheduled.find(e => e.extra.kind === 'dose_time')!;
  assert.equal(doseTimeEntry.extra.occurrenceId, 'occ-1');
  assert.equal(doseTimeEntry.title, '💊 یادآور داروتو');
  assert.match(doseTimeEntry.body, /استامینوفن/);
});

test('syncOccurrence: دو occurrence جدا (occurrenceId متفاوت) برای همون slot/kind، id متفاوت می‌گیرن (بدون تصادم)', async () => {
  const deps = makeDeps();
  const occA = occ({ id: 'occ-a' });
  const occB = occ({ id: 'occ-b', scheduledAt: occA.scheduledAt + 24 * 60 * 60 * 1000 });
  deps.occurrenceRepository.upsertIfAbsent(occA);
  deps.occurrenceRepository.upsertIfAbsent(occB);

  await syncOccurrence(occA, deps);
  await syncOccurrence(occB, deps);

  const idA = deps.occurrenceRepository.getById('occ-a')!.notificationIds.dose_time;
  const idB = deps.occurrenceRepository.getById('occ-b')!.notificationIds.dose_time;
  assert.notEqual(idA, idB);
});

// ---------------------------------------------------------------------------
// syncOccurrence — دیف (idempotency)
// ---------------------------------------------------------------------------

test('syncOccurrence: entryای که notificationId از قبل داره، دوباره schedule نمی‌شه', async () => {
  const deps = makeDeps();
  const occurrence = occ();
  deps.occurrenceRepository.upsertIfAbsent(occurrence);

  await syncOccurrence(occurrence, deps);
  const afterFirst = deps.occurrenceRepository.getById('occ-1')!;
  assert.equal(deps.adapter.scheduled.length, 4);

  await syncOccurrence(afterFirst, deps);

  assert.equal(deps.adapter.scheduled.length, 4); // دومین صدا هیچ‌چیز جدیدی اضافه نکرد
});

test('syncOccurrence: اگه بعضی entryها notificationId دارن و بعضی نه، فقط دیف رو schedule می‌کنه', async () => {
  const deps = makeDeps();
  const occurrence = occ({ notificationIds: { dose_time: 999 } });
  deps.occurrenceRepository.upsertIfAbsent(occurrence);

  await syncOccurrence(occurrence, deps);

  assert.equal(deps.adapter.scheduled.length, 3); // r1, r2, deadline — نه dose_time
  assert.ok(!deps.adapter.scheduled.some(e => e.extra.kind === 'dose_time'));
});

test('syncOccurrence: entryای که fireAt گذشته، schedule نمی‌شه', async () => {
  const deps = makeDeps();
  const occurrence = occ({
    reminderPlan: {
      entries: [
        { kind: 'dose_time', fireAt: NOW - 60 * 1000 }, // گذشته
        { kind: 'r1', fireAt: NOW + 60 * 1000 } // آینده
      ]
    }
  });
  deps.occurrenceRepository.upsertIfAbsent(occurrence);

  await syncOccurrence(occurrence, deps);

  assert.equal(deps.adapter.scheduled.length, 1);
  assert.equal(deps.adapter.scheduled[0].extra.kind, 'r1');
});

test('syncOccurrence: وقتی همه‌ی entryها از قبل schedule شدن، adapter اصلاً صدا زده نمی‌شه', async () => {
  const deps = makeDeps();
  const occurrence = occ({
    notificationIds: { dose_time: 1, r1: 2, r2: 3, deadline: 4 }
  });
  deps.occurrenceRepository.upsertIfAbsent(occurrence);

  await syncOccurrence(occurrence, deps);

  assert.equal(deps.adapter.scheduled.length, 0);
  assert.equal(deps.adapter.channelEnsured, false); // حتی ensureChannel هم صدا زده نشد
});

// ---------------------------------------------------------------------------
// syncOccurrence — گاردها
// ---------------------------------------------------------------------------

test('syncOccurrence: روی occurrence غیر-pending (مثلاً taken)، هیچ‌کاری نمی‌کنه', async () => {
  const deps = makeDeps();
  const occurrence = occ({ status: 'taken' });
  deps.occurrenceRepository.upsertIfAbsent(occurrence);

  await syncOccurrence(occurrence, deps);

  assert.equal(deps.adapter.scheduled.length, 0);
});

test('syncOccurrence: اگه دارو پیدا نشه، best-effort سکوت می‌کنه (نه throw)', async () => {
  const deps = makeDeps();
  deps.resolveMedication = () => undefined;
  const occurrence = occ();
  deps.occurrenceRepository.upsertIfAbsent(occurrence);

  await assert.doesNotReject(() => syncOccurrence(occurrence, deps));
  assert.equal(deps.adapter.scheduled.length, 0);
});

// ---------------------------------------------------------------------------
// cancelRemaining
// ---------------------------------------------------------------------------

test('cancelRemaining: دقیقاً همون idهای ذخیره‌شده رو کنسل می‌کنه', async () => {
  const deps = makeDeps();
  const occurrence = occ({
    status: 'taken',
    notificationIds: { r1: 111, r2: 222, deadline: 333 } // dose_time از قبل fire شده، پس id نداره
  });

  await cancelRemaining(occurrence, deps);

  assert.deepEqual(deps.adapter.canceled.sort(), [111, 222, 333]);
});

test('cancelRemaining: روی occurrence بدون هیچ notificationId ای، adapter.cancel اصلاً صدا زده نمی‌شه', async () => {
  const deps = makeDeps();
  const occurrence = occ({ status: 'skipped', notificationIds: {} });

  await cancelRemaining(occurrence, deps);

  assert.equal(deps.adapter.canceled.length, 0);
});

test('cancelRemaining: notificationIds خودِ occurrence رو دست‌نخورده می‌ذاره (فقط adapter صدا زده می‌شه)', async () => {
  const deps = makeDeps();
  const occurrence = occ({ status: 'missed', notificationIds: { r2: 42 } });

  await cancelRemaining(occurrence, deps);

  assert.deepEqual(occurrence.notificationIds, { r2: 42 });
});

// ---------------------------------------------------------------------------
// Feature Flag
// ---------------------------------------------------------------------------

test('feature flag: پس از cleanup پیش‌فرض روشن است', () => {
  const storage = new InMemoryKeyValueStorage();
  assert.equal(isNotificationEngineEnabled(storage), true);
});

test('feature flag: setNotificationEngineEnabled(true) واقعاً روشنش می‌کنه', () => {
  const storage = new InMemoryKeyValueStorage();
  setNotificationEngineEnabled(true, storage);
  assert.equal(isNotificationEngineEnabled(storage), true);
});

test('feature flag: rollback — بعد از روشن‌کردن، خاموش‌کردن دوباره واقعاً برمی‌گردونتش', () => {
  const storage = new InMemoryKeyValueStorage();
  setNotificationEngineEnabled(true, storage);
  setNotificationEngineEnabled(false, storage);
  assert.equal(isNotificationEngineEnabled(storage), false);
});

test('feature flag: فقط مقدار صریح "0" خاموش حساب می‌شود', () => {
  const storage = new InMemoryKeyValueStorage();
  storage.setItem('darooto_feature_notification_engine_v1', 'true');
  assert.equal(isNotificationEngineEnabled(storage), true);
  storage.setItem('darooto_feature_notification_engine_v1', '0');
  assert.equal(isNotificationEngineEnabled(storage), false);
});

// ---------------------------------------------------------------------------
// createResolverEventBridge — اتصال onEvent ← cancelRemaining (انحراف #۷)
// ---------------------------------------------------------------------------

test('resolver event bridge: وقتی پرچم روشنه، OccurrenceResolved باعث cancelRemaining واقعی می‌شه', async () => {
  const deps = makeDeps();
  const bridge = createResolverEventBridge(deps, () => true);
  const event: ResolverEvent = {
    kind: 'OccurrenceResolved',
    occurrence: occ({ status: 'taken', notificationIds: { r1: 5, r2: 6 } })
  };

  bridge(event);
  await new Promise(resolve => setTimeout(resolve, 0)); // fire-and-forget رو صبر کن

  assert.deepEqual(deps.adapter.canceled.sort(), [5, 6]);
});

test('resolver event bridge: وقتی پرچم خاموشه، هیچ cancel ای اتفاق نمی‌افته', async () => {
  const deps = makeDeps();
  const bridge = createResolverEventBridge(deps, () => false);
  const event: ResolverEvent = {
    kind: 'OccurrenceMissed',
    occurrence: occ({ status: 'missed', notificationIds: { deadline: 9 } })
  };

  bridge(event);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(deps.adapter.canceled.length, 0);
});

test('resolver event bridge: برای OccurrenceMissed هم دقیقاً مثل OccurrenceResolved کار می‌کنه', async () => {
  const deps = makeDeps();
  const bridge = createResolverEventBridge(deps, () => true);
  const event: ResolverEvent = {
    kind: 'OccurrenceMissed',
    occurrence: occ({ status: 'missed', notificationIds: { deadline: 77 } })
  };

  bridge(event);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(deps.adapter.canceled, [77]);
});
