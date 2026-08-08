// ClockAdapter (DESIGN.md بخش ۹) — تنها نقطه‌ای که «الان چه ساعتیه» و «کاربر
// توی کدوم تایم‌زونه» رو از دنیای واقعی می‌خونه. Domain Engines (Scheduling/
// Rule/Reminder/Resolver) هیچ‌کدوم مستقیماً `new Date()`/`Intl.*` صدا نمی‌زنن؛
// این adapter رو به‌عنوان dependency تزریق‌شده می‌گیرن — دقیقاً همون چیزی که
// امروز چون `new Date()` توی ۶ فایل پراکنده صدا زده می‌شه، ممکن نیست
// (DESIGN.md بخش ۹: «کاملاً unit-testable با زمان جعلی»).

import { Instant } from '../types';

export interface ClockAdapter {
  now(): Instant;
  /** IANA، مثل 'Asia/Tehran' — برای تشخیص تغییر تایم‌زون (DESIGN.md بخش ۱۶). */
  currentTimeZoneId(): string;
  /** cb هر بار که currentTimeZoneId() نسبت به آخرین مقدار شناخته‌شده عوض بشه
   *  صدا زده می‌شه. خروجی تابع، خودش unsubscribe است. */
  onTimeZoneChange(cb: () => void): () => void;
}

/** خواندن IANA timezone فعلی از خود مرورگر/WebView — استاندارد Intl، روی
 *  Capacitor WebView هم کار می‌کنه (نیازی به پلاگین جدا نیست). به‌صورت یک
 *  تابع مستقل export شده تا در تست بشه جایگزینش کرد (زیر را ببین). */
export function readDeviceTimeZoneId(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * پیاده‌سازی واقعی، برای اجرا روی device. چون نه مرورگر و نه Capacitor
 * event ندارن برای «تایم‌زون عوض شد» (بر خلاف مثلاً 'resume')، با یک
 * polling ملایم (پیش‌فرض هر ۶۰ ثانیه، فقط وقتی حداقل یک listener ثبت شده)
 * تشخیصش می‌دیم — این دقیقاً همون رویکردیه که DESIGN.md بخش ۱۶ برای این edge
 * case پیشنهاد داده: «وقتی تشخیص دهد timezone فعلی دستگاه با آخرین مقدار
 * شناخته‌شده فرق دارد».
 */
export class DeviceClockAdapter implements ClockAdapter {
  private lastKnownTimeZoneId: string;
  private listeners: Set<() => void> = new Set();
  private pollHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly pollIntervalMs: number = 60_000,
    private readonly getTimeZoneId: () => string = readDeviceTimeZoneId
  ) {
    this.lastKnownTimeZoneId = this.getTimeZoneId();
  }

  now(): Instant {
    return Date.now();
  }

  currentTimeZoneId(): string {
    return this.getTimeZoneId();
  }

  onTimeZoneChange(cb: () => void): () => void {
    this.listeners.add(cb);
    if (this.listeners.size === 1) {
      this.startPolling();
    }
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) {
        this.stopPolling();
      }
    };
  }

  private startPolling(): void {
    this.pollHandle = setInterval(() => {
      const current = this.getTimeZoneId();
      if (current !== this.lastKnownTimeZoneId) {
        this.lastKnownTimeZoneId = current;
        for (const cb of this.listeners) cb();
      }
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollHandle !== undefined) {
      clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
  }
}

/**
 * پیاده‌سازی تستی: زمان و تایم‌زون کاملاً کنترل‌شده توسط تست — «freeze/travel»
 * دقیقاً طبق تعریف بخش ۹. هیچ تایمر واقعی‌ای اجرا نمی‌شه؛ تغییر تایم‌زون فقط
 * وقتی listenerها صدا زده می‌شن که تست صراحتاً `setTimeZoneId` رو صدا بزنه.
 */
export class FakeClockAdapter implements ClockAdapter {
  private instant: Instant;
  private timeZoneId: string;
  private listeners: Set<() => void> = new Set();

  constructor(initialInstant: Instant, initialTimeZoneId: string) {
    this.instant = initialInstant;
    this.timeZoneId = initialTimeZoneId;
  }

  now(): Instant {
    return this.instant;
  }

  currentTimeZoneId(): string {
    return this.timeZoneId;
  }

  onTimeZoneChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** پرش زمان به یک لحظه‌ی مطلق مشخص — بدون اینکه خودش هیچ رویدادی رو صدا بزنه. */
  travelTo(instant: Instant): void {
    this.instant = instant;
  }

  /** تغییر تایم‌زون شبیه‌سازی‌شده — همه‌ی listenerهای ثبت‌شده رو صدا می‌زنه،
   *  دقیقاً مثل چیزی که DeviceClockAdapter واقعی بعد از تشخیص polling انجام
   *  می‌ده. */
  setTimeZoneId(timeZoneId: string): void {
    if (timeZoneId === this.timeZoneId) return;
    this.timeZoneId = timeZoneId;
    for (const cb of this.listeners) cb();
  }
}
