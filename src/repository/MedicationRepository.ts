// MedicationRepository (DESIGN.md بخش ۸) — Domain/Application هیچ‌وقت
// مستقیماً از PersistenceAdapter یا فرمت JSON استفاده نمی‌کنن، فقط این
// interface رو می‌بینن.

import { MedicationAggregate, MedicationSchedule } from '../types';
import { PersistenceAdapter } from '../adapters/LocalStoragePersistenceAdapter';

export interface MedicationRepository {
  getAll(): MedicationAggregate[];
  getById(id: string): MedicationAggregate | null;
  /** نسخه‌ی schedule را خودش بالا می‌برد اگر schedule عوض شده (دقیقاً طبق
   *  امضای بخش ۸) — caller مسئول محاسبه‌ی scheduleVersion نیست. */
  save(med: MedicationAggregate): void;
  delete(id: string): void;
}

const COLLECTION = 'medications';

/** مقایسه‌ی ساختاری دو MedicationSchedule، با نادیده‌گرفتن خودِ
 *  scheduleVersion — چون این فیلد نتیجه‌ی مقایسه‌ست، نه بخشی از چیزی که
 *  مقایسه می‌شه. اگه هر چیز دیگه‌ای (frequencyType، slots، selectedWeekdays،
 *  ...) فرق کنه، یعنی schedule واقعاً عوض شده. */
function schedulesEqualIgnoringVersion(a: MedicationSchedule, b: MedicationSchedule): boolean {
  const { scheduleVersion: _a, ...aRest } = a;
  const { scheduleVersion: _b, ...bRest } = b;
  return JSON.stringify(aRest) === JSON.stringify(bRest);
}

export class LocalStorageMedicationRepository implements MedicationRepository {
  constructor(private readonly persistence: PersistenceAdapter) {}

  getAll(): MedicationAggregate[] {
    return this.persistence.readAll<MedicationAggregate>(COLLECTION);
  }

  getById(id: string): MedicationAggregate | null {
    return this.getAll().find(m => m.id === id) ?? null;
  }

  save(med: MedicationAggregate): void {
    const all = this.getAll();
    const idx = all.findIndex(m => m.id === med.id);
    const existing = idx >= 0 ? all[idx] : null;

    let toSave = med;
    if (existing) {
      // دارو از قبل وجود داره — منبع حقیقتِ scheduleVersion خودِ ماییم، نه
      // caller: اگه schedule واقعاً فرق کرده، نسخه رو یکی بالا می‌بریم؛ اگه
      // فرق نکرده، نسخه‌ی موجود رو حفظ می‌کنیم (حتی اگه caller یه چیز دیگه
      // پاس داده باشه) — تا دو ویرایش هم‌زمان و ناهماهنگ نتونن نسخه رو جلو
      // بندازن بدون این‌که schedule واقعاً عوض شده باشه.
      const changed = !schedulesEqualIgnoringVersion(existing.schedule, med.schedule);
      const nextVersion = changed ? existing.schedule.scheduleVersion + 1 : existing.schedule.scheduleVersion;
      toSave = { ...med, schedule: { ...med.schedule, scheduleVersion: nextVersion } };
    }
    // اگه existing نبود (دارو تازه‌ست)، هر scheduleVersion ای caller پاس داده
    // (باید ۱ باشه) دست‌نخورده می‌مونه — اولین نسخه رو خودِ caller تعیین می‌کنه.

    if (idx >= 0) {
      const next = [...all];
      next[idx] = toSave;
      this.persistence.writeAll(COLLECTION, next);
    } else {
      this.persistence.writeAll(COLLECTION, [...all, toSave]);
    }
  }

  delete(id: string): void {
    const all = this.getAll();
    this.persistence.writeAll(COLLECTION, all.filter(m => m.id !== id));
  }
}
