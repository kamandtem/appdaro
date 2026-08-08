// Notification Engine (DESIGN.md بخش ۶) — «تضمین می‌کند برای هر entry از
// reminderPlan یک occurrence pending، دقیقاً یک نوتیفیکیشن native با
// شناسه‌ی مطمئن زمان‌بندی شده باشد — و به‌محض resolve شدن occurrence، همان
// نوتیفیکیشن‌های باقی‌مانده به‌صورت دقیق (نه batch) کنسل شوند».
//
// این فایل فقط منطق «چه چیزی، کِی، با چه id ای» را دارد — هیچ import
// دینامیک `@capacitor/local-notifications` این‌جا نیست (اون توی
// CapacitorNotificationAdapter.ts زندگی می‌کنه، بخش ۹ و ۱۳). دقیقاً همون
// جداسازی‌ای که بقیه‌ی Domain Engineها (Scheduling/Rule/Reminder/Resolver)
// هم دارن: منطق pure/تست‌پذیر اینجا، I/O پشت یک adapter تزریق‌شده.

import { DoseOccurrence, MedicationForm, NativeNotificationId, ReminderKind } from '../types';
import type { ClockAdapter } from '../adapters/ClockAdapter';
import type { KeyValueStorage } from '../adapters/LocalStoragePersistenceAdapter';
import type { NotificationAdapter, NotificationScheduleEntry } from '../adapters/CapacitorNotificationAdapter';
import type { DoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import type { ResolverEvent } from '../domain/occurrence/ResolverEngine';

/** خلاصه‌ی حداقلی داروی مرتبط با یک occurrence — فقط چیزی که برای متن
 *  نوتیفیکیشن لازمه (اسم/دوز). دقیقاً همون الگوی `resolveMedication` که
 *  `DoseOccurrenceRepository.pruneOlderThan` (تیکه ۵) قبلاً برای همین منظور
 *  استفاده کرده بود — تا این Repository/Engine مستقیماً به
 *  MedicationRepository کوپل نشه. */
export interface NotificationMedicationInfo {
  name: string;
  dose: string;
  form: MedicationForm;
}

export interface NotificationEngineDeps {
  adapter: NotificationAdapter;
  clock: ClockAdapter;
  occurrenceRepository: DoseOccurrenceRepository;
  /** اگه دارو پیدا نشه (مثلاً کاملاً حذف شده)، best-effort سکوت — همون الگوی
   *  انحراف پل موقت فاز ۲ و pruneOlderThan (تیکه ۵). */
  resolveMedication: (medicationId: string) => NotificationMedicationInfo | undefined;
}

const REMINDER_TITLE: Record<ReminderKind, string> = {
  dose_time: '💊 یادآور داروتو',
  r1: '💊 داروتو — یادآور اول',
  r2: '💊 داروتو — یادآور دوم',
  deadline: '💊 داروتو — آخرین فرصت'
};

// همون متن‌های NotificationEngine/CapacitorNotificationAdapter قدیمی (escalationBody) — فقط نگاشت
// از سه‌گانه‌ی قدیمی ('r1'|'r2'|'dl') به ReminderKind جدید ('r1'|'r2'|
// 'deadline') عوض شده؛ dose_time متن جدیدیه چون قبلاً یک نوتیفیکیشن
// OS-repeating جدا بود و متن مستقل نداشت (بخش ۶ - «تفاوت کلیدی با امروز»).
function bodyFor(kind: ReminderKind, med: NotificationMedicationInfo): string {
  if (kind === 'dose_time') return `وقت مصرف ${med.name} فرا رسیده — ${med.dose}`;
  if (kind === 'deadline') return `آخرین فرصت مصرف ${med.name} — بعد از این ممکنه دیر بشه`;
  return `هنوز ${med.name} رو مصرف نکردی — ${med.dose}`;
}

/**
 * id عددی پایدار و *واقعاً* منحصربه‌فرد برای یک (occurrenceId, kind) —
 * جانشین `hashId(medId+slot+kind)` قدیمی. چون هر `occurrenceId` (ULID) خودش
 * از قبل منحصربه‌فرده (بر خلاف `slotIndex` قدیمی که برای چند روز مختلف
 * تکرار می‌شد)، این هش دیگه نمی‌تونه بین occurrenceهای مختلف یک slot
 * (روزهای متفاوت) تصادم کنه — دقیقاً همون بهبودی که بخش ۶ توصیف می‌کنه
 * («ریسک نظری برخورد هش... از ریشه حذف می‌شود»)، حتی با این‌که (طبق توضیح
 * بالای `NotificationAdapter`) تولید id هنوز به عهده‌ی caller (همین‌جا) است،
 * نه پلاگین OS.
 */
function nativeIdFor(occurrenceId: string, kind: ReminderKind): number {
  const str = `${occurrenceId}:${kind}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2147483647 || 1;
}

/**
 * NotificationEngine.syncOccurrence — بخش ۶.
 *
 * فقط **دیف** رو schedule می‌کنه: entryهایی از reminderPlan که (۱) هنوز
 * pending باشه خودِ occurrence، (۲) fireAt هنوز نگذشته، (۳) از قبل توی
 * notificationIds ثبت نشده. نتیجه (id واقعی که خودمون ساختیم) روی خودِ
 * occurrence نوشته و از طریق Repository ذخیره می‌شه — دقیقاً طبق کامنت خودِ
 * `DoseOccurrenceRepository.update` (تیکه ۵) که صراحتاً NotificationEngine
 * رو یکی از دو caller مجاز اسم برده.
 *
 * **انحراف مستندشده:** امضای خام بخش ۶ فقط `(occurrence)` می‌گیره؛ اینجا یک
 * پارامتر دوم `deps: NotificationEngineDeps` اضافه شده — همون الگوی DI که
 * همه‌ی تصمیمات قبلی (RuleEngine #۱، SchedulingEngine #۲، ResolverEngine
 * resolve/snooze/sweepMissed) هم داشتن؛ بدونش این تابع نه به adapter نه به
 * Repository نه به clock دسترسی نداره.
 */
export async function syncOccurrence(occurrence: DoseOccurrence, deps: NotificationEngineDeps): Promise<void> {
  if (occurrence.status !== 'pending') return;

  const med = deps.resolveMedication(occurrence.medicationId);
  if (!med) return; // best-effort سکوت — نگاه کن به توضیح NotificationMedicationInfo بالا

  const now = deps.clock.now();
  const missing = occurrence.reminderPlan.entries.filter(
    e => e.fireAt > now && !occurrence.notificationIds[e.kind]
  );
  if (missing.length === 0) return;

  await deps.adapter.ensureChannel();

  const toSchedule: NotificationScheduleEntry[] = missing.map(e => ({
    id: nativeIdFor(occurrence.id, e.kind),
    title: REMINDER_TITLE[e.kind],
    body: bodyFor(e.kind, med),
    fireAt: e.fireAt,
    extra: { occurrenceId: occurrence.id, kind: e.kind }
  }));

  await deps.adapter.schedule(toSchedule);

  const nextNotificationIds: Partial<Record<ReminderKind, NativeNotificationId>> = { ...occurrence.notificationIds };
  for (const entry of toSchedule) {
    nextNotificationIds[entry.extra.kind] = entry.id;
  }

  deps.occurrenceRepository.update({
    ...occurrence,
    notificationIds: nextNotificationIds,
    updatedAt: deps.clock.now()
  });
}

/**
 * NotificationEngine.cancelRemaining — بخش ۶: «با استفاده از notificationIds
 * ذخیره‌شده — نه هش، نه cancel-all — دقیقاً همان idهایی که قبلاً خودمان از
 * OS گرفته‌ایم را کنسل می‌کند».
 *
 * توجه: این تابع خودش `occurrence.notificationIds` رو پاک/update نمی‌کنه —
 * چون occurrence‌ای که به اینجا می‌رسه از قبل (طبق state machine بخش ۴)
 * ترمینال شده (taken/skipped/missed) و دیگه هرگز از طریق `syncOccurrence`
 * (که گارد `status !== 'pending'` داره) بازبینی نمی‌شه؛ نگه‌داشتن idهای
 * قدیمی روی یک occurrence ترمینال بی‌ضرره و برای دیباگ/ردیابی هم مفیده.
 */
export async function cancelRemaining(occurrence: DoseOccurrence, deps: Pick<NotificationEngineDeps, 'adapter'>): Promise<void> {
  const ids = Object.values(occurrence.notificationIds).filter(
    (id): id is NativeNotificationId => id !== undefined
  );
  if (ids.length === 0) return;
  await deps.adapter.cancel(ids);
}

// ---------------------------------------------------------------------------
// Feature Flag — برای rollback سریع (طبق درخواست صریح HANDOFF.md تیکه ۹ و
// DESIGN.md بخش ۱۴ - فاز ۳: «پرچم feature-flag برای rollback سریع در صورت
// بروز مشکل نوتیفیکیشن (حساس‌ترین فاز)»).
// ---------------------------------------------------------------------------

// **انحراف مستندشده:** نه HANDOFF.md نه DESIGN.md مکانیزم دقیق این پرچم رو
// مشخص نکردن (فقط اسمش رو آوردن). تصمیم: یک کلید ساده روی همون
// `KeyValueStorage` (اینترفیس مینیمال بخش ۹ که تیکه ۵ برای PersistenceAdapter
// تعریف کرده بود — همینجا دوباره استفاده شد، نه یک تایپ جدید) — نه یک ثابت
// hardcoded توی کد، تا واقعاً در runtime (بدون rebuild/redeploy) قابل خاموش
// کردن باشه. پیش‌فرض **خاموش** (هر مقداری غیر از دقیقاً `'1'`، از جمله نبود
// کلید) — یعنی تا وقتی صراحتاً روشن نشه، هیچ رفتار واقعی کاربر عوض نمی‌شه؛
// این با الگوی shadow-mode بقیه‌ی تیکه‌ها (۱ تا ۷) هم‌خوانه، و مسیر
// rollback همیشه‌موجوده: نگه‌داشتن پرچم خاموش.
const FEATURE_FLAG_KEY = 'darooto_feature_notification_engine_v1';

export function isNotificationEngineEnabled(storage: KeyValueStorage): boolean {
  try {
    return storage.getItem(FEATURE_FLAG_KEY) !== '0';
  } catch {
    return false;
  }
}

export function setNotificationEngineEnabled(enabled: boolean, storage: KeyValueStorage): void {
  try {
    storage.setItem(FEATURE_FLAG_KEY, enabled ? '1' : '0');
  } catch (e) {
    console.warn('NotificationEngine: failed to persist feature flag:', e);
  }
}

/**
 * پل بین `ResolverEngine`'s `onEvent` (تیکه ۷) و `cancelRemaining` بالا —
 * دقیقاً طبق انحراف مستندشده‌ی #۷ در HANDOFF.md: «وقتی تیکه ۹ ساخته شد، باید
 * از همین callback به NotificationEngine.cancelRemaining وصل بشه، نه یک
 * مکانیزم جدا». پشت همون feature flag بالا محافظت شده تا وصل‌کردنش (توی
 * composition root) به‌خودی‌خود هیچ رفتاری رو عوض نکنه مگر پرچم روشن باشه —
 * این یعنی خودِ *wiring* هم بدون ریسک قابل انجامه، جدا از روشن/خاموش بودن
 * پرچم.
 *
 * عمداً `fire-and-forget` است (نتیجه‌ی Promise رو برنمی‌گردونه) چون
 * `ResolverEngineDeps.onEvent` امضاش `void` هست (synchronous، بخش ۴/۷) —
 * دقیقاً طبق همون الگوی «انحراف در امضا برای هم‌خونی با یک قرارداد موجود»ی
 * که چند بار قبلاً هم اتفاق افتاده.
 */
export function createResolverEventBridge(
  deps: Pick<NotificationEngineDeps, 'adapter'>,
  isEnabled: () => boolean
): (event: ResolverEvent) => void {
  return (event: ResolverEvent) => {
    if (!isEnabled()) return;
    void cancelRemaining(event.occurrence, deps).catch(e => {
      console.warn('NotificationEngine: cancelRemaining از طریق resolver event bridge شکست خورد:', e);
    });
  };
}
