import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKeyValueStorage, LocalStoragePersistenceAdapter } from '../../adapters/LocalStoragePersistenceAdapter';
import { LocalStorageDoseOccurrenceRepository } from '../../repository/DoseOccurrenceRepository';
import { FakeClockAdapter } from '../../adapters/ClockAdapter';
import { resolve, snooze, sweepMissed, ResolverEngineDeps, ResolverEvent } from './ResolverEngine';
import { EXEMPT_DEADLINE_SENTINEL } from './OccurrenceGenerator';
import { DoseOccurrence } from '../../types';

const NOW = Date.UTC(2026, 2, 1, 12, 0);

function occ(overrides: Partial<DoseOccurrence> = {}): DoseOccurrence {
  return {
    id: 'occ-1',
    medicationId: 'med-1',
    slotId: 'slot-1',
    scheduleVersion: 1,
    scheduledAt: NOW - 60 * 60 * 1000,
    deadlineAt: NOW - 10 * 60 * 1000, // ددلاین گذشته، مگر overrides چیز دیگه‌ای بگه
    reminderPlan: { entries: [{ kind: 'dose_time', fireAt: NOW - 60 * 60 * 1000 }] },
    status: 'pending',
    snoozeCount: 0,
    notificationIds: {},
    timezoneAtGeneration: 'Asia/Tehran',
    createdAt: NOW - 2 * 60 * 60 * 1000,
    updatedAt: NOW - 2 * 60 * 60 * 1000,
    ...overrides
  };
}

function makeDeps(nowInstant: number = NOW): ResolverEngineDeps & { occurrenceRepository: LocalStorageDoseOccurrenceRepository; events: ResolverEvent[] } {
  const repo = new LocalStorageDoseOccurrenceRepository(new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage()));
  const clock = new FakeClockAdapter(nowInstant, 'Asia/Tehran');
  const events: ResolverEvent[] = [];
  return {
    occurrenceRepository: repo,
    clock,
    onEvent: e => events.push(e),
    events
  };
}

// ---------------------------------------------------------------------------
// resolve — پایه
// ---------------------------------------------------------------------------

test('resolve: روی occurrence pending، taken اعمال می‌شه و applied برمی‌گرده', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ());

  const result = resolve('occ-1', 'taken', deps);

  assert.equal(result, 'applied');
  const updated = deps.occurrenceRepository.getById('occ-1')!;
  assert.equal(updated.status, 'taken');
  assert.equal(updated.resolvedBy, 'user');
  assert.equal(updated.resolvedAt, NOW);
  assert.equal(updated.updatedAt, NOW);
});

test('resolve: skipped با skipReason ثبت می‌شه', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ());

  const result = resolve('occ-1', 'skipped', deps, { skipReason: 'side_effects' });

  assert.equal(result, 'applied');
  const updated = deps.occurrenceRepository.getById('occ-1')!;
  assert.equal(updated.status, 'skipped');
  assert.equal(updated.statusReason, 'side_effects');
});

test('resolve: یک رویداد OccurrenceResolved منتشر می‌شه', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ());

  resolve('occ-1', 'taken', deps);

  assert.equal(deps.events.length, 1);
  assert.equal(deps.events[0].kind, 'OccurrenceResolved');
  assert.equal(deps.events[0].occurrence.id, 'occ-1');
});

// ---------------------------------------------------------------------------
// resolve — idempotency / گارد همزمانی
// ---------------------------------------------------------------------------

test('resolve: روی occurrence از قبل taken، already_resolved برمی‌گرده و چیزی overwrite نمی‌شه', () => {
  const deps = makeDeps();
  const resolvedAtBefore = NOW - 5000;
  deps.occurrenceRepository.upsertIfAbsent(occ({ status: 'taken', resolvedAt: resolvedAtBefore, resolvedBy: 'user' }));

  const result = resolve('occ-1', 'skipped', deps, { skipReason: 'timing' });

  assert.equal(result, 'already_resolved');
  const unchanged = deps.occurrenceRepository.getById('occ-1')!;
  assert.equal(unchanged.status, 'taken'); // دست‌نخورده — نه skipped شده
  assert.equal(unchanged.resolvedAt, resolvedAtBefore);
  assert.equal(deps.events.length, 0); // هیچ eventـی منتشر نشده
});

test('resolve: روی occurrence از قبل missed یا canceled هم already_resolved برمی‌گرده', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'occ-missed', slotId: 'slot-missed', status: 'missed' }));
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'occ-canceled', slotId: 'slot-canceled', status: 'canceled' }));

  assert.equal(resolve('occ-missed', 'taken', deps), 'already_resolved');
  assert.equal(resolve('occ-canceled', 'taken', deps), 'already_resolved');
});

test('resolve: روی occurrenceId ناموجود، already_resolved برمی‌گرده (نه throw)', () => {
  const deps = makeDeps();
  const result = resolve('does-not-exist', 'taken', deps);
  assert.equal(result, 'already_resolved');
});

test('resolve: دومین resolve پشت‌سرهم روی همون occurrence، دومی already_resolved می‌گیره', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ());

  const first = resolve('occ-1', 'taken', deps);
  const second = resolve('occ-1', 'skipped', deps, { skipReason: 'timing' });

  assert.equal(first, 'applied');
  assert.equal(second, 'already_resolved');
  assert.equal(deps.occurrenceRepository.getById('occ-1')!.status, 'taken'); // اولی برنده می‌شه
});

// ---------------------------------------------------------------------------
// snooze
// ---------------------------------------------------------------------------

test('snooze: روی occurrence pending، فقط snoozeCount++ می‌شه، status و deadlineAt دست‌نخورده می‌مونه', () => {
  const deps = makeDeps();
  const original = occ({ snoozeCount: 2, deadlineAt: NOW + 60 * 60 * 1000 });
  deps.occurrenceRepository.upsertIfAbsent(original);

  snooze('occ-1', deps);

  const updated = deps.occurrenceRepository.getById('occ-1')!;
  assert.equal(updated.snoozeCount, 3);
  assert.equal(updated.status, 'pending');
  assert.equal(updated.deadlineAt, original.deadlineAt);
  assert.deepEqual(updated.reminderPlan, original.reminderPlan);
  assert.equal(updated.updatedAt, NOW);
});

test('snooze: روی occurrence resolve‌شده هیچ کاری نمی‌کنه (بی‌سروصدا)', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ({ status: 'taken', snoozeCount: 1 }));

  snooze('occ-1', deps);

  const unchanged = deps.occurrenceRepository.getById('occ-1')!;
  assert.equal(unchanged.snoozeCount, 1); // عوض نشده
});

test('snooze: روی occurrenceId ناموجود throw نمی‌کنه', () => {
  const deps = makeDeps();
  assert.doesNotThrow(() => snooze('does-not-exist', deps));
});

// ---------------------------------------------------------------------------
// sweepMissed
// ---------------------------------------------------------------------------

test('sweepMissed: occurrenceهای pending با deadline گذشته missed می‌شن', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'overdue-1', slotId: 'slot-a', deadlineAt: NOW - 1000 }));
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'overdue-2', slotId: 'slot-b', deadlineAt: NOW - 500 }));
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'not-yet', slotId: 'slot-c', deadlineAt: NOW + 1000 }));

  const missed = sweepMissed(NOW, deps);

  assert.equal(missed.length, 2);
  assert.equal(deps.occurrenceRepository.getById('overdue-1')!.status, 'missed');
  assert.equal(deps.occurrenceRepository.getById('overdue-2')!.status, 'missed');
  assert.equal(deps.occurrenceRepository.getById('not-yet')!.status, 'pending'); // دست‌نخورده
});

test('sweepMissed: occurrenceهای resolve‌شده (حتی با deadline گذشته) دوباره missed نمی‌شن', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'already-taken', status: 'taken', deadlineAt: NOW - 1000 }));

  const missed = sweepMissed(NOW, deps);

  assert.equal(missed.length, 0);
  assert.equal(deps.occurrenceRepository.getById('already-taken')!.status, 'taken');
});

test('sweepMissed: occurrenceهای exempt (deadlineAt روی sentinel) هرگز missed نمی‌شن', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'exempt-occ', deadlineAt: EXEMPT_DEADLINE_SENTINEL }));

  const missed = sweepMissed(NOW, deps);

  assert.equal(missed.length, 0);
  assert.equal(deps.occurrenceRepository.getById('exempt-occ')!.status, 'pending');
});

test('sweepMissed: برای هر occurrence missed‌شده یک رویداد OccurrenceMissed منتشر می‌شه', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'overdue-1', deadlineAt: NOW - 1000 }));

  sweepMissed(NOW, deps);

  assert.equal(deps.events.length, 1);
  assert.equal(deps.events[0].kind, 'OccurrenceMissed');
  assert.equal(deps.events[0].occurrence.id, 'overdue-1');
});

test('sweepMissed: resolvedBy = system، resolvedAt = همون now پاس‌داده‌شده', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'overdue-1', deadlineAt: NOW - 1000 }));

  sweepMissed(NOW, deps);

  const updated = deps.occurrenceRepository.getById('overdue-1')!;
  assert.equal(updated.resolvedBy, 'system');
  assert.equal(updated.resolvedAt, NOW);
});

test('sweepMissed: روی backlog چندروزه (نه فقط «امروز») هم درست کار می‌کنه', () => {
  const deps = makeDeps();
  const threeDaysAgo = NOW - 3 * 24 * 60 * 60 * 1000;
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'old-overdue', scheduledAt: threeDaysAgo, deadlineAt: threeDaysAgo + 1000 }));

  const missed = sweepMissed(NOW, deps);

  assert.equal(missed.length, 1);
  assert.equal(missed[0].id, 'old-overdue');
});

test('sweepMissed: صدا زدن دوباره روی همون backlog، دیگه چیزی missed نمی‌کنه (idempotent)', () => {
  const deps = makeDeps();
  deps.occurrenceRepository.upsertIfAbsent(occ({ id: 'overdue-1', deadlineAt: NOW - 1000 }));

  const first = sweepMissed(NOW, deps);
  const second = sweepMissed(NOW, deps);

  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
});
