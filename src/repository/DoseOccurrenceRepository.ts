// DoseOccurrenceRepository (DESIGN.md بخش ۸) — دقیقاً همون ۶ متدی که سند
// امضاشون رو داده، به‌علاوه‌ی `pruneOlderThan` که بخش ۸ به‌صورت مجزا (نه توی
// بلوک کد امضا، بلکه توی توضیح «استراتژی نگه‌داری») مسئولیتش رو به همین لایه
// داده: «Repository مسئول pruning است». چون بخش ۱۵ (ریسک‌ها) صریحاً می‌گه
// این استراتژی باید «از همان فاز ۱... نه به‌عنوان کار بعدی» وجود داشته باشه،
// همینجا (همون تیکه‌ای که Repository رو می‌سازه) پیاده شده، نه گذاشته شده
// برای یک تیکه‌ی جدا.

import { DoseHistoryRecord, DoseOccurrence, Instant, MedicationForm, OccurrenceId, OccurrenceStatus, SkipReason } from '../types';
import { PersistenceAdapter } from '../adapters/LocalStoragePersistenceAdapter';

export interface DoseOccurrenceRepository {
  /** کلید طبیعی طبق DESIGN.md بخش ۳: (medicationId, slotId, scheduledAt).
   *  اگه رکوردی با همین کلید از قبل هست، هیچ‌کاری نمی‌کنه و 'exists'
   *  برمی‌گردونه — حتی اگه اون رکورد از این occurrence جدید متفاوت باشه
   *  (مثلاً status فرق کنه)؛ رکورد موجود دست‌نخورده می‌مونه (immutability
   *  rule). */
  upsertIfAbsent(occ: DoseOccurrence): 'created' | 'exists';
  getById(id: OccurrenceId): DoseOccurrence | null;
  /** برای sweepMissed (ResolverEngine، تیکه ۷) — کل backlog pending‌ای که
   *  ددلاینش گذشته، نه فقط «امروز». */
  findPendingWithDeadlineBefore(now: Instant): DoseOccurrence[];
  findByMedication(medId: string, range?: { from: Instant; to: Instant }): DoseOccurrence[];
  findByDateRange(range: { from: Instant; to: Instant }): DoseOccurrence[];
  /** فقط از طریق ResolverEngine/NotificationEngine صدا زده بشه (طبق تأکید
   *  صریح سند) — خودِ این متد enforce نمی‌کنه، چون این یک محدودیت معماری/
   *  انضباطی روی caller هاست، نه چیزی که این لایه بتونه از نظر type-system
   *  تضمین کنه. */
  update(occ: DoseOccurrence): void;
  /** استراتژی نگه‌داری بخش ۸: occurrenceهای ترمینال (taken/skipped/missed/
   *  canceled) که `scheduledAt`شون قدیمی‌تر از `thresholdInstant`ه، به
   *  `DoseHistoryRecord` مسطح فشرده و از جدول اصلی حذف می‌شن — تا حجم
   *  occurrence نامحدود رشد نکنه (بخش ۱۵). `resolveMedication` برای پرکردن
   *  فیلدهای نمایشی (medName/medForm/medDose/familyMemberId) لازمه، چون
   *  خودِ DoseOccurrence این‌ها رو denormalize نکرده — این تابع inject
   *  می‌شه تا این Repository مستقیماً به MedicationRepository کوپل نشه.
   *  اگه دارویی پیدا نشه (مثلاً کاملاً حذف شده)، همون occurrence فعلاً
   *  prune نمی‌شه (نه خطا می‌ده، نه گمش می‌کنه) — می‌مونه برای دور بعد. */
  pruneOlderThan(
    thresholdInstant: Instant,
    resolveMedication: (medicationId: string) => { name: string; form: MedicationForm; dose: string; familyMemberId: string } | undefined
  ): DoseHistoryRecord[];
}

const COLLECTION = 'dose_occurrences';
const HISTORY_COLLECTION = 'dose_history_records';
const TERMINAL_STATUSES: OccurrenceStatus[] = ['taken', 'skipped', 'missed', 'canceled'];

export class LocalStorageDoseOccurrenceRepository implements DoseOccurrenceRepository {
  constructor(private readonly persistence: PersistenceAdapter) {}

  private readAll(): DoseOccurrence[] {
    return this.persistence.readAll<DoseOccurrence>(COLLECTION);
  }

  private writeAll(items: DoseOccurrence[]): void {
    this.persistence.writeAll(COLLECTION, items);
  }

  upsertIfAbsent(occ: DoseOccurrence): 'created' | 'exists' {
    const all = this.readAll();
    const exists = all.some(
      o => o.medicationId === occ.medicationId && o.slotId === occ.slotId && o.scheduledAt === occ.scheduledAt
    );
    if (exists) return 'exists';
    this.writeAll([...all, occ]);
    return 'created';
  }

  getById(id: OccurrenceId): DoseOccurrence | null {
    return this.readAll().find(o => o.id === id) ?? null;
  }

  findPendingWithDeadlineBefore(now: Instant): DoseOccurrence[] {
    return this.readAll().filter(o => o.status === 'pending' && o.deadlineAt < now);
  }

  findByMedication(medId: string, range?: { from: Instant; to: Instant }): DoseOccurrence[] {
    return this.readAll().filter(
      o => o.medicationId === medId && (!range || (o.scheduledAt >= range.from && o.scheduledAt <= range.to))
    );
  }

  findByDateRange(range: { from: Instant; to: Instant }): DoseOccurrence[] {
    return this.readAll().filter(o => o.scheduledAt >= range.from && o.scheduledAt <= range.to);
  }

  update(occ: DoseOccurrence): void {
    const all = this.readAll();
    const idx = all.findIndex(o => o.id === occ.id);
    if (idx < 0) {
      console.error(`DoseOccurrenceRepository.update: occurrence با id="${occ.id}" پیدا نشد — نادیده گرفته شد.`);
      return;
    }
    const next = [...all];
    next[idx] = occ;
    this.writeAll(next);
  }

  pruneOlderThan(
    thresholdInstant: Instant,
    resolveMedication: (medicationId: string) => { name: string; form: MedicationForm; dose: string; familyMemberId: string } | undefined
  ): DoseHistoryRecord[] {
    const all = this.readAll();
    const candidates = all.filter(o => TERMINAL_STATUSES.includes(o.status) && o.scheduledAt < thresholdInstant);
    if (candidates.length === 0) return [];

    const newHistoryRecords: DoseHistoryRecord[] = [];
    const prunedIds = new Set<OccurrenceId>();

    for (const occ of candidates) {
      const med = resolveMedication(occ.medicationId);
      if (!med) continue; // دارو پیدا نشد — این دور prune نمی‌شه، برای دور بعد می‌مونه

      newHistoryRecords.push({
        id: `hist_${occ.id}`,
        occurrenceId: occ.id,
        medicationId: occ.medicationId,
        medName: med.name,
        medForm: med.form,
        medDose: med.dose,
        slotId: occ.slotId,
        scheduledAt: occ.scheduledAt,
        resolvedAt: occ.resolvedAt,
        status: occ.status,
        statusReason: occ.statusReason as SkipReason | undefined,
        familyMemberId: med.familyMemberId,
        legacy: false
      });
      prunedIds.add(occ.id);
    }

    if (newHistoryRecords.length === 0) return [];

    const remaining = all.filter(o => !prunedIds.has(o.id));
    this.writeAll(remaining);

    const existingHistory = this.persistence.readAll<DoseHistoryRecord>(HISTORY_COLLECTION);
    this.persistence.writeAll(HISTORY_COLLECTION, [...existingHistory, ...newHistoryRecords]);

    return newHistoryRecords;
  }
}
