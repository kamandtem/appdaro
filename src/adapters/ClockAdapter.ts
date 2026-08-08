// ClockAdapter — بخش ۹ سند طراحی.
//
// تنها نقطه‌ی مجاز محاسبه‌ی «الان» و «تایم‌زون فعلی» در کل اپلیکیشن. هیچ‌جای
// دیگر کد نباید مستقیماً `new Date()` یا `Intl.DateTimeFormat().resolvedOptions()`
// را برای منطق دامنه صدا بزند — رفع ریشه‌ای باگ «نیمه‌شب» (بخش ۱۶): همه‌ی محاسبات
// «امروز چیست» از همین یک نقطه عبور می‌کنند، نه شش‌جای پراکنده.
//
// این ماژول *pure* نیست (چون به ساعت سیستم واقعی وابسته است)، ولی رابطش
// (interface) طوری طراحی شده که در تست واحد به‌سادگی mock/fake شود.

export interface ClockAdapter {
  /** لحظه‌ی فعلی، به‌صورت instant. */
  now(): Date;
  /** IANA timezone id فعلی دستگاه (مثلاً "Asia/Tehran"). */
  currentTimeZoneId(): string;
  /** تبدیل «ساعت دیواری محلی + timezone» به یک instant واقعی — طبق بخش ۱۶
   *  (DST) از طریق Intl انجام می‌شود، نه جمع‌کردن میلی‌ثانیه‌ی خام. */
  zonedTimeToInstant(localDate: { year: number; month: number; day: number; hour: number; minute: number }, timeZoneId: string): Date;
  /** استخراج تاریخ/ساعت محلی (بر اساس یک timezone مشخص) از یک instant —
   *  برای محاسبه‌ی «امروز چیست» در بازه‌ی گزارش روزانه (بخش ۱۶). */
  instantToZonedDate(instant: Date, timeZoneId: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number };
  /** کلید روز محلی به‌صورت "YYYY-MM-DD" — برای گروه‌بندی گزارش‌ها. */
  localDateKey(instant: Date, timeZoneId: string): string;
}

/** آفست UTC (به دقیقه) یک timezone در یک لحظه‌ی مشخص — از طریق Intl، پس با
 *  DST سازگار است (چون Intl خودش قوانین IANA tzdata را اعمال می‌کند). */
function tzOffsetMinutes(instant: Date, timeZoneId: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneId,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = dtf.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    parseInt(parts.year, 10), parseInt(parts.month, 10) - 1, parseInt(parts.day, 10),
    parseInt(parts.hour, 10), parseInt(parts.minute, 10), parseInt(parts.second, 10)
  );
  return (asUTC - instant.getTime()) / 60000;
}

export class SystemClockAdapter implements ClockAdapter {
  now(): Date {
    return new Date();
  }

  currentTimeZoneId(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }

  zonedTimeToInstant(local: { year: number; month: number; day: number; hour: number; minute: number }, timeZoneId: string): Date {
    // حدس اولیه با فرض UTC، بعد با آفست واقعی همون timezone در همون لحظه
    // تصحیح می‌شه — دو مرحله‌ای، چون آفست خودش تابع لحظه‌ست (به‌خاطر DST).
    const guessUTC = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
    const offsetAtGuess = tzOffsetMinutes(new Date(guessUTC), timeZoneId);
    let instant = new Date(guessUTC - offsetAtGuess * 60000);
    // یک بار دیگه با آفست واقعی instant محاسبه‌شده تصحیح می‌کنیم — برای مرزهای DST.
    const offsetAtInstant = tzOffsetMinutes(instant, timeZoneId);
    if (offsetAtInstant !== offsetAtGuess) {
      instant = new Date(guessUTC - offsetAtInstant * 60000);
    }
    return instant;
  }

  instantToZonedDate(instant: Date, timeZoneId: string) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZoneId,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    });
    const parts = dtf.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    const WEEKDAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      year: parseInt(parts.year, 10),
      month: parseInt(parts.month, 10),
      day: parseInt(parts.day, 10),
      hour: parseInt(parts.hour, 10),
      minute: parseInt(parts.minute, 10),
      weekday: WEEKDAY_MAP[parts.weekday] ?? 0
    };
  }

  localDateKey(instant: Date, timeZoneId: string): string {
    const d = this.instantToZonedDate(instant, timeZoneId);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
  }
}

/** singleton — بقیه‌ی ماژول‌ها این نمونه‌ی مشترک رو import می‌کنن، نه اینکه
 *  خودشون یکی جدید بسازن (تا در تست بشه به‌سادگی جایگزینش کرد). */
export const clockAdapter: ClockAdapter = new SystemClockAdapter();
