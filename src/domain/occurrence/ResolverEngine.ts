// Resolver Engine (DESIGN.md بخش ۴) — «تنها نقطه‌ی مجاز برای تغییر status یک
// DoseOccurrence». state machine زیر رو enforce می‌کنه:
//
//         ┌─────────┐
//         │ pending │──snooze()──┐  (snoozeCount++, status می‌ماند pending)
//         └────┬────┘◄───────────┘
//              │
//    ┌─────────┼──────────┬─────────────┐
//    │resolve  │resolve    │system-sweep │
//    │('taken')│('skipped')│(deadline<now)│
//    ▼         ▼           ▼
//  taken     skipped     missed
//  (ترمینال) (ترمینال)   (ترمینال)
//
// هیچ کد دیگری (UI، سرویس دیگر) مجاز نیست مستقیماً `occurrenceRepository.update`
// رو برای عوض‌کردن status صدا بزنه — این فایل تنها caller مجازشه (طبق کامنت
// خودِ DoseOccurrenceRepository.update در تیکه ۵).

import { DoseOccurrence, Instant, OccurrenceId, SkipReason } from '../../types';
import type { ClockAdapter } from '../../adapters/ClockAdapter';
import { DoseOccurrenceRepository } from '../../repository/DoseOccurrenceRepository';

export type ResolveResult = 'applied' | 'already_resolved';

/**
 * Domain Event ها (بخش ۴ - «رویدادها»): «هر resolve موفق یک event منتشر
 * می‌کند... مشترکین: Notification Engine (تیکه ۹) و Reports read-model».
 * چون در این تیکه هیچ‌کدوم از این مشترک‌ها هنوز ساخته نشدن، یک event bus
 * واقعی معنا نداره؛ به‌جاش یک callback اختیاری (`onEvent`) از طریق DI تزریق
 * می‌شه — دقیقاً همون الگویی که بقیه‌ی engineها (Clock/TimeZoneConverter) با
 * DI به بیرون وصل می‌شن (بخش ۹ و ۱۲). وقتی تیکه ۹ (Notification Engine)
 * نوشته بشه، `syncOccurrence`/`cancelRemaining` رو از همین `onEvent` صدا
 * می‌زنه؛ لازم نیست ResolverEngine چیزی درباره‌ی وجودشون بدونه.
 *
 * این تایپ‌ها عمداً همین‌جا تعریف شدن، نه توی `types/index.ts` — چون
 * Domain Event یک مفهوم مختص همین Resolver Engine‌ست (شبیه `ScheduledOccurrence`
 * که توی خودِ `SchedulingEngine.ts` تعریف شده، نه `types/index.ts`).
 */
export type ResolverEvent =
  | { kind: 'OccurrenceResolved'; occurrence: DoseOccurrence }
  | { kind: 'OccurrenceMissed'; occurrence: DoseOccurrence };

export interface ResolverEngineDeps {
  occurrenceRepository: DoseOccurrenceRepository;
  clock: ClockAdapter;
  /** اختیاری — نگاه کن به توضیح `ResolverEvent` بالا. */
  onEvent?: (event: ResolverEvent) => void;
}

/**
 * ResolverEngine.resolve — بخش ۴.
 *
 * **گارد همزمانی** (بخش ۴ - «تضمین‌های همزمانی»): پیش از نوشتن، وضعیت فعلی
 * occurrence دوباره از Repository خونده می‌شه (نه از یک نسخه‌ی کش‌شده که
 * caller از قبل داشته)؛ اگه از `pending` خارج شده (یا اصلاً پیدا نشه)،
 * `'already_resolved'` برمی‌گرده و هیچ‌چیزی overwrite نمی‌شه — این دقیقاً
 * رفع فرمال ریسک race بین «تپ کاربر» و «تیک missed-check» که بخش ۴ توضیح
 * داده.
 *
 * **انحراف مستندشده:** occurrence ناموجود (`getById` → `null`) هم
 * `'already_resolved'` برمی‌گردونه، نه یک مقدار سوم — چون امضای بخش ۴ دقیقاً
 * `'applied' | 'already_resolved'` است (فقط دو مقدار). از نظر معنایی هم
 * قابل‌دفاعه: «چیزی برای resolve کردن نیست» با «قبلاً resolve شده» برای
 * caller (که فقط می‌خواد بدونه آیا الان چیزی تغییر کرد یا نه) اثر یکسانی
 * داره. برای قابل‌ردیابی‌موندن باگ (id اشتباه پاس داده شده)، یک
 * `console.warn` هم زده می‌شه — همون الگوی `update()` خودِ Repository برای
 * id ناموجود (تیکه ۵).
 *
 * **پارامتر `meta` بعد از `deps` اومده، نه قبلش** (بر خلاف ترتیب خام سند
 * `resolve(occurrenceId, outcome, meta?)`) — چون TypeScript پارامترهای
 * optional رو فقط در انتهای فهرست پارامترها قبول می‌کنه، و `deps` (تزریق
 * Repository/Clock) نمی‌تونه optional باشه؛ همون الگوی انحراف #۱/#۴ تیکه‌های
 * قبلی (پارامتر DI در امضای خام سند نبوده).
 */
export function resolve(
  occurrenceId: OccurrenceId,
  outcome: 'taken' | 'skipped',
  deps: ResolverEngineDeps,
  meta?: { skipReason?: SkipReason }
): ResolveResult {
  const current = deps.occurrenceRepository.getById(occurrenceId);
  if (!current) {
    console.warn(`ResolverEngine.resolve: occurrence با id="${occurrenceId}" پیدا نشد — نادیده گرفته شد.`);
    return 'already_resolved';
  }
  if (current.status !== 'pending') {
    return 'already_resolved';
  }

  const now = deps.clock.now();
  const updated: DoseOccurrence = {
    ...current,
    status: outcome,
    statusReason: outcome === 'skipped' ? meta?.skipReason : undefined,
    resolvedAt: now,
    resolvedBy: 'user',
    updatedAt: now
  };

  deps.occurrenceRepository.update(updated);
  deps.onEvent?.({ kind: 'OccurrenceResolved', occurrence: updated });
  return 'applied';
}

/**
 * ResolverEngine.snooze — بخش ۴: «فقط `snoozeCount++` — ددلاین/reminderPlan
 * دست‌نخورده می‌ماند؛ دقیقاً همان تصمیم عمدی‌ای که کد فعلی هم دارد».
 *
 * **انحراف مستندشده:** سند برای حالت «occurrence دیگه pending نیست» چیزی
 * نگفته (بر خلاف `resolve` که صراحتاً `'already_resolved'` داره). تصمیم:
 * روی occurrence غیر-pending (یا ناموجود) بی‌سروصدا هیچ‌کاری نمی‌کنه — چون
 * snooze کردن چیزی که قبلاً taken/skipped/missed/canceled شده از نظر
 * کسب‌وکاری بی‌معنیه، و امضای سند خروجی `void` داره (نه یک union برای اعلام
 * نتیجه، پس چیزی برای caller گزارش نمی‌شه).
 */
export function snooze(occurrenceId: OccurrenceId, deps: ResolverEngineDeps): void {
  const current = deps.occurrenceRepository.getById(occurrenceId);
  if (!current || current.status !== 'pending') return;

  const updated: DoseOccurrence = {
    ...current,
    snoozeCount: current.snoozeCount + 1,
    updatedAt: deps.clock.now()
  };
  deps.occurrenceRepository.update(updated);
}

/**
 * ResolverEngine.sweepMissed — بخش ۴: «تمام occurrenceهای pending با
 * deadlineAt < now را missed می‌کند — در کل backlog، نه فقط «امروز». نقطه‌ی
 * رفع باگ چندروزه».
 *
 * از `findPendingWithDeadlineBefore` (که خودِ Repository، تیکه ۵، دقیقاً
 * برای همین منظور نوشته بود) به‌عنوان لیست *کاندیدا* استفاده می‌کنه؛ ولی
 * پیش از نوشتن هر کدوم، دوباره با `getById` تازه‌ش می‌خونه و `status ===
 * 'pending'` رو چک می‌کنه — همون گارد همزمانی `resolve` (بخش ۴)، حتی اگه
 * توی این پیاده‌سازی synchronous (بدون I/O واقعی بین خواندن و نوشتن) عملاً
 * race ممکن نباشه؛ این تضمین رو برای پیاده‌سازی‌های آینده‌ی Repository
 * (async، شبکه‌ای) هم نگه می‌داره.
 *
 * **exempt (critical/single-dose) هرگز اینجا missed نمی‌شن** — نه با یک
 * فیلتر صریح توی همین تابع، بلکه چون `Occurrence Generator` (تیکه ۶) از
 * قبل به این occurrenceها `deadlineAt: EXEMPT_DEADLINE_SENTINEL` (بزرگ‌ترین
 * timestamp معتبر جاوااسکریپت) داده؛ در نتیجه هرگز شرط `deadlineAt < now`
 * رو در `findPendingWithDeadlineBefore` برآورده نمی‌کنن. این دقیقاً همون
 * قراردادیه که تیکه ۶ توی HANDOFF.md از قبل اعلام کرده بود («اگه تیکه ۷ به
 * این فرض نیاز پیدا کرد...») — اینجا محقق شده، بدون نیاز به import مستقیم
 * اون ثابت.
 */
export function sweepMissed(now: Instant, deps: ResolverEngineDeps): DoseOccurrence[] {
  const candidates = deps.occurrenceRepository.findPendingWithDeadlineBefore(now);
  const missed: DoseOccurrence[] = [];

  for (const candidate of candidates) {
    const fresh = deps.occurrenceRepository.getById(candidate.id);
    if (!fresh || fresh.status !== 'pending') continue;

    const updated: DoseOccurrence = {
      ...fresh,
      status: 'missed',
      resolvedAt: now,
      resolvedBy: 'system',
      updatedAt: now
    };
    deps.occurrenceRepository.update(updated);
    missed.push(updated);
    deps.onEvent?.({ kind: 'OccurrenceMissed', occurrence: updated });
  }

  return missed;
}
