// PersistenceAdapter (DESIGN.md بخش ۹) — تنها لایه‌ای که واقعاً می‌دونه
// داده کجا ذخیره می‌شه (امروز localStorage؛ فردا IndexedDB یا
// @capacitor-community/sqlite). Repository Layer (src/repository/) فقط این
// interface رو می‌بینه، نه خودِ storage API رو — دقیقاً همون جداسازی‌ای که
// بخش ۸ می‌گه: «Domain/Application هیچ‌وقت مستقیماً localStorage یا فرمت
// JSON را نمی‌بینند».
//
// شکل امروزِ storageService.ts (یک کلید واحد `darooto_app_state_v1` که کل
// AppState توش JSON.stringify می‌شه) دقیقاً همون مشکلیه که بخش ۸ اشاره کرده:
// با اضافه‌شدن occurrenceهای روزانه، حجم و دفعات نوشتن این یک کلید غول‌پیکر
// رشد می‌کنه. این adapter به‌جاش هر «مجموعه» (collection) رو زیر کلید خودش
// نگه می‌داره — یک قدم به سمت جداسازی، بدون این‌که هنوز نیاز به یک storage
// engine واقعاً متفاوت (IndexedDB/SQLite) باشه؛ همون تعویض هم بعداً فقط پشت
// همین interface اتفاق می‌افته، بدون تغییر در Repository/Domain.
//
// توجه: این فایل عمداً به storageService.ts فعلی دست نمی‌زنه — طبق فاز ۱
// («shadow mode»)، این مسیر جدید کنار مسیر قدیمی زندگی می‌کنه، جایگزینش
// نمی‌شه، تا تیکه‌های وصل‌کردن به UI (۸ و ۱۳).

export interface PersistenceAdapter {
  /** کل یک collection رو می‌خونه. اگه چیزی ذخیره نشده یا داده خراب/نامعتبره،
   *  آرایه‌ی خالی برمی‌گردونه — هرگز throw نمی‌کنه (همون رفتار defensive
   *  که خودِ storageService.ts امروز هم داره). */
  readAll<T>(collection: string): T[];
  /** کل یک collection رو بازنویسی می‌کنه (نه append — جایگزینی کامل). */
  writeAll<T>(collection: string, items: T[]): void;
}

/** زیرمجموعه‌ی مینیمال Web Storage API که واقعاً لازم داریم — عمداً به‌جای
 *  خودِ تایپ `Storage` (که نیاز به DOM lib داره) این رو تعریف کردیم تا این
 *  فایل بدون `lib: ["dom"]` هم قابل type-check و قابل تست با یک fake
 *  درون‌حافظه‌ای (پایین) باشه. `window.localStorage` واقعی به‌صورت
 *  ساختاری (structural typing) همین شکل رو داره، پس بدون تبدیل اضافه جواب
 *  می‌ده. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY_PREFIX = 'darooto_repo_v1:';

export class LocalStoragePersistenceAdapter implements PersistenceAdapter {
  constructor(private readonly storage: KeyValueStorage) {}

  readAll<T>(collection: string): T[] {
    try {
      const raw = this.storage.getItem(KEY_PREFIX + collection);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (e) {
      console.error(`Failed to read collection "${collection}" from storage`, e);
      return [];
    }
  }

  writeAll<T>(collection: string, items: T[]): void {
    try {
      this.storage.setItem(KEY_PREFIX + collection, JSON.stringify(items));
    } catch (e) {
      console.error(`Failed to write collection "${collection}" to storage`, e);
    }
  }
}

/**
 * fake درون‌حافظه‌ای برای تست — همون قرارداد `KeyValueStorage` رو پیاده
 * می‌کنه، بدون نیاز به DOM/localStorage واقعی (که توی محیط تست Node وجود
 * نداره).
 */
export class InMemoryKeyValueStorage implements KeyValueStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}
