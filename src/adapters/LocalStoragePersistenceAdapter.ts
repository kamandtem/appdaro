// LocalStoragePersistenceAdapter — بخش ۹ سند طراحی.
//
// تنها نقطه‌ای که مستقیماً با window.localStorage کار می‌کند. Repository Layer
// (src/repository) از این آداپتر استفاده می‌کند، نه اینکه خودش localStorage.getItem
// صدا بزند — تا اگر روزی backend/SQLite جایگزین شد، فقط همین یک فایل عوض شود.

export interface PersistenceAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalStoragePersistenceAdapter implements PersistenceAdapter {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.error(`LocalStoragePersistenceAdapter.getItem(${key}) failed`, e);
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error(`LocalStoragePersistenceAdapter.setItem(${key}) failed`, e);
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error(`LocalStoragePersistenceAdapter.removeItem(${key}) failed`, e);
    }
  }
}

export const persistenceAdapter: PersistenceAdapter = new LocalStoragePersistenceAdapter();

export const STORAGE_KEY = 'darooto_app_state_v1';
/** پشتیبان خودکار قبل از اجرای اسکریپت مهاجرت (بخش ۱۵ - ریسک‌ها: مهاجرت
 *  داده‌ی کاربران فعلی). */
export const STORAGE_BACKUP_KEY = 'darooto_app_state_v1_pre_migration_backup';
