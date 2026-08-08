// توابع خالص تقویمی — بدون I/O، بدون وابستگی به تایم‌زون دستگاه اجراکننده.
//
// نکته‌ی مهم: این فایل «تبدیل ساعت محلی یک کاربر در یک IANA timezone به یک
// instant مطلق» را انجام نمی‌دهد — آن مسئولیت TimeZoneConverter است
// (src/domain/shared/TimeZoneConverter.ts، DESIGN.md بخش ۲ و ۹). اینجا فقط
// محاسبات خالص روی خودِ اعداد تقویمی (سال/ماه/روز) است: چندمین روز هفته است،
// یک ماه چند روز دارد، و... این محاسبات با هر تایم‌زونی یکسانند — پس نیازی به
// تزریق adapter ندارند و RuleEngine می‌تواند مستقیم از این‌ها استفاده کند
// (DESIGN.md بخش ۷: «Rule Engine ... به هیچ‌کدام وابسته نیست»).
//
// برای جلوگیری از افتادن در دام آفست تایم‌زون میزبان (host)، همه‌جا از
// Date.UTC/getUTCDay/getUTCDate استفاده می‌کنیم — نه new Date(y,m,d) خام که
// به تایم‌زون سیستم اجراکننده وابسته است.

import { Weekday } from '../../types';

/** یک تاریخ تقویمی محض — بدون ساعت، بدون تایم‌زون. `month` بر پایه‌ی ۱ است
 *  (فروردین/ژانویه = ۱)، نه ۰-پایه‌ی جاوااسکریپت خام. */
export interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

/** ترتیب هفته‌ی فارسی مرسوم: شنبه اول هفته. این ترتیب کجای دیگری در پروژه‌ی
 *  فعلی صراحتاً تعریف نشده بود (چون selectedDays قدیمی هرگز واقعاً استفاده
 *  نمی‌شد — DESIGN.md بخش ۰)، پس اینجا برای اولین‌بار به‌عنوان قرارداد رسمی
 *  تثبیت می‌شود. */
const WEEKDAY_BY_JS_DAY: Weekday[] = [
  'یکشنبه',  // JS Date#getUTCDay() === 0
  'دوشنبه',  // 1
  'سه‌شنبه', // 2
  'چهارشنبه', // 3
  'پنجشنبه', // 4
  'جمعه',    // 5
  'شنبه'     // 6
];

/** روز هفته‌ی یک تاریخ تقویمی محض — نتیجه مستقل از تایم‌زون میزبان است، چون
 *  فقط از اعداد سال/ماه/روز (نه از ساعت) استفاده می‌کند. */
export function weekdayOf(date: LocalDate): Weekday {
  const jsDay = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return WEEKDAY_BY_JS_DAY[jsDay];
}

/** تعداد روزهای یک ماه مشخص (۱=فروردین/ژانویه ... ۱۲=اسفند/دسامبر)، با در
 *  نظر گرفتن سال کبیسه برای فوریه. مستقل از تایم‌زون میزبان. */
export function daysInMonth(year: number, month: number): number {
  // روز صفرِ ماه بعد == آخرین روز همین ماه (ترفند استاندارد Date، اما با UTC
  // تا به تایم‌زون میزبان وابسته نباشد).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** تاریخ تقویمی `delta` روز بعد (یا قبل، اگر منفی) از `date` — عبور خودکار
 *  از مرز ماه/سال را خودِ Date.UTC هندل می‌کند. */
export function addDays(date: LocalDate, delta: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** مقایسه‌ی دو تاریخ تقویمی: منفی اگر a زودتر از b، مثبت اگر دیرتر، صفر اگر
 *  برابر. برای مرتب‌سازی/حلقه‌زدن روی بازه‌ی تاریخ‌ها. */
export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** آیا دو تاریخ تقویمی دقیقاً یکی هستند. */
export function isSameLocalDate(a: LocalDate, b: LocalDate): boolean {
  return compareLocalDate(a, b) === 0;
}
