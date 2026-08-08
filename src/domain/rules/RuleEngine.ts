// RuleEngine — بخش ۷ سند طراحی. سیاست‌هایی که قبلاً به‌صورت پراکنده در
// doseSchedule.ts / notificationService.ts / App.tsx تکرار شده بودند، حالا
// همه از یک نقطه‌ی واحد خوانده می‌شوند: چه دارویی مستثناست، سقف تأخیر مجاز
// چقدر است، و «پنجره‌ی فعال‌سازی» پنل خانه (بخش ۱۷.۲) چند دقیقه‌ست.

import { Medication } from '../../types';
import { MEDICATION_CATALOG } from '../../data/medicationCatalog';

/** سقف قابل‌تغییر مهلت مصرف دیرهنگام — همان MAX_ALLOWED_DELAY_HOURS قدیمی،
 *  فقط حالا در RuleEngine متمرکز است. */
export const MAX_ALLOWED_DELAY_HOURS = 6;

/** چند دقیقه مانده به scheduledAt، occurrence در پنل خانه «فعال» دیده شود
 *  (بخش ۱۷.۲) — پارامتر Rule Engine است، نه عدد hardcoded در UI. */
export const ACTIVATION_LEAD_MINUTES = 30;

/** حداکثر تعداد کارت هم‌زمان در پنل خانه (بخش ۱۷.۲). */
export const MAX_VISIBLE_HOME_CARDS = 5;

export function isExemptFromDeadlineSystem(med: Medication): boolean {
  if (!med.catalogId) return false;
  const entry = MEDICATION_CATALOG.find(e => e.id === med.catalogId);
  if (!entry) return false;
  return entry.safetyLevel === 'critical' || entry.isSingleDose === true;
}

export function isCriticalSafetyMed(med: Medication): boolean {
  if (!med.catalogId) return false;
  const entry = MEDICATION_CATALOG.find(e => e.id === med.catalogId);
  return entry?.safetyLevel === 'critical';
}

/** تصمیم محصولی بخش ۱۶ («تغییر Time Zone»): آیا موقع سفر، دوز طبق «ساعت
 *  دیواری مقصد» جابه‌جا شود یا «فاصله‌ی مطلق از آخرین دوز» ثابت بماند؟
 *  تصمیم گرفته‌شده و مستندشده: ساعت دیواری مقصد ملاک است — چون کاربر خانگی
 *  این اپ عمدتاً روتین دارویی روزانه دارد (نه دوز حساس به فاصله‌ی مطلق مثل
 *  برخی داروهای بیمارستانی)؛ داروهای safetyLevel=critical که به فاصله‌ی
 *  دقیق حساس‌اند از کل سیستم ددلاین/یادآوری مستثنا هستند (بالا) و این تصمیم
 *  اصلاً رویشان اثر ندارد. */
export const TIMEZONE_TRAVEL_POLICY: 'wall-clock-at-destination' | 'fixed-absolute-interval' = 'wall-clock-at-destination';
