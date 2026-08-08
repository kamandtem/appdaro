// notificationService — بخش ۱۳ سند طراحی: «تفکیک به NotificationEngine (منطق)
// + CapacitorNotificationAdapter (پلاگین)». این فایل خودش دیگر منطقی ندارد —
// فقط facade نازکی است که App.tsx را با امضای جدید (بر اساس DoseOccurrence،
// نه Medication/DoseLog خام) صدا می‌زند، تا importهای App.tsx تغییر کمی کند.

import { DoseOccurrence, Medication } from '../types';
import { NotificationEngine, plannedNotificationsFor } from '../notification/NotificationEngine';
import { notificationAdapter, NotificationPermissionStatus } from '../adapters/CapacitorNotificationAdapter';
import { clockAdapter } from '../adapters/ClockAdapter';

const engine = new NotificationEngine(notificationAdapter);

/** حالا نتیجه‌ی واقعی مجوز را برمی‌گرداند — قبلاً void بود و هرچه پیش می‌آمد
 *  فقط توی کنسول گم می‌شد؛ App.tsx می‌تواند از این برای نمایش وضعیت به کاربر
 *  استفاده کند. */
export async function requestNotificationPermissions(): Promise<NotificationPermissionStatus> {
  return engine.requestPermissions();
}

export async function checkNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  return notificationAdapter.checkPermissionStatus();
}

/** برای دکمه‌ی «تست نوتیفیکیشن» در تنظیمات — یک نوتیفیکیشن واقعی ۵ ثانیه‌ی
 *  دیگر روی گوشی زمان‌بندی می‌کند و نتیجه‌ی واقعی (موفق/شکست + پیام خطا) را
 *  برمی‌گرداند تا در UI نمایش داده شود. */
export async function sendTestNotification(): Promise<{ ok: boolean; error?: string }> {
  return engine.sendTestNotification();
}

/**
 * فقط occurrenceهایی را sync می‌کند که واقعاً نیاز به تغییر نوتیفیکیشن دارند:
 * pendingهایی که هنوز هیچ نوتیفیکیشنی برایشان زمان‌بندی نشده ولی حداقل یک
 * یادآور آینده دارند، یا occurrenceهای resolve‌شده‌ای که هنوز idهای
 * cancel‌نشده دارند (شبکه‌ی ایمنی — مسیر عادی cancel مستقیماً در App.tsx
 * انجام می‌شود).
 *
 * چرا این شرط حیاتی است: NotificationEngine.syncOccurrence هر بار که صدا زده
 * شود، idهای native را کاملاً از نو (تصادفی) می‌سازد — یعنی برای یک occurrence
 * که از قبل notificationIds دارد و هیچ‌چیزش عوض نشده، صدا زدن دوباره‌ی sync
 * هم idهای قبلی را کنسل می‌کند و هم idهای متفاوت جدید برمی‌گرداند. اگر اینجا
 * فیلتر نشود، خروجی «updated» هرگز خالی نمی‌شود، App.tsx دوباره setState
 * می‌کند، effect دوباره با state.doseOccurrences تغییرکرده اجرا می‌شود، و
 * چرخه تا ابد ادامه پیدا می‌کند (حلقه‌ی بی‌نهایت reschedule/cancel واقعی —
 * نه فقط ناکارآمدی، بلکه خطر واقعی برخورد با سقف quota نوتیفیکیشن دقیق
 * اندروید که در بخش ۱۵ سند هم به‌عنوان ریسک ذکر شده).
 *
 * نکته‌ی ظریف که باید صریح گفته شود: شرط «notificationIds.length === 0» به
 * تنهایی برای تشخیص «کاری لازم نیست» کافی نیست. یک occurrence pending از
 * دارویی که از سیستم ددلاین/یادآور مستثناست (بخش ۲ - RuleEngine) وقتی
 * scheduledAt‌اش می‌گذرد، برای همیشه هیچ یادآور آینده‌ای ندارد (planned=[])
 * و sweepMissed هم عمداً آن را missed نمی‌کند (چون exempt است) — پس تا ابد
 * pending و notificationIds=[] می‌ماند. اگر فقط طول notificationIds چک شود،
 * این occurrence هر بار «نیازمند sync» تشخیص داده می‌شود، هر بار یک occurrence
 * تازه (با همان محتوا ولی reference جدید) برمی‌گردد، و همان حلقه‌ی بی‌نهایت
 * دوباره رخ می‌دهد — این‌بار مخصوص داروهای critical/تک‌دوزه. راه‌حل: قبل از
 * صدا زدن syncOccurrence، با همان تابع pure که خودِ Engine استفاده می‌کند
 * (plannedNotificationsFor) چک می‌کنیم که واقعاً چیزی برای زمان‌بندی هست یا
 * نه؛ اگر نه، اصلاً sync صدا زده نمی‌شود.
 */
export async function syncOccurrenceNotifications(
  occurrences: DoseOccurrence[],
  medications: Medication[]
): Promise<DoseOccurrence[]> {
  const medById = new Map(medications.map(m => [m.id, m]));
  const now = clockAdapter.now();
  const updated: DoseOccurrence[] = [];

  for (const occ of occurrences) {
    const med = medById.get(occ.medId);
    if (!med) continue;

    if (occ.status === 'pending') {
      if (occ.notificationIds.length > 0) continue; // از قبل زمان‌بندی شده — چیزی برای sync نیست
      if (plannedNotificationsFor(occ, now).length === 0) continue; // چیزی برای زمان‌بندی نیست (مثلاً دارویِ مستثنا که زمانش گذشته)
    } else {
      if (occ.notificationIds.length === 0) continue; // از قبل پاک‌سازی شده
    }

    const next = await engine.syncOccurrence(occ, med, now);
    updated.push(next);
  }

  return updated;
}

export async function cancelOccurrenceNotifications(occurrence: DoseOccurrence): Promise<DoseOccurrence> {
  return engine.cancelRemaining(occurrence);
}

export async function addNotificationTapListener(onTap: (occurrenceId: string, medId: string) => void): Promise<(() => void) | undefined> {
  return engine.addTapListener(onTap);
}
