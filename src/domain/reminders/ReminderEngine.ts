// Reminder Engine (DESIGN.md بخش ۵) — تابعی خالص که یک DoseOccurrence
// تازه‌ساخته‌شده (هنوز بدون reminderPlan) + یک ReminderPolicy (خروجی
// RuleEngine.reminderPolicyFor) می‌گیرد و ReminderPlan نهایی را می‌سازد —
// دقیقاً همان فرمول سه‌گانه‌ی امروز (computeEscalation در
// src/RuleEngine/ReminderEngine)، با این تفاوت بنیادی که این تابع فقط **یک‌بار،
// در لحظه‌ی تولید occurrence** صدا زده می‌شود، نه هر بار که UI/نوتیفیکیشن/
// missed-check دوباره با یک «الان» تازه محاسبه‌اش کنند (DESIGN.md بخش ۵ —
// «چرا منجمد در لحظه‌ی تولید مهم است»).
//
// این ماژول کاملاً خالص است: هیچ importی از Adapter Layer یا از
// `@capacitor/*` ندارد، فقط از RuleEngine (برای maxAllowedDelayHours)
// استفاده می‌کند — دقیقاً طبق جهت وابستگی یک‌طرفه‌ی بخش ۱۲.

import { Instant, ReminderKind, ReminderPlan, ReminderPolicy } from '../../types';
import { maxAllowedDelayHours } from '../rules/RuleEngine';

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/**
 * ReminderEngine.plan — دقیقاً امضای بخش ۵ سند.
 *
 * برای `'standard'`: چهار ورودی (dose_time, r1, r2, deadline) طبق فرمول
 * توافق‌شده‌ی امروز:
 *   dose_time.fireAt = scheduledAt
 *   r1.fireAt        = scheduledAt + 15min
 *   r2.fireAt         = scheduledAt + intervalHours/4
 *   deadline.fireAt   = scheduledAt + min(intervalHours/2, MAX_ALLOWED_DELAY_HOURS)
 *
 * برای `'exempt'`: فقط `dose_time` — بدون r1/r2/deadline (معادل دقیق
 * `isExemptFromDeadlineSystem` امروز، فقط منبع تصمیمش RuleEngine است، نه
 * سه‌جای پراکنده — DESIGN.md بخش ۵).
 */
export function plan(occurrence: { scheduledAt: Instant }, policy: ReminderPolicy): ReminderPlan {
  const { scheduledAt } = occurrence;

  if (policy.kind === 'exempt') {
    return { entries: [{ kind: 'dose_time', fireAt: scheduledAt }] };
  }

  const { intervalHours } = policy;
  const deadlineHours = Math.min(intervalHours / 2, maxAllowedDelayHours());

  return {
    entries: [
      { kind: 'dose_time', fireAt: scheduledAt },
      { kind: 'r1', fireAt: scheduledAt + 15 * MS_PER_MINUTE },
      { kind: 'r2', fireAt: scheduledAt + (intervalHours / 4) * MS_PER_HOUR },
      { kind: 'deadline', fireAt: scheduledAt + deadlineHours * MS_PER_HOUR }
    ]
  };
}

/** پله‌ی فعلی یادآوری یک occurrence — معادل دقیق `EscalationStep` قدیمی در
 *  `RuleEngine/ReminderEngine` (۰: هنوز وقتشه، ۱: بعد یادآور اول، ۲: بعد یادآور
 *  دوم، ۳: بعد ددلاین). */
export type EscalationStep = 0 | 1 | 2 | 3;

/**
 * پله‌ی فعلی یک `ReminderPlan` نسبت به «الان».
 *
 * **چرا اینجا و نه در HomeQueueService/UI:** DESIGN.md بخش ۱۷.۵ می‌گوید
 * نشانه‌ی وضعیت هر کارت «از همان escalation-step موجود گرفته می‌شود (بخش ۵ —
 * Reminder Engine)». این تابع صرفاً همان `plan` *منجمدشده* را می‌خواند و با
 * `now` مقایسه می‌کند — هیچ محاسبه‌ی تازه‌ای با یک «الان» جدید انجام نمی‌دهد
 * (همان چیزی که بخش ۵، «چرا منجمد در لحظه‌ی تولید مهم است»، بر آن تأکید
 * دارد). پس UI و Notification Engine هر دو به یک عدد واحد می‌رسند.
 *
 * معادل دقیق `getEscalationStepForSlot` قدیمی، از جمله در این نکته که
 * occurrenceهای exempt (پلانشان فقط `dose_time` دارد، بدون `deadline`) همیشه
 * پله‌ی ۰ می‌گیرند — چون فرمول ددلاین اصلاً رویشان اجرا نمی‌شود.
 */
export function escalationStepFor(reminderPlan: ReminderPlan, now: Instant): EscalationStep {
  const fireAtOf = (kind: ReminderKind): Instant | undefined =>
    reminderPlan.entries.find(e => e.kind === kind)?.fireAt;

  const deadline = fireAtOf('deadline');
  if (deadline === undefined) return 0;
  if (now >= deadline) return 3;

  const r2 = fireAtOf('r2');
  if (r2 !== undefined && now >= r2) return 2;

  const r1 = fireAtOf('r1');
  if (r1 !== undefined && now >= r1) return 1;

  return 0;
}
