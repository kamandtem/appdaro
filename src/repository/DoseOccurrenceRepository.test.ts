import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKeyValueStorage, LocalStoragePersistenceAdapter } from '../adapters/LocalStoragePersistenceAdapter';
import { LocalStorageDoseOccurrenceRepository } from './DoseOccurrenceRepository';
import { DoseOccurrence } from '../types';

function occ(overrides: Partial<DoseOccurrence> = {}): DoseOccurrence {
  return {
    id: 'occ-1',
    medicationId: 'med-1',
    slotId: 'slot-1',
    scheduleVersion: 1,
    scheduledAt: 1000,
    deadlineAt: 5000,
    reminderPlan: { entries: [{ kind: 'dose_time', fireAt: 1000 }] },
    status: 'pending',
    snoozeCount: 0,
    notificationIds: {},
    timezoneAtGeneration: 'Asia/Tehran',
    createdAt: 500,
    updatedAt: 500,
    ...overrides
  };
}

function makeRepo() {
  return new LocalStorageDoseOccurrenceRepository(new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage()));
}

// ---------------------------------------------------------------------------
// upsertIfAbsent — قلب idempotency (DESIGN.md بخش ۳)
// ---------------------------------------------------------------------------

test('upsertIfAbsent: وقتی رکوردی با همون کلید طبیعی نیست، ایجاد می‌کنه', () => {
  const repo = makeRepo();
  const result = repo.upsertIfAbsent(occ());
  assert.equal(result, 'created');
  assert.ok(repo.getById('occ-1'));
});

test('upsertIfAbsent: با همون (medicationId, slotId, scheduledAt)، حتی با id متفاوت، "exists" برمی‌گردونه و چیزی اضافه نمی‌کنه', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'occ-1', medicationId: 'med-1', slotId: 'slot-1', scheduledAt: 1000 }));
  const result = repo.upsertIfAbsent(occ({ id: 'occ-DIFFERENT-ID', medicationId: 'med-1', slotId: 'slot-1', scheduledAt: 1000 }));
  assert.equal(result, 'exists');
  assert.equal(repo.findByMedication('med-1').length, 1, 'نباید رکورد تکراری ساخته بشه');
});

test('upsertIfAbsent: رکورد resolve‌شده‌ی موجود، با generate دوباره دست‌نخورده می‌مونه (immutability)', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'occ-1', status: 'taken', resolvedAt: 2000 }));
  // یک occurrence جدید 'pending' با همون کلید طبیعی — شبیه چیزی که یک اجرای دوباره‌ی Occurrence Generator ممکنه بسازه
  repo.upsertIfAbsent(occ({ id: 'occ-2', status: 'pending', resolvedAt: undefined }));

  const stored = repo.getById('occ-1')!;
  assert.equal(stored.status, 'taken', 'رکورد قبلاً resolve‌شده نباید overwrite بشه');
  assert.equal(repo.getById('occ-2'), null, 'رکورد جدید هم اصلاً نباید ساخته شده باشه');
});

test('upsertIfAbsent: تغییر هرکدوم از سه‌جزء کلید طبیعی، رکورد جدید و مستقل می‌سازه', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'occ-1', medicationId: 'med-1', slotId: 'slot-1', scheduledAt: 1000 }));
  repo.upsertIfAbsent(occ({ id: 'occ-2', medicationId: 'med-1', slotId: 'slot-1', scheduledAt: 2000 })); // scheduledAt فرق داره
  repo.upsertIfAbsent(occ({ id: 'occ-3', medicationId: 'med-1', slotId: 'slot-2', scheduledAt: 1000 })); // slotId فرق داره
  repo.upsertIfAbsent(occ({ id: 'occ-4', medicationId: 'med-2', slotId: 'slot-1', scheduledAt: 1000 })); // medicationId فرق داره

  assert.equal(repo.findByDateRange({ from: 0, to: 10000 }).length, 4);
});

// ---------------------------------------------------------------------------
// query methods
// ---------------------------------------------------------------------------

test('getById: برای id ناموجود null برمی‌گردونه', () => {
  const repo = makeRepo();
  assert.equal(repo.getById('nope'), null);
});

test('findPendingWithDeadlineBefore: فقط pending با deadline گذشته رو برمی‌گردونه', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'a', status: 'pending', deadlineAt: 1000 }));
  repo.upsertIfAbsent(occ({ id: 'b', status: 'pending', deadlineAt: 9000, scheduledAt: 2000 })); // ددلاینش هنوز نگذشته
  repo.upsertIfAbsent(occ({ id: 'c', status: 'taken', deadlineAt: 500, scheduledAt: 3000 })); // resolve شده، دیگه pending نیست

  const result = repo.findPendingWithDeadlineBefore(5000);
  assert.deepEqual(result.map(o => o.id), ['a']);
});

test('findByMedication: بدون range همه‌ی occurrenceهای همون دارو رو برمی‌گردونه', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'a', medicationId: 'med-1' }));
  repo.upsertIfAbsent(occ({ id: 'b', medicationId: 'med-1', scheduledAt: 2000 }));
  repo.upsertIfAbsent(occ({ id: 'c', medicationId: 'med-2' }));

  assert.equal(repo.findByMedication('med-1').length, 2);
});

test('findByMedication: با range، فقط occurrenceهای داخل بازه رو برمی‌گردونه', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'a', medicationId: 'med-1', scheduledAt: 1000 }));
  repo.upsertIfAbsent(occ({ id: 'b', medicationId: 'med-1', scheduledAt: 5000 }));
  repo.upsertIfAbsent(occ({ id: 'c', medicationId: 'med-1', scheduledAt: 9000 }));

  const result = repo.findByMedication('med-1', { from: 2000, to: 6000 });
  assert.deepEqual(result.map(o => o.id), ['b']);
});

test('findByDateRange: صرف‌نظر از دارو، همه‌ی occurrenceهای داخل بازه رو برمی‌گردونه', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'a', medicationId: 'med-1', scheduledAt: 1000 }));
  repo.upsertIfAbsent(occ({ id: 'b', medicationId: 'med-2', scheduledAt: 2000 }));
  repo.upsertIfAbsent(occ({ id: 'c', medicationId: 'med-1', scheduledAt: 9000 }));

  const result = repo.findByDateRange({ from: 0, to: 3000 });
  assert.deepEqual(result.map(o => o.id).sort(), ['a', 'b']);
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

test('update: occurrence موجود رو با نسخه‌ی جدید جایگزین می‌کنه', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'a', status: 'pending' }));
  repo.update(occ({ id: 'a', status: 'taken', resolvedAt: 3000 }));

  const found = repo.getById('a')!;
  assert.equal(found.status, 'taken');
  assert.equal(found.resolvedAt, 3000);
});

test('update: برای id ناموجود throw نمی‌کنه و بقیه‌ی داده رو دست‌نخورده می‌ذاره', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'a' }));
  assert.doesNotThrow(() => repo.update(occ({ id: 'nonexistent' })));
  assert.equal(repo.findByDateRange({ from: 0, to: 10000 }).length, 1);
});

// ---------------------------------------------------------------------------
// pruneOlderThan — retention (DESIGN.md بخش ۸ و ریسک بخش ۱۵)
// ---------------------------------------------------------------------------

const resolveMed = (id: string) =>
  id === 'med-1' ? { name: 'قرص تست', form: 'قرص' as const, dose: '۱ عدد', familyMemberId: 'me' } : undefined;

test('pruneOlderThan: فقط occurrenceهای ترمینال و قدیمی‌تر از آستانه رو prune می‌کنه', () => {
  const repo = makeRepo();
  // نکته: هر کدوم باید natural key (medicationId+slotId+scheduledAt) متفاوت
  // داشته باشن، وگرنه upsertIfAbsent دومی/سومی رو به‌خاطر idempotency رد
  // می‌کنه (نه چیزی که این تست می‌خواد بسنجه).
  repo.upsertIfAbsent(occ({ id: 'old-taken', slotId: 'slot-1', status: 'taken', scheduledAt: 1000 }));
  repo.upsertIfAbsent(occ({ id: 'old-pending', slotId: 'slot-2', status: 'pending', scheduledAt: 1000 })); // ترمینال نیست — نباید prune بشه
  repo.upsertIfAbsent(occ({ id: 'recent-taken', slotId: 'slot-3', status: 'taken', scheduledAt: 9000 })); // جدیده — نباید prune بشه

  const history = repo.pruneOlderThan(5000, resolveMed);

  assert.deepEqual(history.map(h => h.occurrenceId), ['old-taken']);
  assert.equal(repo.getById('old-taken'), null, 'باید از جدول اصلی حذف شده باشه');
  assert.ok(repo.getById('old-pending'), 'pending نباید prune بشه چون ترمینال نیست');
  assert.ok(repo.getById('recent-taken'), 'جدید نباید prune بشه');
});

test('pruneOlderThan: رکورد تولیدشده فیلدهای دارو رو از resolveMedication پر می‌کنه', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'old-taken', medicationId: 'med-1', status: 'taken', scheduledAt: 1000, statusReason: undefined }));

  const [record] = repo.pruneOlderThan(5000, resolveMed);
  assert.equal(record.medName, 'قرص تست');
  assert.equal(record.medForm, 'قرص');
  assert.equal(record.medDose, '۱ عدد');
  assert.equal(record.familyMemberId, 'me');
  assert.equal(record.legacy, false);
});

test('pruneOlderThan: اگه دارو پیدا نشه، اون occurrence prune نمی‌شه (نه حذف نه گم)', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'orphan', medicationId: 'med-DELETED', status: 'taken', scheduledAt: 1000 }));

  const history = repo.pruneOlderThan(5000, resolveMed); // resolveMed برای med-DELETED چیزی برنمی‌گردونه

  assert.equal(history.length, 0);
  assert.ok(repo.getById('orphan'), 'باید همچنان توی جدول اصلی بمونه، منتظر دور بعد');
});

test('pruneOlderThan: وقتی هیچ کاندیدی نیست، آرایه‌ی خالی برمی‌گردونه و چیزی رو دست‌نمی‌زنه', () => {
  const repo = makeRepo();
  repo.upsertIfAbsent(occ({ id: 'a', status: 'pending', scheduledAt: 1000 }));
  const history = repo.pruneOlderThan(5000, resolveMed);
  assert.deepEqual(history, []);
  assert.equal(repo.findByDateRange({ from: 0, to: 10000 }).length, 1);
});
