import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKeyValueStorage, LocalStoragePersistenceAdapter } from '../adapters/LocalStoragePersistenceAdapter';
import { LocalStorageMedicationRepository } from './MedicationRepository';
import { MedicationAggregate, MedicationSchedule } from '../types';

function schedule(overrides: Partial<MedicationSchedule> = {}): MedicationSchedule {
  return {
    scheduleVersion: 1,
    frequencyType: 'daily',
    slots: [{ slotId: 's1', timeOfDay: { hour: 8, minute: 0 }, order: 0 }],
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
    safety: { safetyLevel: 'normal' },
    remainingCount: 10,
    totalCount: 30,
    alertThreshold: 5,
    isActive: true,
    familyMemberId: 'me',
    createdAt: new Date(0).toISOString(),
    ...overrides
  };
}

function makeRepo() {
  return new LocalStorageMedicationRepository(new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage()));
}

test('MedicationRepository: getAll روی storage خالی، آرایه‌ی خالیه', () => {
  const repo = makeRepo();
  assert.deepEqual(repo.getAll(), []);
});

test('MedicationRepository: save یک داروی جدید، بعد getById پیداش می‌کنه', () => {
  const repo = makeRepo();
  repo.save(med());
  const found = repo.getById('med-1');
  assert.ok(found);
  assert.equal(found!.name, 'قرص تست');
});

test('MedicationRepository: getById برای id ناموجود، null برمی‌گردونه', () => {
  const repo = makeRepo();
  assert.equal(repo.getById('nope'), null);
});

test('MedicationRepository: save روی داروی جدید، scheduleVersion caller رو دست‌نخورده نگه می‌داره', () => {
  const repo = makeRepo();
  repo.save(med({ schedule: schedule({ scheduleVersion: 1 }) }));
  assert.equal(repo.getById('med-1')!.schedule.scheduleVersion, 1);
});

test('MedicationRepository: save با schedule واقعاً عوض‌شده، scheduleVersion رو خودکار یکی بالا می‌بره', () => {
  const repo = makeRepo();
  repo.save(med({ schedule: schedule({ scheduleVersion: 1, frequencyType: 'daily' }) }));

  // کاربر frequencyType رو عوض کرده — این یک تغییر واقعیه
  repo.save(med({ schedule: schedule({ scheduleVersion: 1, frequencyType: 'weekly', selectedWeekdays: ['شنبه'] }) }));

  const found = repo.getById('med-1')!;
  assert.equal(found.schedule.scheduleVersion, 2, 'باید خودکار به ۲ برسه، نه چیزی که caller پاس داده (که همچنان ۱ بود)');
  assert.equal(found.schedule.frequencyType, 'weekly');
});

test('MedicationRepository: save بدون تغییر واقعی schedule، نسخه رو دست‌نخورده نگه می‌داره (حتی اگه caller اشتباهی نسخه‌ی دیگه‌ای پاس بده)', () => {
  const repo = makeRepo();
  repo.save(med({ schedule: schedule({ scheduleVersion: 1 }) }));

  // caller اشتباهاً scheduleVersion=5 پاس داده، ولی خودِ schedule هیچ فرقی نکرده
  repo.save(med({ schedule: schedule({ scheduleVersion: 5 }) }));

  assert.equal(repo.getById('med-1')!.schedule.scheduleVersion, 1, 'باید نسخه‌ی واقعی موجود (۱) حفظ بشه، نه چیزی که caller اشتباهاً پاس داده');
});

test('MedicationRepository: چند بار save پشت سر هم بدون تغییر schedule، نسخه رو بی‌نهایت بالا نمی‌بره', () => {
  const repo = makeRepo();
  repo.save(med());
  repo.save(med());
  repo.save(med());
  assert.equal(repo.getById('med-1')!.schedule.scheduleVersion, 1);
});

test('MedicationRepository: save روی یک دارو، بقیه‌ی داروهای موجود رو دست‌نخورده می‌ذاره', () => {
  const repo = makeRepo();
  repo.save(med({ id: 'med-1', name: 'دارو یک' }));
  repo.save(med({ id: 'med-2', name: 'دارو دو' }));
  repo.save(med({ id: 'med-1', name: 'دارو یک ویرایش‌شده' }));

  assert.equal(repo.getAll().length, 2);
  assert.equal(repo.getById('med-1')!.name, 'دارو یک ویرایش‌شده');
  assert.equal(repo.getById('med-2')!.name, 'دارو دو');
});

test('MedicationRepository: delete فقط همون دارو رو حذف می‌کنه', () => {
  const repo = makeRepo();
  repo.save(med({ id: 'med-1' }));
  repo.save(med({ id: 'med-2' }));
  repo.delete('med-1');

  assert.equal(repo.getById('med-1'), null);
  assert.ok(repo.getById('med-2'));
  assert.equal(repo.getAll().length, 1);
});

test('MedicationRepository: delete روی id ناموجود، بی‌خطا هیچ‌کاری نمی‌کنه', () => {
  const repo = makeRepo();
  repo.save(med());
  assert.doesNotThrow(() => repo.delete('nonexistent'));
  assert.equal(repo.getAll().length, 1);
});
