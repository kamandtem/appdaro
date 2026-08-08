// AppLifecycleAdapter (DESIGN.md بخش ۹) — انتزاع رویدادهای چرخه‌ی حیات اپ که
// Resolver Engine/Notification Engine بهشون گوش می‌دن (مثلاً برای sweepMissed
// یا ensureHorizon — DESIGN.md بخش ۱۶: «ریبوت گوشی» و «Force Stop»). Domain/
// Application هیچ importی از `@capacitor/app` ندارن، فقط این interface رو
// می‌گیرن — تا با یک fake قابل‌کنترل هم قابل تست باشن.

import { App as CapacitorApp } from '@capacitor/app';

export interface AppLifecycleAdapter {
  /** هر بار اپ از پس‌زمینه به پیش‌زمینه برمی‌گرده. */
  onResume(cb: () => void): () => void;
  /** بعد از boot شدن دستگاه، بدون نیاز به باز شدن دستی اپ (DESIGN.md بخش
   *  ۱۶ - «ریبوت گوشی»). نگاه کن به توضیح داخل CapacitorAppLifecycleAdapter
   *  برای محدودیت واقعی این متد امروز. */
  onBoot(cb: () => void): () => void;
}

/**
 * پیاده‌سازی واقعی برای اجرا روی device.
 *
 * `onResume` دقیقاً همون الگویی رو پیاده می‌کنه که همین امروز توی App.tsx
 * (خط ۱۱۷ به بعد) برای resume listener استفاده شده: dynamic import از
 * `@capacitor/app`، و catch امن اگه بیرون از شل native Capacitor اجرا بشه
 * (مثلاً پیش‌نمایش توی مرورگر ساده).
 *
 * `onBoot` **هنوز واقعاً به BOOT_COMPLETED وصل نیست**. طبق DESIGN.md بخش ۱۶:
 * «اندروید در ریبوت، تمام exact alarmهای زمان‌بندی‌شده را پاک می‌کند مگر اپ
 * صراحتاً یک BroadcastReceiver برای BOOT_COMPLETED... ثبت کرده باشد» — این
 * یک تغییر در لایه‌ی **native Android** (AndroidManifest.xml + یک
 * BroadcastReceiver واقعی به زبان Kotlin/Java، یا یک Capacitor plugin
 * سفارشی) است، نه چیزی که از سمت TypeScript قابل پیاده‌سازیه. این خارج از
 * حیطه‌ی این تیکه (و اصلاً خارج از حیطه‌ی کل این سند طراحی، طبق بخش ۱۵: «این
 * یک محدودیت سطح OS است») است.
 *
 * برای این‌که Resolver/Notification Engine همین الان بتونن بدون بلاک‌شدن روی
 * این کار ناقص native پیش برن، `onBoot` یک قلاب (hook) آماده برمی‌گردونه که:
 * اگه یک bridge بومی در آینده یک CustomEvent با نام `daroto:boot` روی
 * `document` منتشر کنه (رایج‌ترین الگوی پل‌زدن یک Capacitor plugin سفارشی به
 * جاوااسکریپت)، این listener بلافاصله فعالش می‌کنه — بدون این‌که فعلاً هیچ
 * تضمینی بده که این رویداد واقعاً fire می‌شه. مسئولیت باقی‌مونده (نوشتن خود
 * plugin/receiver بومی) باید در یک تیکه‌ی جدا و با دسترسی به کد Android
 * انجام بشه.
 */
export class CapacitorAppLifecycleAdapter implements AppLifecycleAdapter {
  onResume(cb: () => void): () => void {
    let removeListener: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const handle = await CapacitorApp.addListener('resume', cb);
        if (cancelled) {
          handle.remove();
        } else {
          removeListener = () => handle.remove();
        }
      } catch (e) {
        // بیرون از شل native Capacitor (مثلاً پیش‌نمایش مرورگری) — بی‌خطر
        // نادیده گرفته می‌شه، دقیقاً مثل الگوی موجود در App.tsx.
        console.warn('Capacitor app resume listener unavailable:', e);
      }
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }

  onBoot(cb: () => void): () => void {
    // این کلاس فقط توی محیط WebView/مرورگر (جایی که `document` وجود داره)
    // اجرا می‌شه؛ این گارد صرفاً جلوی throw شدن رو توی محیط‌هایی که DOM
    // نیست (مثل تست‌های Node) می‌گیره — نه یک مسیر واقعی production.
    if (typeof document === 'undefined') {
      return () => {};
    }
    const handler = () => cb();
    document.addEventListener('daroto:boot', handler);
    return () => document.removeEventListener('daroto:boot', handler);
  }
}

/**
 * پیاده‌سازی تستی — کاملاً manual-trigger، برای تست‌های Resolver/Notification
 * Engine بدون نیاز به شبیه‌سازی واقعی Capacitor یا DOM events.
 */
export class FakeAppLifecycleAdapter implements AppLifecycleAdapter {
  private resumeListeners: Set<() => void> = new Set();
  private bootListeners: Set<() => void> = new Set();

  onResume(cb: () => void): () => void {
    this.resumeListeners.add(cb);
    return () => this.resumeListeners.delete(cb);
  }

  onBoot(cb: () => void): () => void {
    this.bootListeners.add(cb);
    return () => this.bootListeners.delete(cb);
  }

  /** برای تست: شبیه‌سازی resume شدن اپ. */
  triggerResume(): void {
    for (const cb of this.resumeListeners) cb();
  }

  /** برای تست: شبیه‌سازی boot شدن دستگاه. */
  triggerBoot(): void {
    for (const cb of this.bootListeners) cb();
  }
}
