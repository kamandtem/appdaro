// ReminderEngine — بخش ۵ سند طراحی.
//
// دقیقاً همان فرمول توافق‌شده‌ی سه یادآوری (قبلاً در doseSchedule.ts پراکنده
// بود)، ولی خروجی‌اش حالا یک ReminderPlan «منجمد» (frozen) است: یک‌بار در
// لحظه‌ی تولید occurrence محاسبه می‌شود و از آن پس همه‌جا (UI/Notification)
// همان مقدار ذخیره‌شده را می‌خوانند — نه اینکه هرکدام دوباره از صفر حساب
// کنند (بخش ۱۶ - چرا «منجمد در لحظه‌ی تولید» مهم است / DST).

import { ReminderPlan, ReminderPlanEntry, ReminderKind } from '../../types';
import { MAX_ALLOWED_DELAY_HOURS } from '../rules/RuleEngine';

export interface DoseEscalation {
  reminder1Minutes: number;
  reminder2Minutes: number;
  deadlineMinutes: number;
}

export function computeEscalation(intervalHours: number): DoseEscalation {
  const deadlineHours = Math.min(intervalHours / 2, MAX_ALLOWED_DELAY_HOURS);
  return {
    reminder1Minutes: 15,
    reminder2Minutes: (intervalHours / 4) * 60,
    deadlineMinutes: deadlineHours * 60
  };
}

/** پلن یادآوری منجمد برای یک T0 مشخص. `exempt` یعنی دارو از کل سیستم
 *  ددلاین/یادآوری سه‌گانه مستثناست (بخش ۲ / RuleEngine.isExemptFromDeadlineSystem)
 *  — در این حالت پلن فقط شامل خودِ زمان دوز است، بدون یادآور اضافه. */
export function buildReminderPlan(t0: Date, intervalHours: number, exempt: boolean): { plan: ReminderPlan; deadlineAt: Date } {
  if (exempt) {
    // بدون یادآور پله‌ای؛ ددلاین معادل خود T0 (فقط برای محاسبات داخلی — چون
    // exempt یعنی اصلاً بررسی missed رویش اجرا نمی‌شود، نگاه کن ResolverEngine).
    return { plan: { entries: [] }, deadlineAt: t0 };
  }
  const { reminder1Minutes, reminder2Minutes, deadlineMinutes } = computeEscalation(intervalHours);
  const entries: ReminderPlanEntry[] = [
    { kind: 'r1' as ReminderKind, at: new Date(t0.getTime() + reminder1Minutes * 60000).toISOString() },
    { kind: 'r2' as ReminderKind, at: new Date(t0.getTime() + reminder2Minutes * 60000).toISOString() },
    { kind: 'deadline' as ReminderKind, at: new Date(t0.getTime() + deadlineMinutes * 60000).toISOString() }
  ];
  return { plan: { entries }, deadlineAt: new Date(t0.getTime() + deadlineMinutes * 60000) };
}

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  r1: 'یادآور اول',
  r2: 'یادآور دوم',
  deadline: 'آخرین فرصت'
};
