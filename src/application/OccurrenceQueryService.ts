// OccurrenceQueryService (تیکه ۱۱ — DESIGN.md بخش‌های ۱۰، ۱۱ و ۱۶)
//
// ReportsView دیگر نباید از «امروز» و لاگ‌های پراکنده، خودش تاریخ/هفته را
// حدس بزند. این سرویس تنها نقطه‌ی query برای read-model گزارش‌هاست:
// occurrenceهای جدید را از Repository می‌خواند، DoseLogهای قدیمی را فقط برای
// تاریخچه‌ی قبل از مهاجرت نگه می‌دارد، و همه‌ی بازه‌ها را با تقویم محلی
// ClockAdapter + TimeZoneConverter می‌سازد.

import { DoseLog, DoseOccurrence, Instant, Medication, SkipReason } from '../types';
import type { ClockAdapter } from '../adapters/ClockAdapter';
import type { TimeZoneConverter } from '../domain/shared/TimeZoneConverter';
import { addDays, LocalDate, weekdayOf } from '../domain/shared/calendar';
import type { DoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import type { MedicationRepository } from '../repository/MedicationRepository';

export interface OccurrenceQueryDeps {
  occurrenceRepository: DoseOccurrenceRepository;
  medicationRepository: MedicationRepository;
  clock: ClockAdapter;
  converter: TimeZoneConverter;
}

export interface ReportDose {
  id: string;
  occurrenceId?: string;
  medicationId: string;
  medName: string;
  medForm: Medication['form'];
  medDose: string;
  slotId?: string;
  scheduledAt?: Instant;
  status: 'pending' | 'taken' | 'skipped' | 'missed' | 'canceled';
  statusReason?: SkipReason;
  legacy: boolean;
  localDate: string;
}

export interface WeeklyReportDay {
  name: string;
  localDate: string;
  adherence: number;
  takenRate: number;
  skippedRate: number;
  missedRate: number;
  taken: number;
  skipped: number;
  missed: number;
  total: number;
}

export interface ReportSnapshot {
  today: {
    localDate: string;
    total: number;
    taken: number;
    skipped: number;
    missed: number;
    adherence: number;
  };
  weekly: WeeklyReportDay[];
  weekSkippedTotal: number;
  weekMissedTotal: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function localDateKey(date: LocalDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function toLocalDate(instant: Instant, timezoneId: string, converter: TimeZoneConverter): LocalDate {
  const local = converter.toLocal(instant, timezoneId);
  return { year: local.year, month: local.month, day: local.day };
}

function rangeForLocalDates(
  from: LocalDate,
  toExclusive: LocalDate,
  timezoneId: string,
  converter: TimeZoneConverter
): { from: Instant; to: Instant } {
  const fromInstant = converter.toInstant({ ...from, hour: 0, minute: 0 }, timezoneId);
  const toInstant = converter.toInstant({ ...toExclusive, hour: 0, minute: 0 }, timezoneId);
  return { from: fromInstant, to: toInstant - 1 };
}

function saturdayOf(date: LocalDate): LocalDate {
  const weekday = weekdayOf(date);
  const daysSinceSaturday: Record<string, number> = {
    شنبه: 0,
    یکشنبه: 1,
    دوشنبه: 2,
    سه‌شنبه: 3,
    چهارشنبه: 4,
    پنجشنبه: 5,
    جمعه: 6
  };
  return addDays(date, -daysSinceSaturday[weekday]);
}

function statusIsCountable(status: ReportDose['status']): boolean {
  return status === 'taken' || status === 'skipped' || status === 'missed';
}

function adaptOccurrence(
  occurrence: DoseOccurrence,
  medicationsById: Map<string, Medication>,
  timezoneId: string,
  converter: TimeZoneConverter
): ReportDose {
  const med = medicationsById.get(occurrence.medicationId);
  const localDate = localDateKey(toLocalDate(occurrence.scheduledAt, timezoneId, converter));
  return {
    id: occurrence.id,
    occurrenceId: occurrence.id,
    medicationId: occurrence.medicationId,
    medName: med?.name ?? occurrence.medicationId,
    medForm: med?.form ?? 'قرص',
    medDose: med?.dose ?? '',
    slotId: occurrence.slotId,
    scheduledAt: occurrence.scheduledAt,
    status: occurrence.status,
    statusReason: occurrence.statusReason,
    legacy: false,
    localDate
  };
}

function adaptLegacyLog(log: DoseLog): ReportDose {
  return {
    id: log.id,
    medicationId: log.medId,
    medName: log.medName,
    medForm: log.medForm,
    medDose: log.medDose,
    status: log.status === 'snoozed' ? 'pending' : log.status,
    statusReason: log.skipReason,
    legacy: true,
    localDate: log.date
  };
}

/**
 * occurrence جدید بر legacy ترجیح دارد، تا dual-write موقت باعث دوبار شمردن
 * یک دوز نشود. کلید تطبیق عمداً فقط برای رکوردهای terminal ساخته می‌شود:
 * pending جدید معادل log قدیمی ندارد و باید در denominator گزارش بماند.
 */
function mergeNewAndLegacy(newRows: ReportDose[], legacyRows: ReportDose[]): ReportDose[] {
  const occupied = new Set(
    newRows
      .filter(row => statusIsCountable(row.status))
      .map(row => `${row.medicationId}|${row.localDate}|${row.status === 'taken' ? 'taken' : row.slotId ?? ''}`)
  );

  const result = [...newRows];
  for (const legacy of legacyRows) {
    const exact = `${legacy.medicationId}|${legacy.localDate}|${legacy.status === 'taken' ? 'taken' : ''}`;
    const sameDateMedication = newRows.some(
      row => row.medicationId === legacy.medicationId && row.localDate === legacy.localDate && statusIsCountable(row.status)
    );
    if (!occupied.has(exact) && !sameDateMedication) result.push(legacy);
  }
  return result;
}

function count(rows: ReportDose[], status: ReportDose['status']): number {
  return rows.filter(row => row.status === status).length;
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.min(100, Math.round((numerator / denominator) * 100)) : 0;
}

export class OccurrenceQueryService {
  constructor(private readonly deps: OccurrenceQueryDeps) {}

  /** همه‌ی occurrenceها در بازه، همراه با legacy logهای غیرتکراری. */
  findReportDoses(range: { from: Instant; to: Instant }, legacyLogs: DoseLog[] = []): ReportDose[] {
    const medications = this.deps.medicationRepository.getAll();
    const byId = new Map(medications.map(m => [m.id, m]));
    const timezoneId = this.deps.clock.currentTimeZoneId();
    const occurrences = this.deps.occurrenceRepository
      .findByDateRange(range)
      .filter(row => row.status !== 'canceled')
      .map(row => adaptOccurrence(row, byId, timezoneId, this.deps.converter));

    const fromDate = toLocalDate(range.from, timezoneId, this.deps.converter);
    const toDate = toLocalDate(range.to, timezoneId, this.deps.converter);
    const fromKey = localDateKey(fromDate);
    const toKey = localDateKey(toDate);
    const legacy = legacyLogs
      .filter(log => log.date >= fromKey && log.date <= toKey)
      .map(adaptLegacyLog);

    return mergeNewAndLegacy(occurrences, legacy);
  }

  snapshot(legacyLogs: DoseLog[] = []): ReportSnapshot {
    const now = this.deps.clock.now();
    const timezoneId = this.deps.clock.currentTimeZoneId();
    const today = toLocalDate(now, timezoneId, this.deps.converter);
    const todayKey = localDateKey(today);
    const saturday = saturdayOf(today);
    const nextSaturday = addDays(saturday, 7);
    const weeklyRange = rangeForLocalDates(saturday, nextSaturday, timezoneId, this.deps.converter);
    const rows = this.findReportDoses(weeklyRange, legacyLogs);
    const todayRows = rows.filter(row => row.localDate === todayKey);

    const dayRows = new Map<string, ReportDose[]>();
    for (const row of rows) {
      const bucket = dayRows.get(row.localDate) ?? [];
      bucket.push(row);
      dayRows.set(row.localDate, bucket);
    }

    // همان ترتیب بصری قبلی برای نمودار RTL: جمعه تا شنبه.
    const weekly = Array.from({ length: 7 }, (_, index) => {
      const offset = 6 - index;
      const date = addDays(saturday, offset);
      const dateKey = localDateKey(date);
      const day = dayRows.get(dateKey) ?? [];
      const taken = count(day, 'taken');
      const skipped = count(day, 'skipped');
      const missed = count(day, 'missed');
      const total = day.length;
      return {
        name: weekdayOf(date),
        localDate: dateKey,
        adherence: rate(taken, total),
        takenRate: rate(taken, total),
        skippedRate: rate(skipped, total),
        missedRate: rate(missed, total),
        taken,
        skipped,
        missed,
        total
      };
    });

    const total = todayRows.length;
    const taken = count(todayRows, 'taken');
    const skipped = count(todayRows, 'skipped');
    const missed = count(todayRows, 'missed');
    return {
      today: { localDate: todayKey, total, taken, skipped, missed, adherence: rate(taken, total) },
      weekly,
      weekSkippedTotal: weekly.reduce((sum, day) => sum + day.skipped, 0),
      weekMissedTotal: weekly.reduce((sum, day) => sum + day.missed, 0)
    };
  }
}
