// اسکریپت مهاجرت یک‌باره‌ی داده‌های قدیمی (DESIGN.md بخش ۱۰) — فقط در اولین
// بار باز شدن اپ بعد از آپدیت اجرا می‌شود. هر Medication قدیمی (فیلدهای
// پراکنده‌ی times/frequency/customIntervalHours/selectedDays/monthDay) را به
// یک MedicationAggregate جدید (schedule واحد + safety cache‌شده) تبدیل
// می‌کند، و بعد Occurrence Generator را برای افق اولیه صدا می‌زند.
//
// طبق تصمیم تیکه ۱ («آن تایپ قدیمی دست‌نخورده می‌ماند») و کامنت خودِ
// types/index.ts روی `ScheduleFrequencyType` («نگاشت این دو دنیا وظیفه‌ی
// اسکریپت مهاجرت است، نه این فایل») — این‌جا دقیقاً همان نگاشت است.
//
// این ماژول عمداً بیرون از src/domain/ قرار گرفته: یک Domain Engine خالص
// نیست (به utils/persian و data/medicationCatalog وابسته است — دو ماژول
// خارج از مرز Domain Layer که بخش ۱۲ سند مشخص کرده)، بلکه یک اسکریپت
// یک‌بار-مصرف در سطح Application است — دقیقاً مثل خودِ App.tsx.

import { Medication, FrequencyType, Instant, MedicationAggregate, MedicationSafetyProfile, MedicationSchedule, OccurrenceId, ScheduleFrequencyType, ScheduleSlot, Weekday } from '../types';
import { MEDICATION_CATALOG } from '../data/medicationCatalog';
import { toEnglishNumbers } from '../utils/persian';
import { MedicationRepository } from '../repository/MedicationRepository';
import { DoseOccurrenceRepository } from '../repository/DoseOccurrenceRepository';
import { TimeZoneConverter } from '../domain/shared/TimeZoneConverter';
import type { ClockAdapter } from '../adapters/ClockAdapter';
import { ensureHorizon, OccurrenceGeneratorResult } from '../domain/occurrence/OccurrenceGenerator';

const FREQUENCY_MAP: Record<FrequencyType, ScheduleFrequencyType> = {
  'هر روز': 'daily',
  'هر چند ساعت': 'interval',
  'روزهای هفته': 'weekly',
  'ماهانه': 'monthly'
};

const VALID_WEEKDAYS = new Set<Weekday>(['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']);

function isValidWeekday(value: string): value is Weekday {
  return VALID_WEEKDAYS.has(value as Weekday);
}

/** `"۰۸:۰۰"` یا `"8:0"` -> `{hour:8, minute:0}`. نامعتبر -> `۰۸:۰۰` (fallback
 *  امن، تا مهاجرت یک رکورد خراب کل اجرا را متوقف نکند). */
function parseTimeString(raw: string): { hour: number; minute: number } {
  const [h, m] = toEnglishNumbers(raw).split(':').map(part => Number.parseInt(part, 10));
  if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
    return { hour: h, minute: m };
  }
  return { hour: 8, minute: 0 };
}

/** معادل catalog-lookup قدیمی `isExemptFromDeadlineSystem`/`isCriticalSafetyMed`
 *  (بخش ۱ کامنت `MedicationSafetyProfile`: «منبع حقیقت همچنان خود کاتالوگ
 *  است؛ این فقط یک مشتق ذخیره‌شده است»). داروی بدون `catalogId` (تایپ آزاد)
 *  safety خالی می‌گیرد — دقیقاً رفتار قدیمی که چنین داروهایی هرگز exempt/critical
 *  شناخته نمی‌شدند. */
function deriveSafetyProfile(legacy: Medication): MedicationSafetyProfile {
  if (!legacy.catalogId) return {};
  const entry = MEDICATION_CATALOG.find(e => e.id === legacy.catalogId);
  if (!entry) return {};
  return { safetyLevel: entry.safetyLevel, isSingleDose: entry.isSingleDose };
}

/**
 * یک Medication قدیمی را به `{schedule, slotIndexMap}` تبدیل می‌کند.
 * `slotIndexMap[i]` = شناسه‌ی ScheduleSlot معادل `legacy.times[i]` — برای
 * این‌که DoseLogهای قدیمی (که به‌جای slotId به `timeIndex` ارجاع می‌دهند)
 * در ReportsView قابل نگاشت به slotId جدید بمانند (بخش ۱۰: «DoseLog قدیمی...
 * legacy: true در کنارشان باقی می‌ماند»؛ خودِ نگاشتِ ایندکس اینجا لازم است).
 *
 * برای `frequencyType: 'interval'`: بر خلاف بقیه، فقط **یک** ScheduleSlot
 * ساخته می‌شود (بخش ۲ - «مدل interval یک جایگاه تکرارشونده‌ی واحد است»)، حتی
 * اگر `legacy.times` قدیمی چند مقدار (خروجی `computeIntervalTimesFromClock`
 * برای نمایش «امروز») داشته باشد — آن مقادیر صرفاً نمایشیِ همان یک زنجیره
 * بودند، نه جایگاه‌های مفهومی مجزا؛ زمان‌بندی واقعی از `intervalHours` +
 * `scheduleStartAt` می‌آید، نه از تک‌تک آن رشته‌ها.
 */
function buildScheduleFromLegacy(
  legacy: Medication,
  generateId: () => string,
  deviceTimeZoneId: string,
  fallbackScheduleStartAt: Instant
): { schedule: MedicationSchedule; slotIndexMap: string[] } {
  const frequencyType = FREQUENCY_MAP[legacy.frequency];
  // scheduleStartAt قدیمی اختیاری بود (بخش قابل‌رویت در AddMedicationWizard —
  // ScheduleStartAtPicker همیشه پر نمی‌شد). این سند صریحاً سیاست fallback
  // برایش تعیین نکرده (برخلاف monthDay که RuleEngine.monthDayFallback دارد)؛
  // این‌جا تصمیم مستند: اگر نبود، لحظه‌ی اجرای خودِ مهاجرت را anchor می‌گیریم
  // — یعنی زنجیره‌ی interval از «همین الان» شروع می‌شود، نه از یک گذشته‌ی
  // نامعلوم که ممکن است هزاران گام قدیمی و بی‌ربط تولید کند.
  const scheduleStartAt = legacy.scheduleStartAt
    ? new Date(legacy.scheduleStartAt).getTime()
    : fallbackScheduleStartAt;

  if (frequencyType === 'interval') {
    const slotId = generateId();
    const anchorTime = legacy.times[0] ? parseTimeString(legacy.times[0]) : { hour: 8, minute: 0 };
    const slot: ScheduleSlot = { slotId, timeOfDay: anchorTime, order: 0 };
    const intervalHours =
      legacy.customIntervalHours && legacy.customIntervalHours > 0 ? legacy.customIntervalHours : 8;

    return {
      schedule: {
        scheduleVersion: 1,
        frequencyType: 'interval',
        slots: [slot],
        intervalHours,
        scheduleStartAt,
        timezoneId: deviceTimeZoneId
      },
      slotIndexMap: [slotId]
    };
  }

  const slotIndexMap: string[] = [];
  const slots: ScheduleSlot[] = legacy.times.map((t, index) => {
    const slotId = generateId();
    slotIndexMap.push(slotId);
    return { slotId, timeOfDay: parseTimeString(t), order: index };
  });

  const schedule: MedicationSchedule = {
    scheduleVersion: 1,
    frequencyType,
    slots,
    scheduleStartAt,
    timezoneId: deviceTimeZoneId
  };

  if (frequencyType === 'weekly') {
    schedule.selectedWeekdays = (legacy.selectedDays ?? []).filter(isValidWeekday);
  }
  if (frequencyType === 'monthly') {
    schedule.monthDay = legacy.monthDay;
  }

  return { schedule, slotIndexMap };
}

/**
 * **حفره‌ای که پیش از تیکه ۱۰ پر شد** (هم‌الگوی «حفره‌ی TimeZoneConverter»
 * که پیش از تیکه ۶ پر شده بود):
 *
 * تا اینجا `migrateLegacyData` برای داروی از قبل مهاجرت‌شده *هیچ‌کاری*
 * نمی‌کرد — یعنی `MedicationAggregate` ذخیره‌شده برای همیشه روی عکسِ لحظه‌ی
 * اولین مهاجرت منجمد می‌ماند. تا تیکه ۹ این بی‌ضرر بود (UI اصلاً از Aggregate
 * نمی‌خواند)، ولی از تیکه ۱۰ به بعد پنل خانه *از روی occurrenceها* رندر
 * می‌شود؛ اگر Aggregate تازه نشود، ویرایش ساعت/فرکانس یک دارو یا
 * فعال/غیرفعال‌کردنش هیچ اثری روی کارت‌های خانه نمی‌گذاشت — یک رگرسیون
 * کاربری واقعی نسبت به رفتار امروز.
 *
 * این تابع همان نگاشت `buildScheduleFromLegacy` را دوباره اجرا می‌کند، با دو
 * قید حیاتی برای idempotency:
 *
 * ۱. **پایداری `slotId`** — به‌جای تولید id تازه، id هر جایگاه از نسخه‌ی
 *    موجود و بر اساس `order` (== ایندکس آرایه‌ی `legacy.times`) قرض گرفته
 *    می‌شود. اگر این رعایت نشود، کلید طبیعی occurrence (شامل `slotId`) هر
 *    بار عوض می‌شود و `upsertIfAbsent` دیگر تکراری‌ها را تشخیص نمی‌دهد.
 * ۲. **anchor پایدار برای `scheduleStartAt`** — برای داروهای `interval` که
 *    `scheduleStartAt` ندارند، `buildScheduleFromLegacy` به «الان» fallback
 *    می‌کند (انحراف مستندشده #۵). اگر همان «الان» را در هر sync دوباره پاس
 *    بدهیم، schedule هر بار «تغییرکرده» دیده می‌شود، `scheduleVersion` هر بار
 *    +۱ می‌شود و کل افق مدام cancel/regenerate می‌شود. پس anchor موجود
 *    حفظ می‌شود.
 *
 * نتیجه: اگر واقعاً چیزی عوض نشده باشد، خروجی *ساختاراً* برابر نسخه‌ی موجود
 * است، `MedicationRepository.save` نسخه را بالا نمی‌برد و `ensureHorizon`
 * هیچ occurrenceای را باطل نمی‌کند — یعنی این تابع کاملاً idempotent است.
 * اگر عوض شده باشد، همان مسیر رسمی بخش ۳ سند طی می‌شود: بامپ نسخه توسط
 * Repository ← ابطال occurrenceهای آینده‌ی pending نسخه‌ی قدیم توسط
 * `ensureHorizon` ← تولید دوباره از نسخه‌ی جدید.
 *
 * این هنوز `MedicationEditService` (بخش ۱۱) نیست — آن سرویس باید ابطال
 * صریح occurrenceهای داروی *غیرفعال‌شده* را هم انجام دهد (انحراف #۴ تیکه ۶)،
 * که `ensureHorizon` عمداً انجامش نمی‌دهد. این فقط همگام‌سازی legacy →
 * Aggregate است، در حد چیزی که تیکه ۱۰ برای درست کار کردن لازم دارد.
 */
function refreshAggregateFromLegacy(
  legacy: Medication,
  existing: MedicationAggregate,
  generateId: () => string,
  deviceTimeZoneId: string
): MedicationAggregate {
  const anchor = existing.schedule.scheduleStartAt ?? new Date(legacy.createdAt).getTime();
  const { schedule: rebuilt } = buildScheduleFromLegacy(legacy, generateId, deviceTimeZoneId, anchor);

  const slots: ScheduleSlot[] = rebuilt.slots.map(slot => {
    const previous = existing.schedule.slots.find(s => s.order === slot.order);
    return previous ? { ...slot, slotId: previous.slotId } : slot;
  });

  return {
    ...existing,
    name: legacy.name,
    catalogId: legacy.catalogId,
    form: legacy.form,
    dose: legacy.dose,
    schedule: { ...rebuilt, slots, scheduleVersion: existing.schedule.scheduleVersion },
    safety: deriveSafetyProfile(legacy),
    remainingCount: legacy.remainingCount,
    totalCount: legacy.totalCount,
    alertThreshold: legacy.alertThreshold,
    isActive: legacy.isActive,
    familyMemberId: legacy.familyMemberId,
    notes: legacy.notes,
    instructions: legacy.instructions,
    reason: legacy.reason,
    photoUrl: legacy.photoUrl,
    createdAt: legacy.createdAt,
    pauseReason: legacy.pauseReason
  };
}

export interface MigrationDeps {
  medicationRepository: MedicationRepository;
  occurrenceRepository: DoseOccurrenceRepository;
  converter: TimeZoneConverter;
  clock: ClockAdapter;
  /** ULID یا هر تولیدکننده‌ی id یکتای دیگر — هم برای slotId هم برای
   *  occurrenceId استفاده می‌شود (هر دو صرفاً «رشته‌ی یکتای پایدار»اند). */
  generateId: () => string;
  /** طول افق اولیه‌ی تولید occurrence، بر حسب ساعت. پیش‌فرض ۷۲ (بخش ۱۵). */
  horizonHours?: number;
}

export interface MedicationMigrationPreview {
  medicationId: string;
  /** true یعنی این دارو از قبل (اجرای قبلی مهاجرت) به MedicationAggregate
   *  تبدیل شده بود — schedule/slotId دوباره ساخته نشد (idempotency). */
  alreadyMigrated: boolean;
  slotsCreated: number;
  /** فقط برای داروهای `alreadyMigrated` — true یعنی همگام‌سازی دوباره‌ی
   *  legacy -> Aggregate یک تغییر واقعی در `schedule` پیدا کرد (کاربر ساعت/
   *  فرکانس دارو را ویرایش کرده بود)، پس `MedicationRepository.save`
   *  `scheduleVersion` را بالا برد و `ensureHorizon` occurrenceهای آینده‌ی
   *  نسخه‌ی قدیم را باطل می‌کند. برای داروهای تازه‌مهاجرت‌شده همیشه false. */
  scheduleUpdated?: boolean;
}

export interface MigrationResult {
  medications: MedicationMigrationPreview[];
  /** medicationId -> slotId به‌ترتیب ایندکس در legacy.times، فقط برای
   *  داروهایی که تازه مهاجرت شدند (alreadyMigrated: false). */
  legacySlotIndexMap: Record<string, string[]>;
  /** null در حالت dryRun — چون ensureHorizon واقعاً صدا زده نمی‌شود. */
  occurrenceGeneration: OccurrenceGeneratorResult | null;
  dryRun: boolean;
}

/**
 * migrateLegacyData — نقطه‌ی ورود اسکریپت مهاجرت (بخش ۱۰).
 *
 * **Idempotent**: برای هر `legacy.id`، اگر یک MedicationAggregate با همان id
 * از قبل در `medicationRepository` موجود باشد، schedule/slotId آن دوباره
 * ساخته نمی‌شود (چون slotId باید بین اجراهای متوالی پایدار بماند — وگرنه
 * کلید طبیعی occurrence، که شامل slotId است، هر بار عوض می‌شود و
 * upsertIfAbsent دیگر تشخیص تکراری نمی‌دهد)؛ فقط در فهرستی که به
 * `ensureHorizon` می‌رود شرکت می‌کند تا افق rolling ادامه پیدا کند.
 * `ensureHorizon` خودش idempotent است (کلید طبیعی)، پس صدا زدن دوباره‌ی این
 * تابع کامل، رکورد تکراری تولید نمی‌کند.
 *
 * **Dry-run**: با `options.dryRun: true`، هیچ نوشتنی در هیچ Repository ای
 * انجام نمی‌شود (نه `medicationRepository.save`، نه `ensureHorizon`)؛ فقط
 * پیش‌نمایش این‌که چند دارو/جایگاه *قرار است* ساخته شود برمی‌گردد. طبق بخش
 * ۱۵ (ریسک‌ها): «پشتیبان‌گیری خودکار از localStorage قبل از اجرای مهاجرت» —
 * این خودِ پشتیبان‌گیری وظیفه‌ی caller (لایه‌ی Application، هنگام اتصال این
 * اسکریپت به بوت اپ) است؛ این تابع فقط dry-run را ممکن می‌کند تا caller
 * بتواند پیش از نوشتن واقعی، نتیجه را نمایش/لاگ کند.
 */
export function migrateLegacyData(
  legacyMedications: Medication[],
  deps: MigrationDeps,
  options: { dryRun?: boolean } = {}
): MigrationResult {
  const dryRun = options.dryRun ?? false;
  const deviceTimeZoneId = deps.clock.currentTimeZoneId();
  const now = deps.clock.now();

  const medications: MedicationMigrationPreview[] = [];
  const legacySlotIndexMap: Record<string, string[]> = {};
  const aggregatesForGeneration: MedicationAggregate[] = [];

  for (const legacy of legacyMedications) {
    const existingAggregate = deps.medicationRepository.getById(legacy.id);

    if (existingAggregate) {
      // از قبل مهاجرت شده — ولی ممکنه کاربر از اون موقع دارو رو ویرایش کرده
      // باشه (ساعت/فرکانس/موجودی/فعال‌بودن). Aggregate رو با legacy همگام
      // می‌کنیم؛ اگه چیزی عوض نشده باشه این کار عملاً no-op است (نگاه کن به
      // توضیح refreshAggregateFromLegacy).
      const refreshed = refreshAggregateFromLegacy(legacy, existingAggregate, deps.generateId, deviceTimeZoneId);
      const scheduleUpdated = JSON.stringify({ ...refreshed.schedule, scheduleVersion: 0 })
        !== JSON.stringify({ ...existingAggregate.schedule, scheduleVersion: 0 });

      medications.push({ medicationId: legacy.id, alreadyMigrated: true, slotsCreated: 0, scheduleUpdated });

      if (!dryRun) {
        deps.medicationRepository.save(refreshed);
      }
      // نسخه‌ی معتبر رو دوباره از Repository می‌خونیم، نه از `refreshed` —
      // چون منبع حقیقتِ scheduleVersion خودِ Repository است (بامپ خودکار روی
      // save)، و ensureHorizon باید دقیقاً همون نسخه‌ی نهایی رو ببینه تا
      // occurrenceهای آینده‌ی نسخه‌ی قدیم رو درست باطل کنه (بخش ۳).
      const authoritative = dryRun ? refreshed : (deps.medicationRepository.getById(legacy.id) ?? refreshed);
      aggregatesForGeneration.push(authoritative);
      continue;
    }

    const { schedule, slotIndexMap } = buildScheduleFromLegacy(legacy, deps.generateId, deviceTimeZoneId, now);
    legacySlotIndexMap[legacy.id] = slotIndexMap;

    const aggregate: MedicationAggregate = {
      id: legacy.id,
      name: legacy.name,
      catalogId: legacy.catalogId,
      form: legacy.form,
      dose: legacy.dose,
      schedule,
      safety: deriveSafetyProfile(legacy),
      remainingCount: legacy.remainingCount,
      totalCount: legacy.totalCount,
      alertThreshold: legacy.alertThreshold,
      isActive: legacy.isActive,
      familyMemberId: legacy.familyMemberId,
      notes: legacy.notes,
      instructions: legacy.instructions,
      reason: legacy.reason,
      photoUrl: legacy.photoUrl,
      createdAt: legacy.createdAt,
      pauseReason: legacy.pauseReason
    };

    medications.push({ medicationId: legacy.id, alreadyMigrated: false, slotsCreated: schedule.slots.length, scheduleUpdated: false });

    if (!dryRun) {
      deps.medicationRepository.save(aggregate);
    }
    aggregatesForGeneration.push(aggregate);
  }

  let occurrenceGeneration: OccurrenceGeneratorResult | null = null;
  if (!dryRun) {
    const horizonHours = deps.horizonHours ?? 72;
    const horizon = { from: now, to: now + horizonHours * 60 * 60 * 1000 };
    occurrenceGeneration = ensureHorizon(aggregatesForGeneration, horizon, {
      converter: deps.converter,
      clock: deps.clock,
      occurrenceRepository: deps.occurrenceRepository,
      generateId: deps.generateId as () => OccurrenceId
    });
  }

  return { medications, legacySlotIndexMap, occurrenceGeneration, dryRun };
}
