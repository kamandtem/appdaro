// اینترفیس تبدیل «ساعت محلی + IANA timezone» ↔ «لحظه‌ی مطلق (Instant)».
//
// DESIGN.md بخش ۲ صراحتاً می‌گوید: «Scheduling Engine هرگز با
// Date.getHours()/toISOString() خام کار نمی‌کند... این جداسازی باعث می‌شود
// منطق DST/تغییر تایم‌زون فقط در یک نقطه پیاده شود، نه در ۶ فایل مختلف».
// این فایل همان «یک نقطه» را به‌صورت یک interface تعریف می‌کند تا
// SchedulingEngine (بخش ۲) بتواند آن را به‌عنوان dependency تزریق‌شده بگیرد و
// خودش هیچ importی از کتابخانه‌ی تایم‌زون یا از `@capacitor/*` نداشته باشد
// (قانون سخت بخش ۱۲ - Dependency Graph).
//
// پیاده‌سازی واقعی (با یک کتابخانه‌ی timezone-aware واقعی مثل date-fns-tz یا
// Temporal polyfill) بخشی از Adapter Layer است و در تیکه‌ی بعدی (فاز ۱،
// DESIGN.md بخش ۹) ساخته می‌شود — همان‌جا که ClockAdapter/AppLifecycleAdapter
// هم ساخته می‌شوند. اینجا (تیکه‌ی ۲) فقط قرارداد (interface) + یک پیاده‌سازی
// آزمایشی برای تست واحد تعریف می‌شود؛ تعریف این interface الان لازم بود چون
// بدون آن SchedulingEngine اصلاً قابل type-check یا تست نیست.

import { Instant } from '../../types';
import { LocalDate } from './calendar';

export interface LocalDateTime extends LocalDate {
  hour: number;
  minute: number;
}

export interface TimeZoneConverter {
  /** لحظه‌ی مطلق معادلِ یک «ساعت دیواری» در یک تایم‌زون IANA مشخص. مسئول
   *  رعایت DST همان تایم‌زون در آن لحظه‌ی تقویمی خاص است — نه جمع‌کردن
   *  میلی‌ثانیه‌ی خام (DESIGN.md بخش ۱۶ - «DST»). */
  toInstant(local: LocalDateTime, timezoneId: string): Instant;

  /** ساعت دیواری + تاریخ محلی معادلِ یک لحظه‌ی مطلق، در یک تایم‌زون IANA
   *  مشخص — عکس toInstant. */
  toLocal(instant: Instant, timezoneId: string): LocalDateTime;
}

/**
 * پیاده‌سازی آزمایشی/تستی: فرض می‌کند تایم‌زون داده‌شده یک آفست ثابت نسبت به
 * UTC دارد (بدون DST) — دقیقاً وضعیت فعلی ایران («ایران از سال ۱۴۰۱ (۲۰۲۲)
 * رسماً DST را لغو کرده»، DESIGN.md بخش ۱۶). این پیاده‌سازی **فقط برای تست
 * واحد در همین تیکه** است؛ نباید در مسیر production استفاده شود — چون برای
 * تایم‌زون‌هایی که واقعاً DST دارند (مثلاً اعضای خانواده در تایم‌زون دیگر،
 * DESIGN.md بخش ۱۶) نتیجه‌ی غلط می‌دهد. پیاده‌سازی واقعی و کلی (با کتابخانه‌ی
 * IANA واقعی) در Adapter Layer (تیکه‌ی بعدی) جایگزین می‌شود.
 */
export class FixedOffsetTimeZoneConverter implements TimeZoneConverter {
  /** آفست بر حسب دقیقه نسبت به UTC — مثلاً ایران: ۲۱۰+ (UTC+03:30). */
  constructor(private readonly offsetMinutes: number) {}

  toInstant(local: LocalDateTime, _timezoneId: string): Instant {
    const utcMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0, 0);
    return utcMs - this.offsetMinutes * 60 * 1000;
  }

  toLocal(instant: Instant, _timezoneId: string): LocalDateTime {
    const shifted = new Date(instant + this.offsetMinutes * 60 * 1000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes()
    };
  }
}
