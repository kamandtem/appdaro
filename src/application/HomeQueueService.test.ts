import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryKeyValueStorage, LocalStoragePersistenceAdapter } from '../adapters/LocalStoragePersistenceAdapter';
import { LocalStorageMedicationRepository } from '../repository/MedicationRepository';
import { LocalStorageDoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import { FakeClockAdapter } from '../adapters/ClockAdapter';
import { FixedOffsetTimeZoneConverter } from '../domain/shared/TimeZoneConverter';
import { plan } from '../domain/reminders/ReminderEngine';
import { EXEMPT_DEADLINE_SENTINEL } from '../domain/occurrence/OccurrenceGenerator';
import { migrateLegacyData } from '../migration/migrateLegacyData';
import { DoseOccurrence, Instant, Medication, OccurrenceStatus } from '../types';
import {
  HomeQueueDeps,
  MAX_VISIBLE_CARDS,
  homeCards,
  localDayRange,
  nextCard,
  nextTransitionAt,
  todaySummary,
  visibleCards
} from './HomeQueueService';

const TZ = 'Asia/Tehran';
const OFFSET_MINUTES = 210; // UTC+03:30
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const converter = new FixedOffsetTimeZoneConverter(OFFSET_MINUTES);

/** یک لحظه‌ی مطلق از روی ساعت دیواری تهران. */
function tehran(year: number, month: number, day: number, hour: number, minute = 0): Instant {
  return converter.toInstant({ year, month, day, hour, minute }, TZ);
}

function makeEnv(now: Instant) {
  const persistence = new LocalStoragePersistenceAdapter(new InMemoryKeyValueStorage());
  const medicationRepository = new LocalStorageMedicationRepository(persistence);
  const occurrenceRepository = new LocalStorageDoseOccurrenceRepository(persistence);
  const clock = new FakeClockAdapter(now, TZ);
  const deps: HomeQueueDeps = {
    medicationRepository,
    occurrenceRepository,
    clock,
    converter: new FixedOffsetTimeZoneConverter(OFFSET_MINUTES)
  };
  return { deps, medicationRepository, occurrenceRepository, clock };
}

interface OccOptions {
  medicationId?: string;
  slotId?: string;
  status?: OccurrenceStatus;
  snoozeCount?: number;
  exempt?: boolean;
  intervalHours?: number;
}

/** occurrence با `reminderPlan` واقعیِ ReminderEngine — نه یک plan دستیِ
 *  جعلی، تا تست‌ها روی همان فرمول سه‌گانه‌ی واقعی کار کنند. */
function makeOcc(id: string, scheduledAt: Instant, opts: OccOptions = {}): DoseOccurrence {
  const reminderPlan = plan(
    { scheduledAt },
    opts.exempt ? { kind: 'exempt' } : { kind: 'standard', intervalHours: opts.intervalHours ?? 8 }
  );
  const deadline = reminderPlan.entries.find(e => e.kind === 'deadline');
  return {
    id,
    medicationId: opts.medicationId ?? 'med-1',
    slotId: opts.slotId ?? 'slot-1',
    scheduleVersion: 1,
    scheduledAt,
    deadlineAt: deadline ? deadline.fireAt : EXEMPT_DEADLINE_SENTINEL,
    reminderPlan,
    status: opts.status ?? 'pending',
    snoozeCount: opts.snoozeCount ?? 0,
    notificationIds: {},
    timezoneAtGeneration: TZ,
    createdAt: scheduledAt,
    updatedAt: scheduledAt
  };
}

// ── بخش ۱۷.۲، قانون ۱ و ۴ — پنجره‌ی فعال‌سازی ──────────────────────────────

test('visibleCards: occurrenceای که هنوز به پنجره‌ی فعال‌سازی نرسیده اصلاً دیده نمی‌شود', () => {
  const now = tehran(2026, 3, 10, 8, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  // ۲ ساعت بعد — خیلی دورتر از lead ۳۰ دقیقه‌ای.
  occurrenceRepository.upsertIfAbsent(makeOcc('o1', tehran(2026, 3, 10, 10, 0)));

  assert.deepEqual(visibleCards(now, deps), []);
});

test('visibleCards: دقیقاً روی مرز پنجره‌ی فعال‌سازی (۳۰ دقیقه مانده) فعال می‌شود', () => {
  const now = tehran(2026, 3, 10, 8, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('o1', now + 30 * MINUTE));

  assert.deepEqual(visibleCards(now, deps).map(o => o.id), ['o1']);
});

test('visibleCards: یک دقیقه پیش از مرز پنجره، هنوز پنهان است', () => {
  const now = tehran(2026, 3, 10, 8, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('o1', now + 31 * MINUTE));

  assert.deepEqual(visibleCards(now, deps), []);
});

test('visibleCards: فقط occurrenceهای pending — ترمینال‌ها هرگز کارت نمی‌شوند', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  const at = tehran(2026, 3, 10, 9, 0);
  occurrenceRepository.upsertIfAbsent(makeOcc('taken', at, { slotId: 's1', status: 'taken' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('skipped', at, { slotId: 's2', status: 'skipped' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('missed', at, { slotId: 's3', status: 'missed' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('canceled', at, { slotId: 's4', status: 'canceled' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('pending', at, { slotId: 's5' }));

  assert.deepEqual(visibleCards(now, deps).map(o => o.id), ['pending']);
});

test('visibleCards: occurrence دیروزِ هنوز-pending (exempt) وارد پنل امروز نمی‌شود', () => {
  const now = tehran(2026, 3, 10, 9, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  // exempt یعنی sweepMissed هرگز missed‌اش نمی‌کند — بدون کفِ «امروزِ محلی»
  // این کارت تا ابد در پنل خانه می‌ماند.
  occurrenceRepository.upsertIfAbsent(makeOcc('yesterday', tehran(2026, 3, 9, 9, 0), { exempt: true, slotId: 's1' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('today', tehran(2026, 3, 10, 8, 30), { exempt: true, slotId: 's2' }));

  assert.deepEqual(visibleCards(now, deps).map(o => o.id), ['today']);
});

test('localDayRange: مرز روز از تقویم محلی گرفته می‌شود، نه UTC (باگ نیمه‌شب)', () => {
  // ۰۰:۲۰ بامداد تهران = هنوز ۲۰:۵۰ روز *قبل* به وقت UTC.
  const now = tehran(2026, 3, 10, 0, 20);
  assert.equal(new Date(now).toISOString().split('T')[0], '2026-03-09');

  const range = localDayRange(now, TZ, converter);
  assert.equal(range.from, tehran(2026, 3, 10, 0, 0));
  assert.equal(range.to, tehran(2026, 3, 11, 0, 0) - 1);
});

test('visibleCards: ۰۰:۲۰ بامداد، دوز همان بامداد دیده می‌شود (نه دوز دیروز)', () => {
  const now = tehran(2026, 3, 10, 0, 20);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('lastNight', tehran(2026, 3, 9, 23, 0), { exempt: true, slotId: 's1' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('afterMidnight', tehran(2026, 3, 10, 0, 15), { exempt: true, slotId: 's2' }));

  assert.deepEqual(visibleCards(now, deps).map(o => o.id), ['afterMidnight']);
});

// ── بخش ۱۷.۲، قانون ۲ و ۳ — سقف ۵ کارت و صف داخلی ─────────────────────────

test('visibleCards: هرگز بیشتر از ۵ کارت برنمی‌گرداند، حتی با ۱۲ دوز فعال', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  // سناریوی خودِ سند: ۴ داروی ۸ساعته -> ۱۲ occurrence در یک روز.
  for (let i = 0; i < 12; i++) {
    occurrenceRepository.upsertIfAbsent(
      makeOcc(`o${i}`, tehran(2026, 3, 10, 0, 0) + i * 5 * MINUTE, { slotId: `s${i}` })
    );
  }

  assert.equal(visibleCards(now, deps).length, MAX_VISIBLE_CARDS);
});

test('visibleCards: با resolve شدن یکی از ۵ کارت جلو، نفر ششمِ صف جایش را می‌گیرد', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  for (let i = 0; i < 6; i++) {
    occurrenceRepository.upsertIfAbsent(
      makeOcc(`o${i}`, tehran(2026, 3, 10, 11, 0) + i * MINUTE, { slotId: `s${i}` })
    );
  }
  const before = visibleCards(now, deps).map(o => o.id);
  assert.equal(before.length, 5);
  assert.ok(!before.includes('o5'));

  const first = occurrenceRepository.getById(before[0])!;
  occurrenceRepository.update({ ...first, status: 'taken' });

  const after = visibleCards(now, deps).map(o => o.id);
  assert.equal(after.length, 5);
  assert.ok(after.includes('o5'), 'نفر ششم باید وارد لیست شده باشد');
  assert.ok(!after.includes(before[0]));
});

// ── ترتیب اولویت (بخش ۱۷.۲ قانون ۲ + بخش ۱۷.۳) ────────────────────────────

test('visibleCards: پله‌ی escalation بالاتر جلوتر می‌آید', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  // interval=8h => r1=+15m, r2=+2h, deadline=+4h
  occurrenceRepository.upsertIfAbsent(makeOcc('step0', now, { slotId: 's0' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('step1', now - 20 * MINUTE, { slotId: 's1' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('step2', now - 3 * HOUR, { slotId: 's2' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('step3', now - 5 * HOUR, { slotId: 's3' }));

  assert.deepEqual(visibleCards(now, deps).map(o => o.id), ['step3', 'step2', 'step1', 'step0']);
});

test('visibleCards: کارت «بعداً»خورده همیشه بعد از کارت‌های دست‌نخورده است، حتی با پله‌ی بالاتر', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('snoozedStep3', now - 5 * HOUR, { slotId: 's1', snoozeCount: 2 }));
  occurrenceRepository.upsertIfAbsent(makeOcc('freshStep0', now, { slotId: 's2' }));

  assert.deepEqual(visibleCards(now, deps).map(o => o.id), ['freshStep0', 'snoozedStep3']);
});

test('visibleCards: بین خودِ «بعداً»خورده‌ها هم پله‌ی escalation رعایت می‌شود', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('snoozedLow', now, { slotId: 's1', snoozeCount: 1 }));
  occurrenceRepository.upsertIfAbsent(makeOcc('snoozedHigh', now - 5 * HOUR, { slotId: 's2', snoozeCount: 1 }));

  assert.deepEqual(visibleCards(now, deps).map(o => o.id), ['snoozedHigh', 'snoozedLow']);
});

test('visibleCards: در تساوی پله، دوز زودتر جلوتر است (ترتیب قطعی)', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('later', now - MINUTE, { slotId: 's1' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('earlier', now - 2 * MINUTE, { slotId: 's2' }));

  assert.deepEqual(visibleCards(now, deps).map(o => o.id), ['earlier', 'later']);
});

test('visibleCards: occurrence exempt همیشه پله‌ی ۰ دارد و هرگز جلوی یک کارت عادیِ سررسیدشده نمی‌افتد', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  // exempt، ۵ ساعت گذشته — ولی چون plan هیچ deadline ندارد، پله‌اش ۰ می‌ماند.
  occurrenceRepository.upsertIfAbsent(makeOcc('exempt', now - 5 * HOUR, { slotId: 's1', exempt: true }));
  occurrenceRepository.upsertIfAbsent(makeOcc('standard', now - 20 * MINUTE, { slotId: 's2' }));

  const cards = homeCards(now, deps);
  assert.deepEqual(cards.map(c => c.occurrence.id), ['standard', 'exempt']);
  assert.equal(cards[1].escalationStep, 0);
  assert.equal(cards[1].isExempt, true);
});

// ── HomeCard (ViewModel) ───────────────────────────────────────────────────

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

/** محیط کامل، ساخته‌شده با اجرای واقعی `migrateLegacyData` — نه occurrence دستی. */
function migratedEnv(now: Instant, meds: Medication[]) {
  const env = makeEnv(now);
  let counter = 0;
  migrateLegacyData(meds, {
    medicationRepository: env.medicationRepository,
    occurrenceRepository: env.occurrenceRepository,
    converter: env.deps.converter,
    clock: env.clock,
    generateId: () => `id-${++counter}`,
    horizonHours: 24
  });
  return env;
}

test('homeCards: ساعت کارت از scheduledAt واقعی می‌آید و legacySlotIndex به order نگاشت می‌شود', () => {
  const now = tehran(2026, 3, 10, 20, 50); // ۱۰ دقیقه مانده به دوز ۲۱:۰۰
  const { deps } = migratedEnv(now, [legacyMed()]);

  const cards = homeCards(now, deps);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].timeOfDay, { hour: 21, minute: 0 });
  // '۲۱:۰۰' جایگاه دوم آرایه‌ی legacy.times است.
  assert.equal(cards[0].legacySlotIndex, 1);
});

test('homeCards: برای فرکانس interval، ساعت هر کارت از خودِ occurrence می‌آید نه از anchor جایگاه', () => {
  const now = tehran(2026, 3, 10, 14, 0);
  const { deps } = migratedEnv(now, [
    legacyMed({
      frequency: 'هر چند ساعت',
      customIntervalHours: 6,
      times: ['۰۸:۰۰'],
      scheduleStartAt: new Date(tehran(2026, 3, 10, 8, 0)).toISOString()
    })
  ]);

  const cards = homeCards(now, deps);
  assert.equal(cards.length, 1);
  // زنجیره: ۰۸:۰۰ / ۱۴:۰۰ / ۲۰:۰۰ — کارت فعال باید ۱۴:۰۰ باشد، نه anchor ۰۸:۰۰.
  assert.deepEqual(cards[0].timeOfDay, { hour: 14, minute: 0 });
});

test('homeCards: داروی critical با isCritical علامت می‌خورد و exempt می‌ماند', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository, medicationRepository } = migratedEnv(now, [legacyMed()]);
  const aggregate = medicationRepository.getById('med-1')!;
  medicationRepository.save({ ...aggregate, safety: { safetyLevel: 'critical' } });
  occurrenceRepository.upsertIfAbsent(makeOcc('crit', now, { slotId: 'manual-slot', exempt: true }));

  const card = homeCards(now, deps).find(c => c.occurrence.id === 'crit')!;
  assert.equal(card.isCritical, true);
  assert.equal(card.isExempt, true);
});

test('homeCards: isSnoozed از snoozeCount خودِ occurrence می‌آید (بخش ۱۷.۴)', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('a', now, { slotId: 's1' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('b', now, { slotId: 's2', snoozeCount: 3 }));

  const cards = homeCards(now, deps);
  assert.equal(cards.find(c => c.occurrence.id === 'a')!.isSnoozed, false);
  assert.equal(cards.find(c => c.occurrence.id === 'b')!.isSnoozed, true);
});

test('nextCard: دقیقاً همان آیتم اول visibleCards است (بخش ۱۷.۶ — منبع واحد)', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('late', now - 5 * HOUR, { slotId: 's1' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('fresh', now, { slotId: 's2' }));

  assert.equal(nextCard(now, deps)!.occurrence.id, visibleCards(now, deps)[0].id);
  assert.equal(nextCard(now, deps)!.occurrence.id, 'late');
});

test('nextCard: وقتی هیچ کارتی فعال نیست null برمی‌گرداند', () => {
  const now = tehran(2026, 3, 10, 12, 0);
  const { deps } = makeEnv(now);
  assert.equal(nextCard(now, deps), null);
});

// ── todaySummary ───────────────────────────────────────────────────────────

test('todaySummary: total/resolved/taken روی روز محلی حساب می‌شود و canceled کنار می‌رود', () => {
  const now = tehran(2026, 3, 10, 22, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('t1', tehran(2026, 3, 10, 8, 0), { slotId: 's1', status: 'taken' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('t2', tehran(2026, 3, 10, 14, 0), { slotId: 's2', status: 'taken' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('s1', tehran(2026, 3, 10, 16, 0), { slotId: 's3', status: 'skipped' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('m1', tehran(2026, 3, 10, 18, 0), { slotId: 's4', status: 'missed' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('p1', tehran(2026, 3, 10, 22, 0), { slotId: 's5' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('c1', tehran(2026, 3, 10, 23, 0), { slotId: 's6', status: 'canceled' }));
  // دیروز و فردا — نباید در آمار امروز بیایند.
  occurrenceRepository.upsertIfAbsent(makeOcc('y1', tehran(2026, 3, 9, 8, 0), { slotId: 's7', status: 'taken' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('n1', tehran(2026, 3, 11, 8, 0), { slotId: 's8' }));

  const summary = todaySummary(now, deps);
  assert.equal(summary.total, 5);
  assert.equal(summary.resolved, 4);
  assert.equal(summary.taken, 2);
  assert.deepEqual(summary.takenCards.map(c => c.occurrence.id), ['t1', 't2']);
});

test('todaySummary: ۲۳:۵۰ به وقت محلی هنوز همان روز است (نه فردای UTC)', () => {
  const now = tehran(2026, 3, 10, 23, 50);
  // ۲۳:۵۰ تهران = ۲۰:۲۰ همان روز UTC — پس این تست جهت مخالف باگ نیمه‌شب را می‌بندد.
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('lateDose', tehran(2026, 3, 10, 23, 55), { slotId: 's1' }));
  occurrenceRepository.upsertIfAbsent(makeOcc('tomorrow', tehran(2026, 3, 11, 0, 5), { slotId: 's2' }));

  assert.equal(todaySummary(now, deps).total, 1);
  assert.deepEqual(visibleCards(now, deps).map(o => o.id), ['lateDose']);
});

test('todaySummary: داروی «روزهای هفته» فقط در روزهای انتخاب‌شده دوز دارد (رفع باگ زنده‌ی بخش ۰)', () => {
  // ۱۰ مارس ۲۰۲۶ سه‌شنبه است.
  const tuesday = tehran(2026, 3, 10, 12, 0);
  const wednesday = tehran(2026, 3, 11, 12, 0);
  const med = legacyMed({ frequency: 'روزهای هفته', selectedDays: ['چهارشنبه'], times: ['۰۸:۰۰'] });

  assert.equal(todaySummary(tuesday, migratedEnv(tuesday, [med]).deps).total, 0);
  assert.equal(todaySummary(wednesday, migratedEnv(wednesday, [med]).deps).total, 1);
});

// ── nextTransitionAt (جایگزین تایمر شمارش‌معکوس — بخش ۱۷.۵) ────────────────

test('nextTransitionAt: زودترین مرز آینده را می‌دهد (ورود به پنجره‌ی فعال‌سازی)', () => {
  const now = tehran(2026, 3, 10, 8, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  const scheduledAt = tehran(2026, 3, 10, 10, 0);
  occurrenceRepository.upsertIfAbsent(makeOcc('o1', scheduledAt));

  assert.equal(nextTransitionAt(now, deps), scheduledAt - 30 * MINUTE);
});

test('nextTransitionAt: پس از فعال‌شدن کارت، مرز بعدی یادآور اول (T0+۱۵دقیقه) است', () => {
  const scheduledAt = tehran(2026, 3, 10, 10, 0);
  const now = scheduledAt + MINUTE;
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('o1', scheduledAt));

  assert.equal(nextTransitionAt(now, deps), scheduledAt + 15 * MINUTE);
});

test('nextTransitionAt: وقتی هیچ مرز آینده‌ای نمانده null است', () => {
  const scheduledAt = tehran(2026, 3, 10, 10, 0);
  const now = scheduledAt + 10 * HOUR; // از ددلاین (+۴ ساعت) هم خیلی گذشته
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('o1', scheduledAt));

  assert.equal(nextTransitionAt(now, deps), null);
});

test('nextTransitionAt: occurrenceهای ترمینال هیچ مرزی تولید نمی‌کنند', () => {
  const now = tehran(2026, 3, 10, 8, 0);
  const { deps, occurrenceRepository } = makeEnv(now);
  occurrenceRepository.upsertIfAbsent(makeOcc('o1', tehran(2026, 3, 10, 10, 0), { status: 'taken' }));

  assert.equal(nextTransitionAt(now, deps), null);
});
