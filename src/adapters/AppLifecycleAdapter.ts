// AppLifecycleAdapter — بخش ۹ سند طراحی + بخش ۱۶ (ریبوت گوشی).
//
// لایه‌ی نازک روی @capacitor/app برای رویداد resume. ثبت واقعیِ یک
// BroadcastReceiver برای BOOT_COMPLETED در لایه‌ی native (اندروید) خارج از
// حیطه‌ی این پروژه‌ی TypeScript است (نیازمند کد Kotlin/Manifest جداگانه —
// بخش ۱۶: «طراحی نیازمند این است که AppLifecycleAdapter.onBoot به یک boot
// receiver واقعی در لایه‌ی native وصل شود»)؛ اینجا فقط قلاب (hook) سمت
// JS/TS آماده است تا وقتی آن بخش native اضافه شد، بلافاصله wire شود.

import { App as CapacitorApp } from '@capacitor/app';

export interface AppLifecycleAdapter {
  onResume(cb: () => void): Promise<() => void>;
  /** Placeholder برای اتصال به BOOT_COMPLETED واقعی (بخش ۱۶) — امروز فقط
   *  resume را پوشش می‌دهد؛ مستندسازی صریح این محدودیت به‌جای فرض ضمنی. */
  onBoot(cb: () => void): Promise<() => void>;
}

export class CapacitorAppLifecycleAdapter implements AppLifecycleAdapter {
  async onResume(cb: () => void): Promise<() => void> {
    try {
      const handle = await CapacitorApp.addListener('resume', cb);
      return () => handle.remove();
    } catch (e) {
      console.warn('Capacitor app resume listener unavailable:', e);
      return () => {};
    }
  }

  async onBoot(_cb: () => void): Promise<() => void> {
    // نیازمند BroadcastReceiver نیتیو (خارج از این لایه — بخش ۱۶). فعلاً
    // no-op مستند، نه پیاده‌سازی جعلی.
    return () => {};
  }
}

export const appLifecycleAdapter: AppLifecycleAdapter = new CapacitorAppLifecycleAdapter();
