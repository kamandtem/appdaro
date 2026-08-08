// پیاده‌سازی واقعی و عمومی TimeZoneConverter (DESIGN.md بخش ۹) — حفره‌ای که
// در تیکه ۲ عمداً باز گذاشته شده بود («پیاده‌سازی واقعی و عمومی... هنوز
// ساخته نشده» — HANDOFF.md، بخش تیکه ۲) و طبق یادداشت پایان تیکه ۵
// («از تیکه ۶ به بعد، این حفره واقعاً مسدودکننده می‌شه») همین‌جا، قبل از
// Occurrence Generator، پر می‌شود — چون بدون این پیاده‌سازی، SchedulingEngine
// فقط با FixedOffsetTimeZoneConverter تستی کار می‌کند و روی device واقعی
// (که ممکن است کاربرش در تایم‌زونی با DST واقعی باشد — DESIGN.md بخش ۱۶:
// «کاربران خانواده یا نسخه‌های آینده‌ی اپ می‌توانند در تایم‌زون‌های دیگر
// باشند») نتیجه‌ی غلط می‌دهد.
//
// از `date-fns-tz` استفاده می‌کنیم (دقیقاً همان کتابخانه‌ای که DESIGN.md بخش
// ۲ به‌عنوان مثال پیشنهاد داده: «از طریق یک کتابخانه‌ی timezone-aware (مثل
// Temporal polyfill یا date-fns-tz)») چون یک wrapper نازک روی دیتابیس IANA
// خودِ Intl انجین (V8/Node) است — بدون نیاز به دیتابیس تایم‌زون جدا و بدون
// فرض هیچ آفست ثابتی، بر خلاف FixedOffsetTimeZoneConverter تیکه ۲ که صراحتاً
// «فقط برای تست» مستند شده بود.

import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { Instant } from '../types';
import { LocalDateTime, TimeZoneConverter } from '../domain/shared/TimeZoneConverter';

function pad(n: number, width = 2): string {
  return String(Math.trunc(n)).padStart(width, '0');
}

/**
 * پیاده‌سازی واقعی `TimeZoneConverter` (بخش ۹) — تنها پیاده‌سازی‌ای که مجاز
 * است در مسیر production استفاده شود. بر خلاف `FixedOffsetTimeZoneConverter`
 * (که فقط آفست ثابت را می‌شناسد)، این کلاس دیتابیس واقعی IANA را می‌خواند —
 * یعنی DST هر تایم‌زون را، در همان لحظه‌ی تقویمی مشخص، درست حساب می‌کند
 * (DESIGN.md بخش ۱۶ - «DST»: «۸ ساعت بعد از نظر ساعت دیواری، در گذر از مرز
 * DST همیشه برابر ۸×۳۶۰۰۰۰۰۰ میلی‌ثانیه بعد در UTC نیست»).
 */
export class IanaTimeZoneConverter implements TimeZoneConverter {
  /**
   * `local` را به‌صورت یک رشته‌ی ISO **بدون** پسوند offset/Z می‌سازیم و به
   * `date-fns-tz` با `timeZone` صریح می‌دهیم (نه با ساختن `new Date(y, m, d,
   * h, min)` خام و خواندنش با getterهای محلی) — تا نتیجه کاملاً مستقل از
   * تایم‌زون سیستمِ اجراکننده (host) بماند؛ همان استقلالی که DESIGN.md بخش ۹
   * برای کل Adapter Layer می‌خواهد.
   */
  toInstant(local: LocalDateTime, timezoneId: string): Instant {
    const iso = `${pad(local.year, 4)}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}:00`;
    return fromZonedTime(iso, timezoneId).getTime();
  }

  /**
   * `toZonedTime` مقدار برگشتی را طوری می‌سازد که getterهای *محلی* آن
   * (`getFullYear`/`getHours`/...) ساعت دیواری معادل در `timezoneId` را
   * نشان بدهند (نه getterهای UTC) — طبق مستندات و پیاده‌سازی خودِ
   * `date-fns-tz`؛ اینجا هم دقیقاً همان getterها خوانده می‌شوند.
   */
  toLocal(instant: Instant, timezoneId: string): LocalDateTime {
    const zoned = toZonedTime(instant, timezoneId);
    return {
      year: zoned.getFullYear(),
      month: zoned.getMonth() + 1,
      day: zoned.getDate(),
      hour: zoned.getHours(),
      minute: zoned.getMinutes()
    };
  }
}
