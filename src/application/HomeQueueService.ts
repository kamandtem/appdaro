// HomeQueueService (تیکه ۱۰ — DESIGN.md بخش ۱۷، فاز ۴)
//
// **تنها منبع «کدام کارت‌ها همین الان در پنل خانه دیده شوند»** — هم برای
// `StackedCards` (پنل خانه) و هم برای نوار «نوبت بعدی» بالای صفحه (بخش
// ۱۷.۶). سند صراحتاً می‌گوید این باید یک محاسبه‌ی *واحد* باشد، چون منبع
// دوگانه‌ی محاسبه یکی از دلایل ریشه‌ای «تداخل کارت» در سیستم امروز است
// (بخش ۰).
//
// این یک لایه‌ی **Presentation/Application** است، نه Domain: هیچ occurrenceای
// نمی‌سازد، هیچ statusای عوض نمی‌کند و هیچ‌چیزی نمی‌نویسد — فقط می‌خواند و
// فیلتر/مرتب می‌کند (بخش ۱۷: «Domain همچنان همه‌ی occurrenceهای روز را در
// Repository دارد؛ آنچه عوض می‌شود فقط این است که کدام زیرمجموعه نشان داده
// می‌شود»). به همین خاطر کاملاً DI-based و بدون هیچ importی از React/
// `@capacitor/*` نوشته شده تا با `tsx --test` قابل تست باشد.

import { DoseOccurrence, Instant, OccurrenceStatus } from '../types';
import type { ClockAdapter } from '../adapters/ClockAdapter';
import { MedicationRepository } from '../repository/MedicationRepository';
import { DoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import { TimeZoneConverter } from '../domain/shared/TimeZoneConverter';
import { addDays } from '../domain/shared/calendar';
import { activationLeadMinutes } from '../domain/rules/RuleEngine';
import { EscalationStep, escalationStepFor } from '../domain/reminders/ReminderEngine';

/** سقف صریح بخش ۱۷.۲، قانون ۲: «حداکثر ۵ تا». */
export const MAX_VISIBLE_CARDS = 5;

export interface HomeQueueDeps {
  medicationRepository: MedicationRepository;
  occurrenceRepository: DoseOccurrenceRepository;
  clock: ClockAdapter;
  converter: TimeZoneConverter;
}

/**
 * بازه‌ی مطلقِ «امروز» بر اساس تقویم *محلی* کاربر — نه
 * `toISOString().split('T')[0]` که تاریخ را از روی UTC می‌گیرد.
 *
 * این دقیقاً همان «یک نقطه‌ی واحد» است که DESIGN.md بخش ۱۶ («نیمه‌شب»)
 * می‌خواهد: «امروز چیست» فقط از `ClockAdapter.now() +
 * ClockAdapter.currentTimeZoneId()` محاسبه می‌شود، نه شش‌جای پراکنده.
 * با این کار باگ نیمه‌شبِ پنل خانه (`todayStr` در `StackedCards`) از ریشه
 * بسته می‌شود.
 */
export function localDayRange(
  now: Instant,
  timezoneId: string,
  converter: TimeZoneConverter
): { from: Instant; to: Instant } {
  const local = converter.toLocal(now, timezoneId);
  const startOfToday = converter.toInstant({ ...local, hour: 0, minute: 0 }, timezoneId);
  const tomorrow = addDays(local, 1);
  const startOfTomorrow = converter.toInstant({ ...tomorrow, hour: 0, minute: 0 }, timezoneId);
  return { from: startOfToday, to: startOfTomorrow - 1 };
}

/**
 * ترتیب اولویت صف (بخش ۱۷.۲ قانون ۲ + بخش ۱۷.۳)، دقیقاً معادل رفتار امروزِ
 * `StackedCards` ولی روی occurrence به‌جای `DoseInstance`:
 *
 * ۱. کارتی که کاربر «بعداً» زده (`snoozeCount > 0`) همیشه *بعد از* کارت‌های
 *    دست‌نخورده می‌آید — «یک پله عقب‌تر می‌رود» (بخش ۱۷.۳). این معیار اول
 *    است، نه دوم؛ همان پارتیشن `dueInstances` / `laterInstances` امروز.
 * ۲. بین هم‌گروه‌ها: پله‌ی escalation بالاتر جلوتر («سررسیدشده‌ترین اول»).
 * ۳. تساوی: `scheduledAt` زودتر جلوتر؛ و در نهایت `id` صرفاً برای قطعی‌بودن
 *    ترتیب (تا رندرهای پیاپی جای کارت‌ها را عوض نکنند).
 */
function comparePriority(a: DoseOccurrence, b: DoseOccurrence, now: Instant): number {
  const aSnoozed = a.snoozeCount > 0 ? 1 : 0;
  const bSnoozed = b.snoozeCount > 0 ? 1 : 0;
  if (aSnoozed !== bSnoozed) return aSnoozed - bSnoozed;

  const stepDiff = escalationStepFor(b.reminderPlan, now) - escalationStepFor(a.reminderPlan, now);
  if (stepDiff !== 0) return stepDiff;

  if (a.scheduledAt !== b.scheduledAt) return a.scheduledAt - b.scheduledAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * occurrenceهای «فعال» طبق بخش ۱۷.۲ — قبل از اعمال سقف ۵ تا.
 *
 * دو قید:
 * - `scheduledAt - activationLeadMinutes <= now` (قانون ۱ و ۴) — این‌جا
 *   به‌شکل سقفِ بازه‌ی کوئری اعمال می‌شود، نه یک فیلتر بعدی، تا اصلاً
 *   occurrenceهای دورِ افق از Repository خوانده نشوند.
 * - `scheduledAt >= شروع امروزِ محلی` — **انحراف مستندشده:** بخش ۱۷ کف بازه
 *   را مشخص نکرده. بدون کف، occurrenceهای exempt (که طبق انحراف #۳ هرگز
 *   `missed` نمی‌شوند و برای همیشه `pending` می‌مانند) روزبه‌روز روی هم
 *   انباشته می‌شدند و پنل خانه پر می‌شد از کارت‌های چند روز پیش — دقیقاً
 *   عکس هدف بخش ۱۷.۲. کفِ «شروع امروزِ محلی» همان دامنه‌ی امروزیِ پنل خانه‌ی
 *   فعلی را حفظ می‌کند، فقط این بار بدون باگ نیمه‌شب. occurrenceهای
 *   غیر-exempt گذشته هم لازم نیست اینجا فیلتر شوند: `ResolverEngine.sweepMissed`
 *   خودش آن‌ها را از `pending` خارج کرده است.
 */
function activeOccurrences(now: Instant, deps: HomeQueueDeps): DoseOccurrence[] {
  const timezoneId = deps.clock.currentTimeZoneId();
  const { from } = localDayRange(now, timezoneId, deps.converter);
  const activationCutoff = now + activationLeadMinutes() * 60 * 1000;
  if (activationCutoff < from) return [];

  return deps.occurrenceRepository
    .findByDateRange({ from, to: activationCutoff })
    .filter(o => o.status === 'pending');
}

/**
 * `HomeQueueService.visibleCards(now)` — دقیقاً امضای بخش ۱۷.۲.
 *
 * صفِ داخلیِ بند ۳ سند («occurrenceهای فعال ولی خارج از سقف ۵ تا... در همان
 * query هر بار محاسبه می‌شود») عمداً هیچ‌جا ذخیره نمی‌شود: چون این تابع خالص
 * است و هر بار از نو مرتب می‌کند، به‌محض resolve/skip شدن یکی از ۵ کارت جلو،
 * نفر ششم خودبه‌خود در فراخوانی بعدی وارد لیست می‌شود.
 */
export function visibleCards(now: Instant, deps: HomeQueueDeps): DoseOccurrence[] {
  return activeOccurrences(now, deps)
    .sort((a, b) => comparePriority(a, b, now))
    .slice(0, MAX_VISIBLE_CARDS);
}

/**
 * ViewModel یک کارت خانه — هرچه `StackedCards` برای رندر لازم دارد و از
 * *لایه‌ی جدید* می‌آید، در یک شیء.
 *
 * **چرا یک تایپ جدا کنار `visibleCards`:** سند امضای
 * `visibleCards(now): DoseOccurrence[]` را داده و همان بالا دست‌نخورده حفظ
 * شده؛ ولی `DoseOccurrence` عمداً هیچ فیلد نمایشی (نام دارو، ساعت دیواری،
 * پله‌ی رنگ) ندارد. اگر این‌ها را در خود کامپوننت حساب کنیم، دوباره منطق به
 * UI نشت می‌کند — همان چیزی که کل بخش ۱۷ می‌خواهد جمعش کند. پس اینجا محاسبه
 * می‌شوند.
 */
export interface HomeCard {
  occurrence: DoseOccurrence;
  medicationId: string;
  medicationName: string;
  slotId: string;
  /** ساعت دیواریِ *واقعی* همین دوز، از `scheduledAt` (نه از
   *  `ScheduleSlot.timeOfDay`): برای فرکانس `interval`، جایگاه یک anchor ثابت
   *  دارد ولی هر occurrence ساعت خودش را دارد — پس تنها منبع درست
   *  `scheduledAt` است. */
  timeOfDay: { hour: number; minute: number };
  escalationStep: EscalationStep;
  /** بخش ۱۷.۴ — کارت «بعداً»خورده باید ظاهر متمایز داشته باشد. */
  isSnoozed: boolean;
  /** پلان فقط `dose_time` دارد ⇒ داروی exempt (critical/تک‌دوزه). */
  isExempt: boolean;
  isCritical: boolean;
}

function toHomeCard(occurrence: DoseOccurrence, now: Instant, deps: HomeQueueDeps): HomeCard {
  const aggregate = deps.medicationRepository.getById(occurrence.medicationId);
  const timezoneId =
    aggregate?.schedule.timezoneId ?? occurrence.timezoneAtGeneration ?? deps.clock.currentTimeZoneId();
  const local = deps.converter.toLocal(occurrence.scheduledAt, timezoneId);

  return {
    occurrence,
    medicationId: occurrence.medicationId,
    medicationName: aggregate?.name ?? occurrence.medicationId,
    slotId: occurrence.slotId,
    timeOfDay: { hour: local.hour, minute: local.minute },
    escalationStep: escalationStepFor(occurrence.reminderPlan, now),
    isSnoozed: occurrence.snoozeCount > 0,
    isExempt: !occurrence.reminderPlan.entries.some(e => e.kind === 'deadline'),
    isCritical: aggregate?.safety?.safetyLevel === 'critical'
  };
}

/** همان `visibleCards`، فقط به شکل ViewModel آماده‌ی رندر. */
export function homeCards(now: Instant, deps: HomeQueueDeps): HomeCard[] {
  return visibleCards(now, deps).map(o => toHomeCard(o, now, deps));
}

/** بخش ۱۷.۶ — نوار «نوبت بعدی» بالای صفحه باید *اولین آیتم همین لیست* باشد،
 *  نه یک محاسبه‌ی مستقل دوم. */
export function nextCard(now: Instant, deps: HomeQueueDeps): HomeCard | null {
  return homeCards(now, deps)[0] ?? null;
}

const RESOLVED_STATUSES: OccurrenceStatus[] = ['taken', 'skipped', 'missed'];

export interface TodaySummary {
  /** همه‌ی دوزهای امروزِ *محلی*، به‌جز `canceled` (که یعنی این دوز اصلاً دیگر
   *  بخشی از برنامه نیست، نه این‌که کاربر انجامش نداده). */
  total: number;
  /** taken + skipped + missed. */
  resolved: number;
  taken: number;
  /** برای پشته‌ی کارت‌های محوشده‌ی پایین صفحه، به ترتیب زمان. */
  takenCards: HomeCard[];
}

/**
 * آمار امروزِ پنل خانه («امروز X دارو داری / تا الان Y از X مصرف شده»).
 *
 * جایگزین `allInstances` + `todayStr` امروز در `StackedCards` است؛ سه تفاوت
 * واقعی با آن:
 * - روز از تقویم *محلی* گرفته می‌شود، نه UTC (باگ نیمه‌شب، بخش ۱۶).
 * - فیلتر `selectedWeekdays`/`monthDay` واقعاً اعمال شده — چون این آمار روی
 *   occurrenceهای *تولیدشده* است، و تولید از `SchedulingEngine` می‌آید که
 *   `RuleEngine.isDueOn` را رعایت می‌کند. باگ زنده‌ی امروز («داروی دوشنبه/
 *   چهارشنبه هر روز کارت می‌سازد» — بخش ۰) از همین‌جا بسته می‌شود.
 * - «مصرف‌شده» از `status` خودِ occurrence می‌آید، نه از جست‌وجو در آرایه‌ی
 *   `doseLogs`.
 */
export function todaySummary(now: Instant, deps: HomeQueueDeps): TodaySummary {
  const timezoneId = deps.clock.currentTimeZoneId();
  const range = localDayRange(now, timezoneId, deps.converter);
  const today = deps.occurrenceRepository.findByDateRange(range).filter(o => o.status !== 'canceled');

  const takenOccurrences = today
    .filter(o => o.status === 'taken')
    .sort((a, b) => a.scheduledAt - b.scheduledAt);

  return {
    total: today.length,
    resolved: today.filter(o => RESOLVED_STATUSES.includes(o.status)).length,
    taken: takenOccurrences.length,
    takenCards: takenOccurrences.map(o => toHomeCard(o, now, deps))
  };
}

/**
 * زودترین لحظه‌ی آینده‌ای که خروجی `homeCards`/`todaySummary` *می‌تواند* عوض
 * شود — یعنی یا یک occurrence وارد پنجره‌ی فعال‌سازی می‌شود، یا یک کارت از
 * یک پله‌ی escalation به پله‌ی بعد رد می‌شود. `null` یعنی تا آخر امروز هیچ
 * مرزی در پیش نیست.
 *
 * **چرا لازم است:** بخش ۱۷.۵ می‌گوید تایمر شمارش‌معکوس حذف می‌شود و نشانه‌ی
 * وضعیت «فقط وقتی که واقعاً از یک پله به پله‌ی بعد رد می‌شویم عوض می‌شود —
 * نه هر چند ثانیه». پس UI به‌جای `setInterval` چهارثانیه‌ای امروز، یک
 * `setTimeout` تکی دقیقاً روی همین لحظه می‌گذارد. (کاهش رندر/باتری که خود
 * سند هم به آن اشاره کرده.)
 */
export function nextTransitionAt(now: Instant, deps: HomeQueueDeps): Instant | null {
  const timezoneId = deps.clock.currentTimeZoneId();
  const { from, to } = localDayRange(now, timezoneId, deps.converter);
  const leadMs = activationLeadMinutes() * 60 * 1000;

  const pendingToday = deps.occurrenceRepository
    .findByDateRange({ from, to })
    .filter(o => o.status === 'pending');

  let earliest: Instant | null = null;
  const consider = (candidate: Instant) => {
    if (candidate > now && (earliest === null || candidate < earliest)) earliest = candidate;
  };

  for (const occ of pendingToday) {
    consider(occ.scheduledAt - leadMs);
    for (const entry of occ.reminderPlan.entries) consider(entry.fireAt);
  }

  return earliest;
}
