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
import { NotificationAdapter, NotificationPermissionStatus, ScheduledNotificationSpec, DOSE_ACTION_TYPE_ID } from '../adapters/CapacitorNotificationAdapter';
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

function deadlineTimeLabel(deadlineAt: string): string {
  const d = new Date(deadlineAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function bodyFor(kind: ReminderKind | 'main', med: Medication, occurrence: DoseOccurrence): string {
  // بدون خط‌فاصله قبل از مقدار دوز — روی خط جدا از عنوان نوشته می‌شود؛ چون
  // متن نوتیفیکیشن native ساده است (بدون HTML/CSS)، امکان قاب‌گرد و رنگی
  // دور خودِ رقم داخل نوتیفیکیشن واقعی سیستم‌عامل وجود ندارد — این نزدیک‌ترین
  // جایگزین است. تراز و قاب گرد شیری‌رنگ برای «۱ عدد» در بخش‌های داخل اپ
  // (کارت خانه، جزئیات دارو) که HTML واقعی رندر می‌شود همچنان اعمال می‌شود.
  if (kind === 'main') return `وقت مصرف ${med.name} فرا رسیده\n${med.dose}`;
  if (kind === 'deadline') return `آخرین فرصت مصرف ${med.name} — پایان زمان مصرف: ${deadlineTimeLabel(occurrence.deadlineAt)}`;
  // نوبتی که یک‌بار «بعداً» زده شده — یادآور بعدی هم پایان زمان مصرف را نشان
  // می‌دهد تا کاربر بداند تا کِی فرصت دارد.
  if (occurrence.snoozeCount > 0) {
    return `هنوز ${med.name} رو مصرف نکردی — پایان زمان مصرف: ${deadlineTimeLabel(occurrence.deadlineAt)}`;
  }
  return `هنوز ${med.name} رو مصرف نکردی — ${med.dose}`;
}

/** رنگ هر پله از نشانِ ایموجی رنگی جلوی عنوان استفاده می‌کند — چون دکمه‌ها و
 *  پس‌زمینه‌ی نوتیفیکیشن‌های native رنگ سفارشی/انیمیشن پشتیبانی نمی‌کنند
 *  (نه در اندروید نه در iOS، این‌ها کاملاً دست سیستم‌عامل‌اند)؛ این نزدیک‌ترین
 *  جایگزین واقعی برای «یادآور اول سبز / دوم زرد / آخر قرمز» است. */
function titleFor(kind: ReminderKind | 'main'): string {
  if (kind === 'main') return '💊 یادآور داروتو';
  if (kind === 'r1') return `🟢 داروتو — ${REMINDER_LABEL.r1}`;
  if (kind === 'r2') return `🟡 داروتو — ${REMINDER_LABEL.r2}`;
  return `🔴 داروتو — ${REMINDER_LABEL.deadline}`;
}

function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** متن «تأییدیه»ی آنی که بلافاصله بعد از زدن دکمه‌ی «بعداً» جای همان
 *  نوتیفیکیشن را (با همان id) می‌گیرد — پله‌ی بعدی بر اساس kind همان
 *  نوتیفیکیشنی است که «بعداً» رویش زده شده (main → r1 → r2 → deadline). */
export function snoozeConfirmationFor(kind: ReminderKind | 'main', occurrence: DoseOccurrence): { title: string; body: string } {
  const r2 = occurrence.reminderPlan.entries.find(e => e.kind === 'r2');
  const deadline = occurrence.reminderPlan.entries.find(e => e.kind === 'deadline');
  if (kind === 'main') {
    return { title: '🟡 باشه، یادآوری می‌کنیم', body: '۱۵ دقیقه دیگر این نوبت را یادآوری می‌کنیم.' };
  }
  if (kind === 'r1') {
    return { title: '⚪ باشه، یادآوری می‌کنیم', body: `این دارو را ساعت ${r2 ? hm(r2.at) : deadlineTimeLabel(occurrence.deadlineAt)} مجدد یادآوری می‌کنیم.` };
  }
  if (kind === 'r2') {
    return { title: '🟡 توجه', body: `آخرین یادآوری ساعت ${deadline ? hm(deadline.at) : deadlineTimeLabel(occurrence.deadlineAt)} است.` };
  }
  return { title: '🔴 آخرین فرصت', body: 'این آخرین زمان ممکن برای مصرف این نوبت داروست؛ اگر هم‌اکنون دارو مصرف نمی‌کنید، تا نوبت بعدی صبر کنید.' };
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
      body: bodyFor(p.kind, med, occurrence),
      at: p.at,
      actionTypeId: DOSE_ACTION_TYPE_ID,
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

  /** بلافاصله بعد از زدن دکمه‌ی «بعداً»، همان نوتیفیکیشن (همان id) را با متن
   *  تأییدیه‌ی پله‌ی بعد جایگزین می‌کند — بدون باز کردن اپ. چون id عوض
   *  نمی‌شود، سیستم‌عامل خودش انیمیشن جایگزینی محتوا را نشان می‌دهد (نزدیک‌ترین
   *  معادل واقعی به «انیمیشن رنگی» که سیستم‌عامل به برنامه‌ها اجازه‌ی
   *  سفارشی‌سازی‌اش را نمی‌دهد). بدون دکمه — چون صرفاً یک تأییدیه‌ی آنی است. */
  async flashSnoozeConfirmation(notifId: number, kind: ReminderKind | 'main', occurrence: DoseOccurrence, med: Medication): Promise<void> {
    const { title, body } = snoozeConfirmationFor(kind, occurrence);
    await this.adapter.schedule([{
      id: notifId,
      title,
      body,
      at: new Date(),
      extra: { occurrenceId: occurrence.id, medId: med.id, kind: 'snooze-confirmation' }
    }]);
  }

  /** بعد از «رد کردن»، یک نوتیفیکیشن مجزا و بی‌صدا برای «چرا مصرف نکردی؟»
   *  می‌فرستد. دلیل پیش‌فرض («زمان مصرف مناسب نبود») همان لحظه و بدون باز
   *  شدن اپ ثبت شده؛ اما چون دلیل‌های دیگر (عوارض/توصیه پزشک/تمام‌شدن دارو)
   *  خودِ دارو را کاملاً از چرخه یادآوری خارج می‌کنند — تصمیمی با اثر واقعی —
   *  عمداً به‌جای دکمه‌های مستقیم روی خودِ این نوتیفیکیشن (که با یک لمس اشتباه
   *  می‌توانست یک دارو را بی‌سروصدا غیرفعال کند)، لمسِ آن اپ را باز می‌کند و
   *  دقیقاً همان پنل «چرا این دارو را مصرف نکردید» را برای همین نوبت باز
   *  می‌کند تا انتخاب نهایی با تأیید آگاهانه‌ی خودِ کاربر ثبت شود. */
  async sendSkipFollowupPrompt(occurrence: DoseOccurrence, med: Medication): Promise<void> {
    await this.adapter.schedule([{
      id: freshNotificationId(),
      title: '❓ چرا این نوبت را مصرف نکردید؟',
      body: `${med.name} به‌عنوان «مصرف‌نشده» ثبت شد. برای مشخص کردن دلیل دقیق (اختیاری) روی این پیام بزنید.`,
      at: new Date(),
      extra: { occurrenceId: occurrence.id, medId: med.id, kind: 'skip-reason-prompt' }
    }]);
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

  async addTapListener(onTap: (occurrenceId: string, medId: string, actionId: string | undefined, kind: string | undefined, notifId: number) => void): Promise<(() => void) | undefined> {
    return this.adapter.addTapListener((extra, actionId, notifId) => {
      const occurrenceId = extra.occurrenceId as string | undefined;
      const medId = extra.medId as string | undefined;
      const kind = extra.kind as string | undefined;
      if (medId) onTap(occurrenceId || '', medId, actionId, kind, notifId);
    });
  }
}