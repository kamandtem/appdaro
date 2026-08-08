import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKeyValueStorage, LocalStoragePersistenceAdapter } from '../adapters/LocalStoragePersistenceAdapter';
import { LocalStorageMedicationRepository } from '../repository/MedicationRepository';
import { LocalStorageDoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import { FakeClockAdapter } from '../adapters/ClockAdapter';
import { FixedOffsetTimeZoneConverter } from '../domain/shared/TimeZoneConverter';
import { migrateLegacyData, MigrationDeps } from './migrateLegacyData';
import { Medication } from '../types';

const TEHRAN_OFFSET_MINUTES = 210;

function makeDeps(nowInstant: number): MigrationDeps & { medicationRepository: LocalStorageMedicationRepository; occurrenceRepository: LocalStorageDoseOccurrenceRepository } {
  const persistence = new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage());
  const medicationRepository = new LocalStorageMedicationRepository(persistence);
  const occurrenceRepository = new LocalStorageDoseOccurrenceRepository(persistence);
  const clock = new FakeClockAdapter(nowInstant, 'Asia/Tehran');
  const converter = new FixedOffsetTimeZoneConverter(TEHRAN_OFFSET_MINUTES);
  let counter = 0;
  return {
    medicationRepository,
    occurrenceRepository,
    converter,
    clock,
    generateId: () => `id-${++counter}`
  };
}

function legacyMed(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1',
    name: 'قرص تست',
    form: 'قرص',
    dose: '۱ عدد',
    times: ['۰۸:۰۰', '۲۱:۰۰'],
    frequency: 'هر روز',
    remainingCount: 20,
    totalCount: 30,
    alertThreshold: 5,
    isActive: true,
    familyMemberId: 'me',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

const NOW = Date.UTC(2026, 2, 1, 0, 0);

// ---------------------------------------------------------------------------
// نگاشت پایه — daily با دو زمان
// ---------------------------------------------------------------------------

test('migrateLegacyData: داروی daily دو-وعده‌ای درست به MedicationAggregate تبدیل می‌شه', () => {
  const deps = makeDeps(NOW);
  const result = migrateLegacyData([legacyMed()], deps);

  assert.equal(result.medications.length, 1);
  assert.equal(result.medications[0].alreadyMigrated, false);
  assert.equal(result.medications[0].slotsCreated, 2);

  const aggregate = deps.medicationRepository.getById('med-1')!;
  assert.equal(aggregate.schedule.frequencyType, 'daily');
  assert.equal(aggregate.schedule.slots.length, 2);
  assert.deepEqual(aggregate.schedule.slots[0].timeOfDay, { hour: 8, minute: 0 });
  assert.deepEqual(aggregate.schedule.slots[1].timeOfDay, { hour: 21, minute: 0 });
  assert.equal(aggregate.schedule.timezoneId, 'Asia/Tehran');
  assert.equal(aggregate.name, 'قرص تست');
});

test('migrateLegacyData: legacySlotIndexMap ترتیب times قدیمی رو به slotId نگه می‌داره', () => {
  const deps = makeDeps(NOW);
  const result = migrateLegacyData([legacyMed()], deps);

  const map = result.legacySlotIndexMap['med-1'];
  assert.equal(map.length, 2);
  const aggregate = deps.medicationRepository.getById('med-1')!;
  assert.equal(map[0], aggregate.schedule.slots[0].slotId);
  assert.equal(map[1], aggregate.schedule.slots[1].slotId);
});

test('migrateLegacyData: بعد از مهاجرت، occurrence برای افق اولیه ساخته می‌شه', () => {
  const deps = makeDeps(NOW);
  const result = migrateLegacyData([legacyMed()], deps);

  assert.ok(result.occurrenceGeneration);
  assert.ok(result.occurrenceGeneration!.created > 0);
  const occurrences = deps.occurrenceRepository.findByMedication('med-1');
  assert.ok(occurrences.length > 0);
  assert.ok(occurrences.every(o => o.status === 'pending'));
});

// ---------------------------------------------------------------------------
// نگاشت frequencyهای دیگه
// ---------------------------------------------------------------------------

test('migrateLegacyData: weekly - selectedDays قدیمی به selectedWeekdays نگاشت می‌شه', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData(
    [legacyMed({ frequency: 'روزهای هفته', selectedDays: ['شنبه', 'دوشنبه', 'یه-چیز-نامعتبر'], times: ['۰۹:۰۰'] })],
    deps
  );
  const aggregate = deps.medicationRepository.getById('med-1')!;
  assert.equal(aggregate.schedule.frequencyType, 'weekly');
  assert.deepEqual(aggregate.schedule.selectedWeekdays, ['شنبه', 'دوشنبه']);
});

test('migrateLegacyData: monthly - monthDay قدیمی عیناً منتقل می‌شه', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed({ frequency: 'ماهانه', monthDay: 15, times: ['۱۰:۰۰'] })], deps);
  const aggregate = deps.medicationRepository.getById('med-1')!;
  assert.equal(aggregate.schedule.frequencyType, 'monthly');
  assert.equal(aggregate.schedule.monthDay, 15);
});

test('migrateLegacyData: interval - فقط یک slot ساخته می‌شه، حتی اگه times چند مقدار داشته باشه', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData(
    [legacyMed({ frequency: 'هر چند ساعت', customIntervalHours: 6, times: ['۰۸:۰۰', '۱۴:۰۰', '۲۰:۰۰', '۰۲:۰۰'] })],
    deps
  );
  const aggregate = deps.medicationRepository.getById('med-1')!;
  assert.equal(aggregate.schedule.frequencyType, 'interval');
  assert.equal(aggregate.schedule.slots.length, 1);
  assert.equal(aggregate.schedule.intervalHours, 6);
});

test('migrateLegacyData: interval بدون scheduleStartAt => لحظه‌ی اجرای مهاجرت anchor می‌شه', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed({ frequency: 'هر چند ساعت', customIntervalHours: 8, scheduleStartAt: undefined })], deps);
  const aggregate = deps.medicationRepository.getById('med-1')!;
  assert.equal(aggregate.schedule.scheduleStartAt, NOW);
});

test('migrateLegacyData: interval با scheduleStartAt موجود، همون مقدار حفظ می‌شه', () => {
  const deps = makeDeps(NOW);
  const explicitStart = '2026-01-15T05:00:00.000Z';
  migrateLegacyData(
    [legacyMed({ frequency: 'هر چند ساعت', customIntervalHours: 8, scheduleStartAt: explicitStart })],
    deps
  );
  const aggregate = deps.medicationRepository.getById('med-1')!;
  assert.equal(aggregate.schedule.scheduleStartAt, new Date(explicitStart).getTime());
});

// ---------------------------------------------------------------------------
// safety profile از کاتالوگ
// ---------------------------------------------------------------------------

test('migrateLegacyData: داروی بدون catalogId، safety خالی می‌گیره', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed({ catalogId: undefined })], deps);
  const aggregate = deps.medicationRepository.getById('med-1')!;
  assert.deepEqual(aggregate.safety, {});
});

test('migrateLegacyData: داروی با catalogId شناخته‌شده‌ی critical، safetyLevel رو می‌گیره', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed({ catalogId: 'warfarin' })], deps);
  const aggregate = deps.medicationRepository.getById('med-1')!;
  assert.equal(aggregate.safety.safetyLevel, 'critical');
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('migrateLegacyData: اجرای دوباره برای همون دارو، schedule/slotId رو دوباره نمی‌سازه', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed()], deps);
  const firstAggregate = deps.medicationRepository.getById('med-1')!;
  const firstSlotIds = firstAggregate.schedule.slots.map(s => s.slotId);

  const second = migrateLegacyData([legacyMed()], deps);

  assert.equal(second.medications[0].alreadyMigrated, true);
  const secondAggregate = deps.medicationRepository.getById('med-1')!;
  assert.deepEqual(secondAggregate.schedule.slots.map(s => s.slotId), firstSlotIds);
});

test('migrateLegacyData: اجرای دوباره occurrence تکراری نمی‌سازه (idempotent end-to-end)', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed()], deps);
  const firstCount = deps.occurrenceRepository.findByMedication('med-1').length;

  const second = migrateLegacyData([legacyMed()], deps);

  assert.equal(second.occurrenceGeneration!.created, 0);
  assert.equal(deps.occurrenceRepository.findByMedication('med-1').length, firstCount);
});

// ---------------------------------------------------------------------------
// Dry-run
// ---------------------------------------------------------------------------

test('migrateLegacyData: dryRun هیچی نمی‌نویسه ولی پیش‌نمایش درست برمی‌گردونه', () => {
  const deps = makeDeps(NOW);
  const result = migrateLegacyData([legacyMed()], deps, { dryRun: true });

  assert.equal(result.dryRun, true);
  assert.equal(result.medications[0].slotsCreated, 2);
  assert.equal(result.occurrenceGeneration, null);
  assert.equal(deps.medicationRepository.getAll().length, 0);
  assert.equal(deps.occurrenceRepository.findByMedication('med-1').length, 0);
});

test('migrateLegacyData: بعد از dryRun، اجرای واقعی هنوز به‌درستی کار می‌کنه', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed()], deps, { dryRun: true });
  const real = migrateLegacyData([legacyMed()], deps);

  assert.equal(real.dryRun, false);
  assert.equal(real.medications[0].alreadyMigrated, false); // dryRun چیزی ننوشته بود
  assert.ok(deps.medicationRepository.getById('med-1'));
});

// ---------------------------------------------------------------------------
// چند دارو با هم
// ---------------------------------------------------------------------------

test('migrateLegacyData: چند دارو با هم مهاجرت می‌شن، مستقل از هم', () => {
  const deps = makeDeps(NOW);
  const result = migrateLegacyData(
    [legacyMed({ id: 'med-a', times: ['۰۸:۰۰'] }), legacyMed({ id: 'med-b', times: ['۰۹:۰۰', '۱۵:۰۰', '۲۲:۰۰'] })],
    deps
  );

  assert.equal(result.medications.length, 2);
  assert.equal(deps.medicationRepository.getById('med-a')!.schedule.slots.length, 1);
  assert.equal(deps.medicationRepository.getById('med-b')!.schedule.slots.length, 3);
});

// ---------------------------------------------------------------------------
// همگام‌سازی دوباره‌ی legacy -> Aggregate (حفره‌ی پرشده پیش از تیکه ۱۰)
// ---------------------------------------------------------------------------

test('migrateLegacyData: اجرای دوباره بدون هیچ تغییری، scheduleVersion رو بالا نمی‌بره (idempotent)', () => {
  const deps = makeDeps(NOW);
  const med = legacyMed();
  migrateLegacyData([med], deps);
  const first = deps.medicationRepository.getById('med-1')!;

  const again = migrateLegacyData([med], deps);
  const second = deps.medicationRepository.getById('med-1')!;

  assert.equal(again.medications[0].alreadyMigrated, true);
  assert.equal(again.medications[0].scheduleUpdated, false);
  assert.equal(second.schedule.scheduleVersion, first.schedule.scheduleVersion);
  assert.deepEqual(second.schedule.slots, first.schedule.slots);
});

test('migrateLegacyData: اجرای دوباره برای داروی interval بدون scheduleStartAt هم نسخه رو بالا نمی‌بره', () => {
  // انحراف #۵: anchor نبودن scheduleStartAt به «الان» fallback می‌شه؛ اگه هر
  // sync دوباره «الان» تازه بگیره، schedule هر بار تغییرکرده دیده می‌شه.
  const deps = makeDeps(NOW);
  const med = legacyMed({ frequency: 'هر چند ساعت', customIntervalHours: 6, times: ['۰۸:۰۰'], scheduleStartAt: undefined });
  migrateLegacyData([med], deps);
  const first = deps.medicationRepository.getById('med-1')!;

  (deps.clock as FakeClockAdapter).travelTo(NOW + 5 * 60 * 60 * 1000);
  migrateLegacyData([med], deps);
  const second = deps.medicationRepository.getById('med-1')!;

  assert.equal(second.schedule.scheduleVersion, first.schedule.scheduleVersion);
  assert.equal(second.schedule.scheduleStartAt, first.schedule.scheduleStartAt);
});

test('migrateLegacyData: ویرایش ساعت دارو در legacy، schedule رو به‌روز می‌کنه و نسخه رو +۱ می‌بره', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed()], deps);
  const before = deps.medicationRepository.getById('med-1')!;

  const result = migrateLegacyData([legacyMed({ times: ['۰۹:۳۰', '۲۱:۰۰'] })], deps);
  const after = deps.medicationRepository.getById('med-1')!;

  assert.equal(result.medications[0].scheduleUpdated, true);
  assert.equal(after.schedule.scheduleVersion, before.schedule.scheduleVersion + 1);
  assert.deepEqual(after.schedule.slots[0].timeOfDay, { hour: 9, minute: 30 });
});

test('migrateLegacyData: با ویرایش ساعت، slotId جایگاه‌ها پایدار می‌مونه (کلید طبیعی نمی‌شکنه)', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed()], deps);
  const before = deps.medicationRepository.getById('med-1')!;

  migrateLegacyData([legacyMed({ times: ['۰۹:۳۰', '۲۱:۰۰'] })], deps);
  const after = deps.medicationRepository.getById('med-1')!;

  assert.deepEqual(
    after.schedule.slots.map(s => s.slotId),
    before.schedule.slots.map(s => s.slotId)
  );
  assert.deepEqual(after.schedule.slots.map(s => s.order), [0, 1]);
});

test('migrateLegacyData: ویرایش ساعت، occurrenceهای آینده‌ی نسخه‌ی قدیم رو canceled می‌کنه', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed()], deps);
  const generatedBefore = deps.occurrenceRepository.findByMedication('med-1').length;
  assert.ok(generatedBefore > 0);

  const result = migrateLegacyData([legacyMed({ times: ['۰۹:۳۰', '۲۱:۰۰'] })], deps);

  assert.ok((result.occurrenceGeneration?.canceled ?? 0) > 0, 'باید occurrenceهای نسخه‌ی قدیم باطل شده باشن');
  const canceled = deps.occurrenceRepository.findByMedication('med-1').filter(o => o.status === 'canceled');
  assert.ok(canceled.length > 0);
  assert.ok(canceled.every(o => o.scheduleVersion === 1));
});

test('migrateLegacyData: فیلدهای نمایشی/موجودی داروی از قبل مهاجرت‌شده هم به‌روز می‌شن، بدون بامپ نسخه', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed()], deps);
  const before = deps.medicationRepository.getById('med-1')!;

  const result = migrateLegacyData(
    [legacyMed({ name: 'اسم جدید', remainingCount: 3, isActive: false, pauseReason: 'awaiting_refill' })],
    deps
  );
  const after = deps.medicationRepository.getById('med-1')!;

  assert.equal(result.medications[0].scheduleUpdated, false);
  assert.equal(after.schedule.scheduleVersion, before.schedule.scheduleVersion);
  assert.equal(after.name, 'اسم جدید');
  assert.equal(after.remainingCount, 3);
  assert.equal(after.isActive, false);
  assert.equal(after.pauseReason, 'awaiting_refill');
});

test('migrateLegacyData: dryRun روی داروی از قبل مهاجرت‌شده هیچ‌چیزی نمی‌نویسه', () => {
  const deps = makeDeps(NOW);
  migrateLegacyData([legacyMed()], deps);
  const before = deps.medicationRepository.getById('med-1')!;

  migrateLegacyData([legacyMed({ name: 'اسم جدید', times: ['۰۹:۳۰', '۲۱:۰۰'] })], deps, { dryRun: true });
  const after = deps.medicationRepository.getById('med-1')!;

  assert.deepEqual(after, before);
});
