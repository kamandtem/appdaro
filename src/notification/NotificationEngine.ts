// NotificationEngine — بخش ۶ سند طراحی.
//
// تفاوت کلیدی با روش قدیمی (notificationService.ts): به‌جای cancel-all +
// reschedule-everything با شناسه‌ی حدسی hash(medId+slot+kind)، هر occurrence
// شناسه‌های نوتیفیکیشن واقعی خودش را در notificationIds نگه می‌دارد.
// syncOccurrence دقیقاً diff می‌کند: چه چیزی باید وجود داشته باشد در برابر
// چه چیزی الان زمان‌بندی شده — فقط تفاوت را cancel/schedule می‌کند (بخش ۱۶ -
// چند Notification). با resolve شدن occurrence، cancelRemaining دقیقاً همان
// idهای ذخیره‌شده را کنسل می‌کند.

import { DoseOccurrence, Medication, ReminderKind } from '../types';
import { NotificationAdapter, NotificationPermissionStatus, ScheduledNotificationSpec } from '../adapters/CapacitorNotificationAdapter';
import { REMINDER_LABEL } from '../domain/reminders/ReminderEngine';

/** تولیدکننده‌ی id عددی یکتا برای هر نوتیفیکیشن native — به‌جای هش رشته‌ای
 *  حدسی (که ریسک برخورد نظری داشت)، هر بار یک عدد ۳۱-بیتی تصادفی می‌سازیم و
 *  همان را روی خود occurrence ذخیره می‌کنیم؛ پس دیگر نیازی به بازسازی/حدس
 *  همان id در آینده نیست — همیشه از داده‌ی ذخیره‌شده خوانده می‌شود. */
function freshNotificationId(): number {
  return Math.floor(Math.random() * 2147483646) + 1;
}

interface PlannedNotification {
  kind: ReminderKind | 'main';
  at: Date;
}

export function plannedNotificationsFor(occurrence: DoseOccurrence, now: Date): PlannedNotification[] {
  if (occurrence.status !== 'pending') return [];
  const planned: PlannedNotification[] = [];
  const scheduledAt = new Date(occurrence.scheduledAt);
  if (scheduledAt.getTime() > now.getTime()) {
    planned.push({ kind: 'main', at: scheduledAt });
  }
  occurrence.reminderPlan.entries.forEach(entry => {
    const at = new Date(entry.at);
    if (at.getTime() > now.getTime()) {
      planned.push({ kind: entry.kind, at });
    }
  });
  return planned;
}

function bodyFor(kind: ReminderKind | 'main', med: Medication): string {
  if (kind === 'main') return `وقت مصرف ${med.name} فرا رسیده — ${med.dose}`;
  if (kind === 'deadline') return `آخرین فرصت مصرف ${med.name} — بعد از این ممکنه دیر بشه`;
  return `هنوز ${med.name} رو مصرف نکردی — ${med.dose}`;
}

function titleFor(kind: ReminderKind | 'main'): string {
  if (kind === 'main') return '💊 یادآور داروتو';
  return `💊 داروتو — ${REMINDER_LABEL[kind as ReminderKind]}`;
}

export class NotificationEngine {
  constructor(private adapter: NotificationAdapter) {}

  /** occurrence را با آنچه واقعاً باید زمان‌بندی‌شده باشد diff می‌کند و فقط
   *  تفاوت را cancel/schedule می‌کند. یک occurrence به‌روزشده (با
   *  notificationIds جدید) برمی‌گرداند. */
  async syncOccurrence(occurrence: DoseOccurrence, med: Medication, now: Date): Promise<DoseOccurrence> {
    const planned = plannedNotificationsFor(occurrence, now);

    if (planned.length === 0) {
      if (occurrence.notificationIds.length > 0) {
        await this.adapter.cancel(occurrence.notificationIds);
      }
      return { ...occurrence, notificationIds: [] };
    }

    // ساده‌ترین diff درست: همه‌ی idهای قدیمی این occurrence را کنسل کن، بعد
    // دقیقاً همان تعداد لازم را با id تازه schedule کن. چون idها به‌ازای هر
    // occurrence جداگانه‌اند (نه global hash)، این کار روی بقیه‌ی occurrenceها
    // هیچ اثری ندارد — امن و ساده‌تر از diff عنصر‌به‌عنصر، با همان نتیجه‌ی نهایی.
    if (occurrence.notificationIds.length > 0) {
      await this.adapter.cancel(occurrence.notificationIds);
    }

    const specs: ScheduledNotificationSpec[] = planned.map(p => ({
      id: freshNotificationId(),
      title: titleFor(p.kind),
      body: bodyFor(p.kind, med),
      at: p.at,
      extra: { occurrenceId: occurrence.id, medId: med.id, kind: p.kind }
    }));

    const result = await this.adapter.schedule(specs);
    if (!result.ok) {
      // قبلاً اینجا صرفاً نادیده گرفته می‌شد و occurrence با notificationIds
      // «موفق» برمی‌گشت — یعنی از دید بقیه‌ی برنامه انگار نوتیفیکیشن واقعاً
      // زمان‌بندی شده بود، درحالی‌که هیچ‌چیزی روی گوشی ثبت نشده بود. حالا در
      // این حالت notificationIds خالی می‌ماند تا دفعه‌ی بعد sync دوباره تلاش کند.
      console.error(`[Notifications] زمان‌بندی برای occurrence ${occurrence.id} شکست خورد:`, result.error);
      return { ...occurrence, notificationIds: [] };
    }
    return { ...occurrence, notificationIds: specs.map(s => s.id) };
  }

  /** با resolve شدن occurrence (taken/skipped/missed)، دقیقاً idهای ذخیره‌شده
   *  را کنسل می‌کند — نه batch cancel-all. */
  async cancelRemaining(occurrence: DoseOccurrence): Promise<DoseOccurrence> {
    if (occurrence.notificationIds.length === 0) return occurrence;
    await this.adapter.cancel(occurrence.notificationIds);
    return { ...occurrence, notificationIds: [] };
  }

  async requestPermissions(): Promise<NotificationPermissionStatus> {
    return this.adapter.requestPermissions();
  }

  /** تست تشخیصی — یک نوتیفیکیشن واقعی ۵ ثانیه بعد زمان‌بندی می‌کند تا معلوم
   *  شود کل زنجیره (پلاگین → مجوز → schedule واقعی روی گوشی) کار می‌کند یا
   *  کجا شکست می‌خورد؛ منتظر رسیدن نوبت واقعی یک دارو نمی‌مانیم. */
  async sendTestNotification(): Promise<{ ok: boolean; error?: string }> {
    const id = freshNotificationId();
    return this.adapter.schedule([{
      id,
      title: '💊 تست نوتیفیکیشن داروتو',
      body: 'اگه اینو می‌بینی، زمان‌بندی نوتیفیکیشن روی گوشیت درست کار می‌کنه.',
      at: new Date(Date.now() + 5000)
    }]);
  }

  async addTapListener(onTap: (occurrenceId: string, medId: string) => void): Promise<(() => void) | undefined> {
    return this.adapter.addTapListener(extra => {
      const occurrenceId = extra.occurrenceId as string | undefined;
      const medId = extra.medId as string | undefined;
      if (medId) onTap(occurrenceId || '', medId);
    });
  }
}
