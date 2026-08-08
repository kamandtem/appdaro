import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKeyValueStorage, LocalStoragePersistenceAdapter } from '../adapters/LocalStoragePersistenceAdapter';
import { LocalStorageMedicationRepository } from '../repository/MedicationRepository';
import { LocalStorageDoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import { FakeClockAdapter } from '../adapters/ClockAdapter';
import { FixedOffsetTimeZoneConverter } from '../domain/shared/TimeZoneConverter';
import { DoseLog, DoseOccurrence, Instant, Medication } from '../types';
import { OccurrenceQueryService } from './OccurrenceQueryService';

const TZ = 'Asia/Tehran';
const OFFSET = 210;
const converter = new FixedOffsetTimeZoneConverter(OFFSET);
const minute = 60 * 1000;
const hour = 60 * minute;

function tehran(year: number, month: number, day: number, h: number, m = 0): Instant {
  return converter.toInstant({ year, month, day, hour: h, minute: m }, TZ);
}

function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1', name: 'تست', form: 'قرص', dose: '۱ عدد', times: ['۰۸:۰۰'],
    frequency: 'هر روز', remainingCount: 10, totalCount: 10, alertThreshold: 2,
    isActive: true, familyMemberId: 'me', createdAt: '2026-01-01T00:00:00.000Z', ...overrides
  };
}

function occurrence(id: string, at: Instant, status: DoseOccurrence['status'] = 'pending', slotId = 'slot-1'): DoseOccurrence {
  return {
    id, medicationId: 'med-1', slotId, scheduleVersion: 1, scheduledAt: at,
    deadlineAt: at + 4 * hour,
    reminderPlan: { entries: [{ kind: 'dose_time', fireAt: at }, { kind: 'deadline', fireAt: at + 4 * hour }] },
    status, snoozeCount: 0, notificationIds: {}, timezoneAtGeneration: TZ,
    createdAt: at, updatedAt: at
  };
}

function env(now: Instant) {
  const persistence = new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage());
  const medicationRepository = new LocalStorageMedicationRepository(persistence);
  const occurrenceRepository = new LocalStorageDoseOccurrenceRepository(persistence);
  const clock = new FakeClockAdapter(now, TZ);
  const service = new OccurrenceQueryService({ occurrenceRepository, medicationRepository, clock, converter });
  medicationRepository.save({
    id: 'med-1', name: 'تست', form: 'قرص', dose: '۱ عدد',
    schedule: { scheduleVersion: 1, frequencyType: 'daily', slots: [{ slotId: 'slot-1', timeOfDay: { hour: 8, minute: 0 }, order: 0 }], timezoneId: TZ },
    safety: {}, remainingCount: 10, totalCount: 10, alertThreshold: 2, isActive: true,
    familyMemberId: 'me', createdAt: '2026-01-01T00:00:00.000Z'
  });
  return { service, occurrenceRepository, clock };
}

test('snapshot: روز امروز را از تقویم محلی می‌گیرد، نه تاریخ UTC', () => {
  const now = tehran(2026, 3, 10, 0, 20); // UTC هنوز ۹ مارس است
  const { service, occurrenceRepository } = env(now);
  occurrenceRepository.upsertIfAbsent(occurrence('today', tehran(2026, 3, 10, 0, 15), 'taken'));
  occurrenceRepository.upsertIfAbsent(occurrence('yesterday', tehran(2026, 3, 9, 23, 50), 'taken', 'slot-2'));

  const snapshot = service.snapshot();
  assert.equal(snapshot.today.localDate, '2026-03-10');
  assert.equal(snapshot.today.total, 1);
  assert.equal(snapshot.today.taken, 1);
});

test('snapshot: pending در denominator امروز می‌ماند، canceled حذف می‌شود', () => {
  const now = tehran(2026, 3, 10, 12);
  const { service, occurrenceRepository } = env(now);
  occurrenceRepository.upsertIfAbsent(occurrence('taken', tehran(2026, 3, 10, 8), 'taken'));
  occurrenceRepository.upsertIfAbsent(occurrence('pending', tehran(2026, 3, 10, 10), 'pending', 'slot-2'));
  occurrenceRepository.upsertIfAbsent(occurrence('canceled', tehran(2026, 3, 10, 11), 'canceled', 'slot-3'));

  const today = service.snapshot().today;
  assert.equal(today.total, 2);
  assert.equal(today.taken, 1);
  assert.equal(today.adherence, 50);
});

test('snapshot: legacy log وقتی occurrence جدید برای همان روز وجود دارد دوباره شمرده نمی‌شود', () => {
  const now = tehran(2026, 3, 10, 12);
  const { service, occurrenceRepository } = env(now);
  occurrenceRepository.upsertIfAbsent(occurrence('new-taken', tehran(2026, 3, 10, 8), 'taken'));
  const legacy: DoseLog = {
    id: 'legacy-1', medId: 'med-1', slotIndex: 0, medName: 'تست', medForm: 'قرص', medDose: '۱ عدد',
    scheduledTime: '۰۸:۰۰', actualTime: '۰۸:۰۱', status: 'taken', date: '2026-03-10', familyMemberId: 'me'
  };

  const today = service.snapshot([legacy]).today;
  assert.equal(today.total, 1);
  assert.equal(today.taken, 1);
});

test('snapshot: legacy تاریخ‌های قبل از مهاجرت را حفظ می‌کند', () => {
  const now = tehran(2026, 3, 10, 12);
  const { service } = env(now);
  const legacy: DoseLog = {
    id: 'legacy-1', medId: 'med-1', slotIndex: 0, medName: 'تست', medForm: 'قرص', medDose: '۱ عدد',
    scheduledTime: '۰۸:۰۰', status: 'skipped', date: '2026-03-09', familyMemberId: 'me'
  };
  const snapshot = service.snapshot([legacy]);
  const yesterday = snapshot.weekly.find(day => day.localDate === '2026-03-09');
  assert.equal(yesterday?.skipped, 1);
});

test('snapshot: هفته از شنبه تا جمعه‌ی محلی ساخته می‌شود و نرخ‌ها واقعی‌اند', () => {
  const now = tehran(2026, 3, 10, 12); // سه‌شنبه
  const { service, occurrenceRepository } = env(now);
  occurrenceRepository.upsertIfAbsent(occurrence('taken', tehran(2026, 3, 10, 8), 'taken'));
  occurrenceRepository.upsertIfAbsent(occurrence('missed', tehran(2026, 3, 10, 10), 'missed', 'slot-2'));

  const snapshot = service.snapshot();
  assert.equal(snapshot.weekly.length, 7);
  assert.equal(snapshot.weekly[0].localDate, '2026-03-13'); // جمعه، ترتیب بصری قبلی
  assert.equal(snapshot.weekly[6].localDate, '2026-03-07'); // شنبه
  const tuesday = snapshot.weekly.find(day => day.localDate === '2026-03-10')!;
  assert.equal(tuesday.taken, 1);
  assert.equal(tuesday.missed, 1);
  assert.equal(tuesday.takenRate, 50);
});

test('findReportDoses: canceledها را از read model حذف می‌کند', () => {
  const now = tehran(2026, 3, 10, 12);
  const { service, occurrenceRepository } = env(now);
  occurrenceRepository.upsertIfAbsent(occurrence('c', tehran(2026, 3, 10, 8), 'canceled'));
  const range = { from: tehran(2026, 3, 7, 0), to: tehran(2026, 3, 14, 0) - 1 };
  assert.deepEqual(service.findReportDoses(range), []);
});
