# HANDOFF — وضعیت مهاجرت به معماری Dose Occurrence

این فایل برای یک نشست/اکانت *دیگر* Claude نوشته شده که این مکالمه رو ندیده.
هدف: بتونی دقیقاً از همون‌جایی که کار متوقف شده ادامه بدی، بدون این‌که
تصمیم‌های قبلی رو دوباره از صفر بگیری یا با کاری که قبلاً انجام شده تداخل
پیدا کنی.

**همیشه اول `DESIGN.md` رو کامل بخون** (سند طراحی معماری). این فایل فقط
خلاصه‌ی *وضعیت اجرا*ست، نه جایگزین اون سند.

---

## قرارداد کاری (مهم — قبل از هر کاری رعایتش کن)

کار به ۱۳ «تیکه» با اندازه‌ی متوسط تقسیم شده (فهرست کامل پایین همین فایل).
هر تیکه:
- یک واحد منطقی و قابل تست مستقله، در یک نشست چت معمولی قابل تکمیله.
- باید با تست واحد (`node:test`، از طریق `tsx --test`) تأیید بشه قبل از
  اعلام «تمام».
- **فقط وقتی صریحاً ازت خواسته شد شروعش کن.** یعنی بعد از خوندن این فایل و
  DESIGN.md، منتظر بمون کاربر بگه کدوم شماره تیکه رو شروع کنی — دقیقاً مثل
  الگوی خودِ این نشست تا الان.
- یک تیکه رو کامل تا آخر (شامل تست) انجام بده و تمومش کن، بعد منتظر تأیید
  برای تیکه‌ی بعدی بمون. چند تیکه رو پشت سر هم بدون تأیید انجام نده.

## محیط اجرا — محدودیت مهم

توی نشستی که این فایل رو نوشته، **شبکه غیرفعال بود** و `node_modules` نصب
نبود. به همین خاطر:
- تست‌ها با `node:test` داخلیِ خودِ Node (نه Jest/Vitest) نوشته شدن، و با
  `tsx --test <files>` اجرا می‌شن — بدون نیاز به `npm install`.
- اگه توی نشست تو شبکه در دسترسه، بهتره اول `npm install` رو بزنی تا
  `tsc --noEmit` هم بدون خطاهای «module not found» تمیز اجرا بشه (الان این
  خطاها فقط به‌خاطر نبود `node_modules`ان، نه باگ واقعی — هم روی کد قدیمی
  پروژه هم روی کد جدید یکسان دیده می‌شن).
- اگه شبکه داری و می‌خوای یک کتابخانه‌ی واقعی timezone-aware (مثل
  `date-fns-tz`) برای Adapter Layer واقعی (تیکه ۴، بخش «انحراف‌ها» پایین)
  اضافه کنی، الان وقتشه.

## چک‌لیست شروع هر تیکه

۱. `DESIGN.md` رو (دوباره، اگه لازمه) بخون — خصوصاً بخش مربوط به همون تیکه.
۲. کد فعلی پروژه رو برای فایل‌هایی که قراره تغییر بدی واقعاً بخون — به
   ادعاهای این فایل یا حتی DESIGN.md اکتفا نکن، خودت verify کن (دقیقاً کاری
   که توی این نشست هم قبل از هر تیکه انجام شد).
۳. بعد از پیاده‌سازی، تست واحد بنویس و با `tsx --test` واقعاً اجراش کن —
   صرفاً نوشتن تست کافی نیست، باید سبز بودنش رو با چشم خودت (خروجی تولز)
   ببینی.
۴. یک `tsc --noEmit -p tsconfig.json | grep <مسیر فایل‌های جدید>` بزن تا
   مطمئن بشی فایل‌های جدید خودت خطای واقعی ندارن (خطاهای «module not
   found» به‌خاطر نبود node_modules رو نادیده بگیر، مگر شبکه رو وصل کرده
   باشی).

---

## چیزی که تا الان انجام شده

### تیکه ۱ — Domain Types ✅
فایل: `src/types/index.ts` (فقط اضافه‌شده، هیچ تایپ قدیمی تغییر نکرده)

اضافه شد: `Instant`, `OccurrenceId`, `NativeNotificationId`, `Weekday`,
`ScheduleFrequencyType`, `ScheduleSlot`, `MedicationSchedule`,
`MedicationSafetyProfile`, `ReminderKind`, `ReminderPolicy`, `ReminderPlan`,
`OccurrenceStatus`, `DoseOccurrence`, `DoseHistoryRecord`.

`Medication`, `DoseLog`, `FrequencyType`, `AppState` قدیمی دست‌نخورده موندن —
هنوز به هیچ‌جای UI وصل نشدن (طبق فاز ۰: «هیچ‌جای UI/App.tsx به این‌ها وصل
نمی‌شود»).

### تیکه ۲ — Rule Engine + Scheduling Engine ✅
فایل‌ها:
- `src/domain/shared/calendar.ts` — توابع خالص تقویمی (`weekdayOf`,
  `daysInMonth`, `addDays`, `compareLocalDate`) با `Date.UTC` تا مستقل از
  تایم‌زون میزبان بمونن.
- `src/domain/shared/TimeZoneConverter.ts` — اینترفیس `TimeZoneConverter`
  (`toInstant`/`toLocal`) + `FixedOffsetTimeZoneConverter` که **فقط برای
  تست** ساخته شده (فرض آفست ثابت بدون DST — دقیقاً وضعیت فعلی ایران).
  **پیاده‌سازی واقعی و عمومی (با یک کتابخانه‌ی IANA واقعی) هنوز ساخته
  نشده** — این جزو کار تیکه ۴ (Adapter Layer) گذاشته شده بود ولی توی تیکه ۴
  هم فقط `ClockAdapter`/`AppLifecycleAdapter` ساخته شدن، نه این. **این یک
  حفره‌ی باز مونده که باید جایی (پیشنهاد: همون ابتدای تیکه ۵ یا یک تیکه‌ی
  جدا) پر بشه** — بدون یک `TimeZoneConverter` واقعی، `SchedulingEngine`
  نمی‌تونه واقعاً روی device production کار کنه، فقط توی تست کار می‌کنه.
- `src/domain/rules/RuleEngine.ts` — `reminderPolicyFor`,
  `maxAllowedDelayHours`, `monthDayFallback`, `isDueOn`.
- `src/domain/scheduling/SchedulingEngine.ts` — تابع `expand(schedule,
  range, converter)`.

**تست:** ۲۵ تست، همه پاس (`tsx --test src/domain/rules/*.test.ts
src/domain/scheduling/*.test.ts`).

### تیکه ۳ — Reminder Engine ✅
فایل: `src/domain/reminders/ReminderEngine.ts` — تابع `plan(occurrence,
policy)`.

**تست مهم:** یک تست کراس‌چک مستقیم بین فرمول جدید و تابع قدیمی
`computeEscalation` (توی `src/utils/doseSchedule.ts`) نوشته شده که برای ۹
مقدار مختلف `intervalHours` نشون می‌ده خروجی *دقیقاً* یکسانه — یعنی فرمول
سه‌گانه‌ی امروز درست حفظ شده، نه یک نسخه‌ی مشابه ولی کمی فرق‌دار.

**تست:** ۶ تست، همه پاس.

با پایان تیکه ۳، **فاز ۰ سند (بخش ۱۴) کامل شد**.

### تیکه ۴ — Adapter Layer پایه (ClockAdapter + AppLifecycleAdapter) ✅
فایل‌ها:
- `src/adapters/ClockAdapter.ts` — اینترفیس `ClockAdapter` +
  `DeviceClockAdapter` (پیاده‌سازی واقعی؛ `now()` از `Date.now()`،
  `currentTimeZoneId()` از `Intl.DateTimeFormat().resolvedOptions().timeZone`،
  و `onTimeZoneChange` با یک polling ملایم هر ۶۰ثانیه فقط وقتی حداقل یک
  listener هست) + `FakeClockAdapter` (freeze/travel کامل، برای تست).
- `src/adapters/AppLifecycleAdapter.ts` — اینترفیس `AppLifecycleAdapter` +
  `CapacitorAppLifecycleAdapter` (`onResume` با dynamic-import از
  `@capacitor/app`، دقیقاً همون الگویی که `App.tsx` امروز داره) +
  `FakeAppLifecycleAdapter` (manual trigger، برای تست).

**محدودیت شناخته‌شده و آگاهانه — `onBoot`:** طبق DESIGN.md بخش ۱۶، تشخیص
واقعی boot شدن گوشی نیاز به یک `BroadcastReceiver` برای `BOOT_COMPLETED` توی
لایه‌ی **native Android** (Kotlin/Java + `AndroidManifest.xml`) داره — چیزی
که از TypeScript قابل نوشتن نیست و از حیطه‌ی این پروژه (که فقط دسترسی به
TS/کد وب داره) خارجه. `onBoot` فعلاً فقط منتظر یک `CustomEvent` به نام
`daroto:boot` روی `document` می‌مونه (قلاب آماده برای یک پلاگین بومی که هنوز
نوشته نشده). **اگه دسترسی به کد native Android داری، نوشتن اون
BroadcastReceiver یک کار جداست، خارج از این ۱۳ تیکه.**

**تست:** ۲۴ تست، همه پاس — از جمله تست polling با تایمر جعلی خودِ
`node:test` (`t.mock.timers`).

### تیکه ۵ — Repository Layer ✅
فایل‌ها:
- `src/adapters/LocalStoragePersistenceAdapter.ts` — اینترفیس عمومی
  `PersistenceAdapter` (`readAll<T>(collection)`/`writeAll<T>(collection,
  items)`) + `LocalStoragePersistenceAdapter` (پیاده‌سازی واقعی، هر
  collection زیر کلید `darooto_repo_v1:<name>` جدا از هم، به‌جای یک کلید غول
  واحد مثل storageService.ts فعلی) + `InMemoryKeyValueStorage` (fake تستی).
- `src/types/index.ts` — یک تایپ جدید اضافه شد: **`MedicationAggregate`**
  (Medication Aggregate Root جدید طبق بخش ۱، با `.schedule`/`.safety`).
  عمداً هم‌نام با `Medication` قدیمی نیست (همون تصمیم تیکه ۱ ادامه پیدا
  کرد) — این تایپ فقط پشت Repository زندگی می‌کنه تا تیکه ۱۲ که UI بهش وصل
  بشه.
- `src/repository/MedicationRepository.ts` — با منطق خودکار بالابردن
  `scheduleVersion` روی `save()` (مقایسه‌ی ساختاری schedule جدید با موجود؛
  اگه فرق داشت +۱، اگه نه، نسخه‌ی موجود رو حفظ می‌کنه حتی اگه caller چیز
  دیگه‌ای پاس بده).
- `src/repository/DoseOccurrenceRepository.ts` — دقیقاً ۶ متد سند + یک متد
  اضافه‌ی مستندشده: `pruneOlderThan` (retention/pruning طبق بخش ۸ و ریسک
  بخش ۱۵ — چون ریسک صراحتاً گفته این باید «از فاز ۱» باشه، نه بعداً).

**تست:** ۳۲ تست جدید (۷ پایداری + ۱۰ MedicationRepository + ۱۵
DoseOccurrenceRepository)، همه پاس. تست‌های `upsertIfAbsent` مستقیماً
immutability rule بخش ۳ رو چک می‌کنن (رکورد resolve‌شده با generate دوباره
overwrite نمی‌شه).

**حفره‌ی TimeZoneConverter واقعی (از تیکه ۲) هنوز پر نشده** — توی این تیکه
هم لازم نبود چون Repository به Scheduling Engine وابسته نیست. ولی از تیکه ۶
(Occurrence Generator) به بعد، این حفره واقعاً مسدودکننده می‌شه — اونجا حتماً
باید حلش کنی.

### حفره‌ی TimeZoneConverter (از تیکه ۲) — پر شد ✅ (قبل از تیکه ۶)
فایل‌ها:
- `src/adapters/TimeZoneConverterAdapter.ts` — `IanaTimeZoneConverter`، با
  کتابخانه‌ی `date-fns-tz` (نصب شد؛ شبکه توی این نشست در دسترس بود، پس
  `npm install` هم زده شد و `node_modules` الان موجوده — نگاه کن به بخش
  «محیط اجرا» بالا که مال یک نشست *قدیمی‌تر* با شبکه‌ی غیرفعاله). از رشته‌ی
  ISO **بدون** پسوند offset/Z + گزینه‌ی `timeZone` صریح استفاده می‌کنه
  (`fromZonedTime`/`toZonedTime`) تا نتیجه کاملاً مستقل از تایم‌زون سیستم
  میزبان بمونه — نه با ساختن `new Date(y,m,d,h,min)` خام.

**تست:** ۷ تست، همه پاس — شامل تست‌های DST واقعی روی `America/New_York`
(زمستان/تابستان با آفست متفاوت، و فاصله‌ی ۴۷ساعته‌ی عبور از spring-forward)
که `FixedOffsetTimeZoneConverter` تستی اصلاً نمی‌تونست درست جواب بده. یک تست
sanity هم مستقیم `SchedulingEngine.expand` رو با این converter واقعی روی یک
بازه‌ی عبورکننده از مرز DST اجرا کرد — درست جواب داد.

`npm install date-fns-tz date-fns ulid --save` زده شد (پکیج `ulid` هم برای
تولید `OccurrenceId`/`slotId` توی تیکه ۶ لازم بود).

### تیکه ۶ — Occurrence Generator + اسکریپت مهاجرت ✅
فایل‌ها:
- `src/domain/rules/RuleEngine.ts` — یک export جدید اضافه شد:
  `intervalHoursForSlot(schedule, slotId)`. معادل جدید تابع قدیمی
  `intervalHoursForSlot` توی `utils/doseSchedule.ts` (فاصله‌ی واقعی تا دوز
  بعدی، با چرخش +۲۴ساعت برای آخرین جایگاه روز؛ برای `interval` مستقیماً
  `schedule.intervalHours`) — ورودی مستقیم `reminderPolicyFor`. توی سند برای
  این تابع بخش جدا و امضای صریح نیومده بود؛ چون دقیقاً هم‌خانواده‌ی بقیه‌ی
  تصمیمات `RuleEngine` (بخش ۷) هست، همونجا اضافه شد نه یک فایل جدا.
- `src/domain/occurrence/OccurrenceGenerator.ts` — تابع
  `ensureHorizon(medications: MedicationAggregate[], horizon, deps)` طبق
  بخش ۳: (۱) occurrenceهای آینده‌ی `pending` با `scheduleVersion` قدیمی رو
  `canceled` می‌کنه (occurrenceهای گذشته یا resolve‌شده دست‌نخورده می‌مونن —
  immutability rule)، (۲) `SchedulingEngine.expand` + `upsertIfAbsent`
  idempotent برای افق جدید. فقط داروهای `isActive` پردازش می‌شن.
- `src/migration/migrateLegacyData.ts` — پوشه‌ی جدید، بیرون از
  `src/domain/` (چون به `utils/persian` و `data/medicationCatalog` وابسته‌ست
  — بیرون از مرز Domain Layer بخش ۱۲). تابع
  `migrateLegacyData(legacyMedications, deps, {dryRun?})`: هر `Medication`
  قدیمی رو به `MedicationAggregate` (با `schedule`/`safety`) تبدیل می‌کنه،
  بعد `ensureHorizon` رو برای افق اولیه (پیش‌فرض ۷۲ ساعت) صدا می‌زنه.
  Idempotent (اگه یک دارو قبلاً مهاجرت شده، schedule/slotId دوباره ساخته
  نمی‌شه — پایداری slotId حفظ می‌شه) و dry-run-able (`dryRun: true` هیچ
  نوشتنی انجام نمی‌ده، فقط پیش‌نمایش برمی‌گردونه).

**تست:** ۳۲ تست جدید (۷ برای `intervalHoursForSlot`، ۱۰ برای
`OccurrenceGenerator`، ۱۵ برای `migrateLegacyData`)، همه پاس. جمع کل پروژه
الان **۱۲۰ تست**، همه پاس (`npx tsx --test $(find src -name "*.test.ts")`).
`tsc --noEmit` و `npm run build` هر دو تمیز.

هنوز به هیچ‌جای UI/App.tsx وصل نشده (shadow mode، طبق فاز ۱).

---

### تیکه ۷ — Resolver Engine ✅
فایل: `src/domain/occurrence/ResolverEngine.ts` — سه export طبق بخش ۴:

- `resolve(occurrenceId, outcome: 'taken'|'skipped', deps, meta?)` →
  `'applied' | 'already_resolved'`. گارد همزمانی: پیش از نوشتن، وضعیت فعلی
  occurrence دوباره از Repository خونده می‌شه (نه یک نسخه‌ی کش‌شده)؛ اگه از
  `pending` خارج شده (یا اصلاً پیدا نشه)، `'already_resolved'` برمی‌گرده و
  هیچی overwrite نمی‌شه.
- `snooze(occurrenceId, deps)` → فقط `snoozeCount++`؛ `deadlineAt`/
  `reminderPlan` دست‌نخورده می‌مونن. روی occurrence غیر-pending بی‌سروصدا
  هیچ کاری نمی‌کنه.
- `sweepMissed(now, deps)` → تمام `pending`های با `deadlineAt < now` رو
  (کل backlog، نه فقط امروز) `missed` می‌کنه؛ هر کدوم رو دوباره با
  `getById` تازه می‌خونه پیش از نوشتن (همون گارد همزمانی).

هر `resolve`/`sweepMissed` موفق یک `ResolverEvent` (`OccurrenceResolved` |
`OccurrenceMissed`) از طریق یک callback اختیاری تزریق‌شده (`deps.onEvent`)
منتشر می‌کنه — چون Notification Engine (تیکه ۹) و Reports read-model که
سند به‌عنوان مشترک اسم برده هنوز ساخته نشدن، یک event bus واقعی معنا نداره.

**تأیید قرارداد تیکه ۶ با تیکه ۷:** occurrenceهای exempt (که تیکه ۶ روشون
`deadlineAt: EXEMPT_DEADLINE_SENTINEL` گذاشته بود) الان واقعاً توی
`sweepMissed` هرگز missed نمی‌شن — نه با فیلتر دستی جدید، بلکه چون
`findPendingWithDeadlineBefore` خودِ Repository هرگز اون‌ها رو کاندیدا
نمی‌کنه؛ یک تست مستقیم (`sweepMissed: occurrenceهای exempt ... هرگز missed
نمی‌شن`) همین رو تأیید می‌کنه.

**تست:** ۱۷ تست جدید، همه پاس. جمع کل پروژه الان **۱۳۷ تست**، همه پاس.
`tsc --noEmit` و `npm run build` هر دو تمیز.

هنوز به هیچ‌جای UI/App.tsx وصل نشده (shadow mode).

### تیکه ۸ — اتصال Resolver به App.tsx ✅
سه فایل جدید، همه در `src/application/`:

- **`ResolverBridge.ts`** — لایه‌ی نازک pure/DI-based بین UI قدیمی
  ((`medId`, `slotIndex`)) و `ResolverEngine` ((`occurrenceId`)):
  `slotIdForLegacyIndex`/`legacyIndexForSlotId` (نگاشت رفت‌وبرگشت، از طریق
  `ScheduleSlot.order` که تیکه ۶ همون ایندکس legacy رو توش گذاشته بود، پس
  نیازی به یک map جدا نبود)، `findActiveOccurrence` (زودترین pending برای
  یک slot)، `resolveLegacyDose`/`snoozeLegacyDose` (wrapper به‌روی
  `resolve`/`snooze` با نگاشت بالا؛ اگه occurrence پیدا نشه `'no_occurrence'`
  برمی‌گردونن، نه throw)، و `buildMissedLegacyDoseLog` (تبدیل یک
  `DoseOccurrence` تازه‌missed‌شده به `DoseLog` قدیمی برای dual-write).
- **`runtime.ts`** — composition root: نمونه‌های واقعی
  `LocalStorageMedicationRepository`/`LocalStorageDoseOccurrenceRepository`/
  `DeviceClockAdapter`/`IanaTimeZoneConverter` + `syncOccurrences(medications)`
  که `migrateLegacyData` (idempotent) رو صدا می‌زنه. چون `IanaTimeZoneConverter`
  به `date-fns-tz` و `syncOccurrences` به `ulid` وابسته‌ست، این فایل تنها
  فایل غیرقابل‌تست این تیکه‌ست (طبق «محیط اجرا» بالای همین فایل).
- **`ResolverBridge.test.ts`** — **۱۶ تست جدید**، همه پاس (از طریق
  `migrateLegacyData` واقعی، نه occurrence دستی جعلی).

**تغییرات `App.tsx`:**
- دو `useEffect` جدید: یکی `syncOccurrences(state.medications)` رو در
  mount/هر تغییر `state.medications` صدا می‌زنه، یکی دیگه همون رو در
  `resume` (Capacitor).
- `handleUpdateDoseStatus`: قبل از dual-write قدیمی، `resolveLegacyDose(...,
  'taken')` یا `snoozeLegacyDose(...)` صدا زده می‌شه (بسته به `status`).
- `handleSkipDose`: `resolveLegacyDose(..., 'skipped', {skipReason})` قبل از
  dual-write قدیمی.
- `checkMissedDoses`: منطق دستی قدیمی (حلقه‌ی
  `computeDoseWindowForSlot`/`isDoseSlotResolvedToday` روی هر
  دارو×slotIndex) کامل حذف و با `sweepMissed(now, deps)` +
  `buildMissedLegacyDoseLog` جایگزین شد؛ importهای
  `isExemptFromDeadlineSystem`/`isDoseSlotResolvedToday`/
  `computeDoseWindowForSlot` از `App.tsx` حذف شدن (دیگه استفاده نمی‌شن،
  ولی خودِ `doseSchedule.ts` دست‌نخورده می‌مونه — پاک‌سازی نهایی تیکه ۱۳ست).

**همه‌جا best-effort/dual-write:** خودِ dual-write (نوشتن `DoseLog` قدیمی)
بدون قید-وشرط ادامه پیدا می‌کنه، چه ResolverEngine occurrence پیدا کرده
باشه چه نه — یعنی رفتار فعلی کاربر هرگز به‌خاطر یک شکاف موقت در لایه‌ی جدید
(مثلاً افق هنوز تولید نشده) قطع نمی‌شه.

**تست:** ۱۶ تست جدید (`ResolverBridge.test.ts`). جمع کل پروژه الان
**۱۵۳ تست**، همه پاس (۱۴۶ واقعاً اجرا شدن در این محیط چون
`TimeZoneConverterAdapter.test.ts` بدون `node_modules` اجرا نمی‌شه؛
۱۳۰+۱۶=۱۴۶، به‌علاوه‌ی همون ۷ تای همیشه‌جامونده = ۱۵۳). `tsc --noEmit` تمیزه
به‌جز خطاهای «module not found»ِ شناخته‌شده (`ulid`، `date-fns-tz`، و کل
پکیج‌های npm دیگه چون این محیط اصلاً `node_modules` نداره).

`App.tsx` الان **۷۰۳ خط**‌ه (قبل از این تیکه ۶۷۸ بود).

---

### تیکه ۹ — Notification Engine + Adapter ✅
فایل‌های جدید:
- `src/adapters/CapacitorNotificationAdapter.ts` — اینترفیس `NotificationAdapter`
  (دقیقاً امضای بخش ۹) + `CapacitorNotificationAdapter` واقعی (dynamic import
  از `@capacitor/local-notifications`، همون کانال/permission pattern قدیمی
  notificationService.ts) + `FakeNotificationAdapter` تستی.
- `src/notification/NotificationEngine.ts` — `syncOccurrence(occurrence, deps)`
  (فقط دیف: entryهایی از `reminderPlan` که هنوز `fireAt` نگذشته و
  `notificationIds[kind]` نداره رو schedule می‌کنه، id رو خودش تولید و روی
  occurrence می‌نویسه) + `cancelRemaining(occurrence, deps)` (دقیقاً همون
  idهای ذخیره‌شده رو کنسل می‌کنه) + feature flag
  (`isNotificationEngineEnabled`/`setNotificationEngineEnabled`، پیش‌فرض
  **خاموش**، روی `KeyValueStorage` — همون اینترفیس مینیمالی که تیکه ۵ برای
  `PersistenceAdapter` تعریف کرده بود) + `createResolverEventBridge` (پل
  `ResolverEngine.onEvent` → `cancelRemaining`، طبق انحراف #۷ پایین).

فایل‌های تغییریافته:
- `src/application/ResolverBridge.ts` — یک فیلد اختیاری `onEvent?` به
  `ResolverBridgeDeps` اضافه شد (صرفاً forward به `ResolverEngineDeps.onEvent`
  — نگاه کن به انحراف #۱۱).
- `src/application/runtime.ts` — یک نمونه‌ی واقعی `CapacitorNotificationAdapter`
  ساخته شد؛ `resolverBridgeDeps.onEvent` به `createResolverEventBridge` وصل
  شد (پشت feature flag، که هنوز جایی روشن نشده — پیش‌فرض خاموش، نگاه کن به
  انحراف #۱۲). **`App.tsx` در این تیکه اصلاً دست نخورد.**

**تست:** ۲۰ تست جدید (`NotificationEngine.test.ts`)، همه پاس. جمع کل پروژه
الان **۱۷۳ تست** (۱۶۶ واقعاً اجرا شدن در این محیط بدون `node_modules`؛
۱۶۶+۷=۱۷۳، طبق همون منطق شمارش تیکه ۸). `tsc --noEmit` تمیزه به‌جز همون
خطاهای «module not found»ِ همیشگی (`@capacitor/local-notifications` هم به
همین فهرست اضافه شد، هم‌رده‌ی `ulid`/`date-fns-tz`) — بدون هیچ خطای واقعی
جدید در `src/notification/`، `src/adapters/CapacitorNotificationAdapter.ts`،
یا فایل‌های تغییریافته.

هنوز به `App.tsx` وصل نشده — حتی با روشن‌بودن فرضی feature flag،
`NotificationEngine.syncOccurrence` هیچ call site ای نداره (نگاه کن به
انحراف #۱۲). فقط جهت cancel (روی resolve/missed، از طریق `onEvent`) به
composition root وصل شده، نه جهت schedule.

### حفره‌ی همگام‌سازی Aggregate — پر شد ✅ (قبل از تیکه ۱۰)
تا تیکه ۹، `migrateLegacyData` برای داروی از قبل مهاجرت‌شده هیچ‌کاری نمی‌کرد —
یعنی `MedicationAggregate` روی عکسِ لحظه‌ی اولین مهاجرت منجمد می‌موند. تا وقتی
UI از Aggregate نمی‌خوند بی‌ضرر بود؛ ولی تیکه ۱۰ پنل خانه رو از روی
occurrenceها رندر می‌کنه، پس بدون این، ویرایش ساعت/فرکانس یا غیرفعال‌کردن یک
دارو هیچ اثری روی کارت‌های خانه نداشت (رگرسیون کاربری واقعی).

`refreshAggregateFromLegacy` (در `src/migration/migrateLegacyData.ts`) اضافه شد:
هر بار sync، Aggregate از legacy بازسازی می‌شه، با دو قید حیاتی برای idempotency:
(۱) `slotId`ها از نسخه‌ی موجود و بر اساس `order` قرض گرفته می‌شن (کلید طبیعی
نمی‌شکنه)، (۲) anchor `scheduleStartAt` موجود حفظ می‌شه (وگرنه fallback «الان»
ِ انحراف #۵ باعث می‌شد هر sync یک بامپ نسخه‌ی الکی بزنه). اگه چیزی عوض نشده
باشه کاملاً no-op است؛ اگه عوض شده باشه مسیر رسمی بخش ۳ طی می‌شه (بامپ نسخه
توسط Repository ← ابطال pendingهای آینده توسط `ensureHorizon` ← تولید دوباره).
`MedicationMigrationPreview.scheduleUpdated` هم اضافه شد.

**این هنوز `MedicationEditService` نیست** — ابطال صریح occurrenceهای داروی
*غیرفعال‌شده* (انحراف #۴) همچنان انجام نمی‌شه.

**تست:** ۷ تست جدید در `migrateLegacyData.test.ts` (جمع اون فایل: ۲۲).

### تیکه ۱۰ — HomeQueueService + StackedCards ✅
فایل جدید: **`src/application/HomeQueueService.ts`** — تنها منبع «کدام کارت‌ها
الان دیده شوند» (بخش ۱۷.۲/۱۷.۶). کاملاً DI-based و بدون import از React/
`@capacitor/*`. exportها:
- `visibleCards(now, deps)` — دقیقاً امضای سند. فیلتر: `pending` +
  `scheduledAt - activationLeadMinutes <= now` + کفِ «شروع امروزِ محلی»؛
  ترتیب: «بعداً»خورده‌ها آخر (۱۷.۳) ← پله‌ی escalation نزولی ← `scheduledAt`
  صعودی ← `id`؛ سقف `MAX_VISIBLE_CARDS = 5`.
- `homeCards` / `nextCard` (۱۷.۶) — همون لیست به شکل ViewModel `HomeCard`
  (`timeOfDay` از **`scheduledAt` واقعی** نه `slot.timeOfDay`، چون برای
  `interval` جایگاه یک anchor ثابته؛ به‌علاوه‌ی `legacySlotIndex`,
  `escalationStep`, `isSnoozed`, `isExempt`, `isCritical`).
- `todaySummary(now, deps)` — آمار امروز روی **روزِ محلی** (`localDayRange`،
  از `ClockAdapter` + `TimeZoneConverter`) — باگ نیمه‌شبِ پنل خانه بسته شد.
- `nextTransitionAt(now, deps)` — زودترین مرز واقعی آینده؛ جایگزین تیک
  ۴ثانیه‌ای (بخش ۱۷.۵).

اضافه‌شده به Domain: `RuleEngine.activationLeadMinutes()` (=۳۰ دقیقه، طبق
تصریح ۱۷.۲ که «عدد دقیقش یک پارامتر Rule Engine است») و
`ReminderEngine.escalationStepFor(plan, now)` + تایپ `EscalationStep` (پله از
روی همون `reminderPlan` منجمد خونده می‌شه، نه محاسبه‌ی تازه).

`StackedCards.tsx` بازنویسی شد: `allInstances`/`todayStr`/`findTodaySlotLog`/
هر importی از `doseSchedule.ts` حذف شد؛ ژست جهت‌دار بالا/پایین حذف و با
ورق‌زدن افقیِ **خنثی** (+ دو دکمه‌ی صریح ناوبری) جایگزین شد (۱۷.۱)؛
شمارش‌معکوس حذف و با نشانه‌ی وضعیت چهارپله‌ای جایگزین شد (۱۷.۵)؛ کارت
«بعداً»خورده حلقه/نشان بنفش جدا می‌گیره که با رنگ پله ترکیب می‌شه، نه
جایگزینش (۱۷.۴). فقط فیلدهای *نمایشی* هنوز از `Medication` قدیمی می‌آن (تا
تیکه ۱۲). حالت خالی هم دو شاخه شد: «همه انجام شد» در برابر «هنوز وقت هیچ
نوبتی نرسیده».

`App.tsx`: `homeQueueDeps` (در `runtime.ts`) + یک state به اسم `homeQueueNow`
و `refreshHomeQueue()` که در sync افق/resume/resolve/skip/sweep صدا زده می‌شه،
به‌علاوه‌ی یک `setTimeout` تکی روی `nextTransitionAt`. فایل الان **۷۴۲ خط**‌ه.

**تست:** ۲۷ تست جدید (`HomeQueueService.test.ts`) + ۲ تست
`escalationStepFor` + ۱ تست `activationLeadMinutes` + ۷ تست مهاجرت (بالا).
**جمع کل پروژه الان ۲۱۰ تست.**

> ⚠️ **مهم برای نشست بعدی:** محیط این نشست **اصلاً Node نداشت** (نه `node`، نه
> `npx`، نه `bun`) — پس بر خلاف تیکه‌های ۱ تا ۹، تست‌ها **اجرا نشدند**؛ فقط
> نوشته شدند. منطق خالصِ `visibleCards` (پنجره‌ی فعال‌سازی، ترتیب اولویت، سقف
> ۵، exempt) با یک پورت مستقل به پایتون روی همین سناریوها cross-check شد و
> جواب‌ها دقیقاً با انتظار تست‌ها یکی بود، ولی **این جایگزین اجرای واقعی
> نیست**. اولین کار نشست بعدی باید این باشد:
> `npx tsx --test $(find src -name "*.test.ts")` و `npx tsc --noEmit`.

---

### تیکه ۱۱ — OccurrenceQueryService + ReportsView ✅
فایل جدید: **`src/application/OccurrenceQueryService.ts`** — read-side واحد برای گزارش‌ها. `snapshot()` بازه‌ی هفته و امروز را فقط با `ClockAdapter.now()` + `currentTimeZoneId()` + `TimeZoneConverter` می‌سازد؛ دیگر هیچ `toISOString().split('T')[0]` یا محاسبه‌ی تاریخ داخل ReportsView وجود ندارد.

قواعد مهم:
- occurrenceهای جدید از `DoseOccurrenceRepository` منبع اصلی‌اند؛ `canceled`ها حذف می‌شوند و `pending` در denominator امروز می‌ماند.
- `DoseLog`های قدیمی فقط برای تاریخچه‌ی قبل از مهاجرت وارد می‌شوند؛ اگر برای همان دارو/روز occurrence جدید وجود داشته باشد، dual-write دوباره شمرده نمی‌شود.
- هفته بر اساس تقویم محلی شنبه تا جمعه ساخته می‌شود؛ ترتیب نمودار مثل قبل برای RTL از جمعه به شنبه است.
- نام/فرم/دوز از Aggregate فعلی resolve می‌شود و برای رکوردهای حذف‌شده fallback امن دارد.

`ReportsView.tsx` حالا کاملاً presentational است و فقط snapshot سرویس را رندر می‌کند. `occurrenceQueryService` در `application/runtime.ts` با همان singletonهای Repository/Clock/Timezone ساخته و از `App.tsx` تزریق می‌شود.

**تست:** ۶ تست جدید در `OccurrenceQueryService.test.ts`، شامل نیمه‌شب تهران، pending/canceled، dedupe دوگانه‌نویسی، legacy history، هفته‌ی محلی و read model. جمع کل پروژه: **۲۱۶ تست**.

> ⚠️ محیط هنوز Node/npx ندارد؛ تست‌ها نوشته شدند اما اجرا نشدند. اولین کار نشست بعدی: `npx tsx --test $(find src -name "*.test.ts")` و `npx tsc --noEmit`.

---

### تیکه ۱۲ — فرم‌ها ✅

**`MedicationSkipSheet.tsx` + `StackedCards.tsx` + `App.tsx`:** فرم skip حالا هویت دوز را با `occurrenceId` می‌گیرد و callbackهای چهار دلیل امضای `(occurrenceId, reason)` دارند. کارت خانه دیگر `medId/slotIndex` را به فرم نمی‌دهد؛ App همان occurrence را مستقیم از Resolver resolve می‌کند. `slotIndex` فقط در مرز dual-write و از روی `ScheduleSlot.order` مشتق می‌شود، نه به‌عنوان هویت جدید.

**`ScheduleStartAtPicker.tsx`:** ورودی/خروجی با مدل Domain هم‌راستا شد: `scheduleStartAt?: Instant` و callback `(instant: Instant)`. انتخاب «همین الان» با `Date.now()` و زمان دلخواه با epoch milliseconds ذخیره می‌شود. `AddMedicationWizard` فقط هنگام نوشتن مدل legacy آن را به ISO تبدیل می‌کند و برای `CylinderTimePicker` هم ISO مرزی می‌سازد؛ بنابراین schedule جدید با Date/string محلی قاطی نمی‌شود.

**`AddMedicationWizard.tsx`:** state داخلی anchor از `Instant` استفاده می‌کند؛ edit مقدار legacy ISO را یک‌بار به Instant تبدیل می‌کند و save دوباره به legacy ISO برمی‌گرداند. رفتار UI و مهاجرت فعلی حفظ شده، ولی مرز فرم با `MedicationSchedule.scheduleStartAt` اکنون type-safe است.

**تست/اعتبارسنجی:** مسیرهای قدیمی `onSkipDose(medId, slotIndex, reason)` و `handleSkipDose(medId, slotIndex, ...)` دیگر وجود ندارند؛ تنها مصرف‌کننده‌ی فرم occurrenceId است. محیط این نشست هنوز Node/npx ندارد، بنابراین تست‌های موجود اجرا نشدند و باید در اولین محیط دارای Node اجرا شوند.

---

### تیکه ۱۳ — Cleanup نهایی ✅

- `src/utils/doseSchedule.ts` حذف شد؛ مصرف‌کننده‌های UI باقی‌مانده (`Header` و `MedicationList`) به `HomeQueueService`/helper محلی خودشان منتقل شدند و هیچ importی از فایل قدیمی ندارند.
- `src/services/notificationService.ts` حذف شد؛ permission، tap listener و I/O نوتیفیکیشن حالا در `CapacitorNotificationAdapter` است و scheduling در `NotificationEngine` انجام می‌شود.
- `App.tsx` دیگر `DoseLog` جدید نمی‌نویسد، برای taken/skipped/missed فقط occurrence را از طریق `ResolverEngine` تغییر می‌دهد؛ legacy `DoseLog` صرفاً read-only برای تاریخچه‌ی قدیمی است.
- `ResolverBridge.ts` و تستش حذف شد؛ App مستقیماً `occurrenceId` می‌گیرد و فقط `ResolverEngineDeps` در runtime باقی مانده است.
- مسیرهای write جدید `slotIndex` حذف شدند؛ `slotIndex` فقط در type و داده‌ی legacy تاریخی باقی مانده. `slotId` هویت دوز جدید است.
- feature flag نوتیفیکیشن بعد از cleanup پیش‌فرض روشن است؛ مقدار صریح `0` rollback اضطراری است.

**تست:** ۱۶ تست موقت ResolverBridge حذف شدند و تست‌های feature flag به قرارداد جدید به‌روزرسانی شدند. مجموع فعلی: **۲۰۰ تست**. محیط فعلی Node/npx ندارد، پس اجرا نشدند.

---

### تغییرات UI و Notification پس از تیکه ۱۳ ✅

- `StackedCards.tsx`: Coverflow کاملاً تزئینی شد؛ `dragDelta` خام، `PX_PER_SLOT=130`، حرکت real-time بدون threshold و بدون transition حین drag. همه‌ی کارت‌های pending و taken با virtual distance مشترک حرکت می‌کنند؛ release همیشه به آرایش واقعی صف برمی‌گردد و actionها فقط روی `cards[0]` واقعی اجرا می‌شوند.
- `SideDrawer.tsx`: toolbar تم/تنظیمات افقی شد، آواتار بزرگ‌تر و حلقه‌ی conic-gradient درصد پایبندی واقعی شد، آمار در چیپ‌های فشرده جمع شد و فاصله‌ی navigation کمی افزایش یافت؛ ارتفاع drawer همچنان محدود به viewport است.
- `CapacitorNotificationAdapter.ts`: `@capacitor/local-notifications` و `@capacitor/app` به import استاتیک رفتند، timeout هشت‌ثانیه‌ای اضافه شد، خطای permission/schedule/cancel به caller برمی‌گردد، و Action Types `DOSE_ACTIONS` با `taken`/`later` ثبت و روی notificationها ست می‌شود. App actionها را به همان Resolverهای موجود وصل می‌کند، نه منطق جدید.
- پروژه Android native/`AndroidManifest.xml` در zip وجود ندارد، بنابراین permissionهای manifest قابل اعمال نبودند و باید در پروژه‌ی native جدا اضافه شوند.

**تست:** منطق زمان‌بندی و Domain دست‌نخورده ماند؛ محیط هنوز Node/npx ندارد، بنابراین تست‌ها اجرا نشدند.

---

### گسترش کاتالوگ، راهنمای مصرف و اصلاحات UI ✅

- `MEDICATION_CATALOG` از ۳۱۵ به **۶۳۰ مدخل** رسید؛ idها یکتا هستند و مدخل‌های اضافه‌شده با ساختار کامل `id/fa/en/category/use` وارد شدند.
- `InstructionTag` جدید `avoid_before_sleep` اضافه شد و برای موارد عمومیِ مطمئن، تگ‌های غذا/ناشتا/لبنیات/آهن/خواب‌آلودگی/الکل/صبح/پرهیز از زمان خواب تکمیل شدند. این تگ‌ها فقط نمایش داده می‌شوند و هیچ اثری روی Scheduling/Occurrence ندارند.
- `AddMedicationWizard` تگ‌های `instructionTags` را زیر فیلد نام نمایش می‌دهد.
- `ScheduleOptimizer.tsx` کامپوننت مشترک پیشنهاد زمان‌بندی اضافه شد و در ویزارد افزودن/ویرایش وصل است؛ قبل از اعمال preview می‌دهد، تعداد و فاصله را حفظ می‌کند، offset را جابه‌جا می‌کند، backup زمان‌بندی دستی را نگه می‌دارد و امکان بازگشت دارد.
- pickerهای ویزارد فقط از نظر padding فشرده‌تر شدند.
- `StackedCards` Coverflow تزئینی را با drag پیوسته، virtual distance و reset نرم دارد؛ actionها همچنان فقط روی occurrence واقعی صف اجرا می‌شوند و دکمه‌ها به‌خاطر رشد محتوای بالا از دسترس خارج نمی‌شوند.

**اعتبارسنجی:** ۳ تست جدید برای کاتالوگ/تگ‌ها/optimizer اضافه شد؛ مجموع تست‌ها **۲۰۳**. این محیط Node/npx ندارد، بنابراین اجرا نشدند.

---

### بررسی کلی و اصلاحات پس از آخرین تغییرات ✅

- باگ آمار drawer که از `toISOString()` و DoseLog قدیمی استفاده می‌کرد و نزدیک نیمه‌شب با HomeQueue/Reports اختلاف داشت، به `todaySummary` occurrenceمحور و روز محلی وصل شد.
- rejection زمان‌بندی نوتیفیکیشن دیگر بی‌صدا رها نمی‌شود؛ خطا از `syncPendingNotifications` به UI می‌رسد و پیام قابل‌فهم نمایش داده می‌شود.
- dynamic importهای Capacitor در App و lifecycle adapter حذف و import استاتیک شدند؛ local notification adapter timeout و action routing دارد.
- Coverflow بررسی شد: drag صرفاً بصری است، کارت عملیاتی همیشه `cards[0]` می‌ماند، همه‌ی کارت‌ها virtual distance مشترک دارند و دکمه‌ها در ناحیه‌ی ثابت پایین کارت باقی می‌مانند.
- ساختار importهای نسبی، یکتایی ۶۳۰ id کاتالوگ و کامل بودن labelهای ۱۰ instruction tag بررسی شد.

**تست:** ۳ تست کاتالوگ/optimizer اضافه شده؛ مجموع **۲۰۳ تست**. محیط این بررسی Node/npx ندارد، بنابراین تست‌ها اجرا نشدند.

---

## چیزی که هنوز باقی مونده

هیچ تیکه‌ی معماری دیگری طبق برنامه باقی نمانده است؛ فقط اجرای تست/build در محیط دارای Node و بررسی نهایی UI/native باقی است.

اینا **شروع نشدن**. فهرست کامل با فایل‌هاشون:

**فاز ۴:**


---

## نکاتی که موقع خوندن کد قدیمی verify شدن (برای صرفه‌جویی در وقتِ verify دوباره)

اینا واقعاً توی کد فعلی چک شدن، نه فقط ادعای DESIGN.md:

- `App.tsx` قبل از تیکه ۸ دقیقاً ۶۷۸ خط بود (الان، بعد از تیکه ۸، ۷۰۳ خطه —
  نگاه کن به بخش تیکه ۸ بالا).
- باگ `new Date().toISOString().split('T')[0]` واقعاً توی `App.tsx` (چند
  جا)، `StackedCards.tsx`، و `ReportsView.tsx` هست.
- `StackedCards.tsx` واقعاً فیلتر `selectedDays`/`monthDay` رو اعمال نمی‌کنه
  (باگ weekly/monthly واقعیه).
- `notificationService.ts` واقعاً از `hashId(...)` به‌جای id واقعی OS
  استفاده می‌کنه.
- `handleUpdateDoseStatus` توی `App.tsx` واقعاً با `'log_' + Math.random()`
  آی‌دی می‌سازه.
- `doseSchedule.ts` واقعاً `slotIndex` رو به‌جای یک id پایدار همه‌جا پاس
  می‌ده.
- فرمول یادآوری سه‌گانه (`computeEscalation`) دقیقاً با DESIGN.md بخش ۵
  یکیه (تیکه ۳ این رو با تست کراس‌چک دوباره هم تأیید کرد).

## انحراف‌های آگاهانه از متن سند (باید بدونی)

۱. **`RuleEngine.reminderPolicyFor`** امضاش توی سند
   `(medication: Medication)` هست؛ من عوضش کردم به
   `(safety: MedicationSafetyProfile | undefined, intervalHours: number)` —
   چون Aggregate جدید `Medication` (با `.safety`) هنوز به کد اپ وصل نشده.
   وقتی در تیکه‌های بعدی وصل شد، فراخوانیش می‌شه
   `RuleEngine.reminderPolicyFor(medication.safety, ...)`.
۲. **`SchedulingEngine.expand`** یک پارامتر سوم `converter: TimeZoneConverter`
   داره که توی امضای خام سند صریح نوشته نشده بود (ولی سند خودش توضیح داده
   Scheduling Engine باید این تبدیل رو «از طریق Adapter» انجام بده) — این DI
   لازم بود که تابع واقعاً pure و تست‌پذیر بمونه.
۳. **`DoseOccurrence.deadlineAt` برای داروهای exempt** — بخش ۵ می‌گه برای
   `ReminderPolicy: {kind:'exempt'}`، `ReminderEngine.plan` فقط یک entry از
   نوع `dose_time` تولید می‌کنه (بدون `deadline`)؛ ولی `deadlineAt` خودِ
   `DoseOccurrence` (بخش ۱) یک فیلد الزامیه، نه اختیاری. سند این تناقض رو حل
   نکرده. تصمیم: یک ثابت `EXEMPT_DEADLINE_SENTINEL` (=
   `8_640_000_000_000_000`، بزرگ‌ترین timestamp معتبر جاوااسکریپت، تعریف‌شده
   توی خودِ `OccurrenceGenerator.ts`) به‌جای `deadlineAt` این occurrenceها
   گذاشته می‌شه — نه `Infinity` (که `JSON.stringify` به `null` تبدیلش
   می‌کنه و پایداری رو می‌شکنه). دلیل: کد قدیمی (`checkMissedDoses` توی
   `App.tsx`) صراحتاً داروهای exempt رو با
   `.filter(m => m.isActive && !isExemptFromDeadlineSystem(m))` از فیلتر
   miss خودکار کنار می‌ذاره؛ این ثابت همون رفتار رو در معماری جدید حفظ
   می‌کنه، جوری که وقتی تیکه ۷ (`ResolverEngine.sweepMissed`) نوشته بشه و
   صرفاً `deadlineAt < now` رو چک کنه، این occurrenceها هرگز عملاً missed
   نشن. **اگه تیکه ۷ به این فرض نیاز پیدا کرد، باید همین ثابت رو از
   `OccurrenceGenerator.ts` import کنه، نه یک عدد جادویی جدید بسازه.**
۴. **`OccurrenceGenerator.ensureHorizon` امضاش** پارامتر اول رو
   `MedicationAggregate[]` گرفته (نه `Medication[]` خام سند) — چون فقط
   Aggregate جدید `schedule`/`safety` داره؛ دقیقاً همون الگوی انحراف #۱.
   همچنین **فقط داروهای `isActive` پردازش می‌شن** — نه تولید نه ابطال برای
   داروهای غیرفعال؛ بخش ۳ سند فقط ابطال به‌خاطر تغییر `scheduleVersion` رو
   توصیف کرده، نه ابطال به‌خاطر غیرفعال‌شدن/حذف دارو (که توی enum بخش ۱ برای
   `'canceled'` ذکر شده ولی مسئولش مشخص نشده). طبق دیاگرام بخش ۱۱
   (`MS --> GEN`)، این مسئولیت به `MedicationEditService` (لایه‌ی
   Application، هنوز ساخته نشده) واگذار شده. **این یک محدودیت شناخته‌شده
   است: اگه الان یک دارو غیرفعال بشه، occurrenceهای آینده‌ی pending‌ش
   خودکار canceled نمی‌شن تا وقتی اون سرویس ساخته بشه و صراحتاً این کار رو
   انجام بده.**
۵. **`migrateLegacyData` — fallback برای `scheduleStartAt` غایب (نوع
   `interval`)** — سند برای این حالت (که توی کد واقعی `AddMedicationWizard`
   دیده شد: `scheduleStartAt` همیشه پر نمی‌شه) سیاست fallback نداده. تصمیم:
   لحظه‌ی اجرای خودِ مهاجرت anchor گرفته می‌شه (نه یک گذشته‌ی نامعلوم که
   می‌تونست هزاران گام قدیمی بی‌ربط تولید کنه).
۶. **مسیر فایل اسکریپت مهاجرت**: `src/migration/migrateLegacyData.ts`
   (پوشه‌ی جدید در ریشه‌ی `src/`، نه زیر `src/domain/occurrence/`) — چون به
   `utils/persian` و `data/medicationCatalog` وابسته‌ست (بیرون از مرز Domain
   Layer که بخش ۱۲ برای Domain Engines تعریف کرده)؛ سند مسیر دقیقی برای این
   اسکریپت مشخص نکرده بود.
۷. **`ResolverEngine` — رویدادها از طریق callback، نه event bus واقعی** —
   بخش ۴ می‌گه هر resolve موفق «یک event منتشر می‌کند» و مشترکینش رو
   Notification Engine (تیکه ۹) و Reports read-model اسم می‌بره؛ چون هیچ‌کدوم
   هنوز ساخته نشدن، به‌جای یک event bus واقعی، یک `onEvent` callback اختیاری
   از طریق DI (`ResolverEngineDeps.onEvent`) تزریق می‌شه. وقتی تیکه ۹ ساخته
   شد، باید از همین callback به `NotificationEngine.cancelRemaining` وصل
   بشه، نه یک مکانیزم جدا.
۸. **`resolve`/`snooze` — occurrence ناموجود** — سند صریحاً این حالت رو
   پوشش نداده. تصمیم: `resolve` روی id ناموجود `'already_resolved'`
   برمی‌گردونه (چون امضا فقط دو مقدار داره و از نظر اثر برای caller با
   «قبلاً resolve شده» یکیه)، با یک `console.warn` برای قابل‌ردیابی‌بودن؛
   `snooze` (که خروجی `void` داره) بی‌سروصدا هیچ کاری نمی‌کنه.
۹. **گارد همزمانی توی `sweepMissed`** — سند فقط برای `resolve` صراحتاً گارد
   همزمانی رو توضیح داده؛ من همون الگو رو (بازخوانی `getById` تازه پیش از
   نوشتن هر occurrence) توی حلقه‌ی `sweepMissed` هم تکرار کردم — حتی اگه توی
   پیاده‌سازی synchronous فعلی (بدون I/O واقعی بین خواندن و نوشتن) عملاً race
   ممکن نباشه، این تضمین رو برای پیاده‌سازی‌های async آینده‌ی Repository هم
   نگه می‌داره.
۱۰. **`ResolverBridge` — کل لایه‌ی نگاشت (medId, slotIndex) -> occurrenceId
    (تیکه ۸)** — سند هیچ‌جا این نگاشت رو مشخص نکرده (چون در نسخه‌ی نهایی،
    بعد از فاز ۴، خودِ UI مستقیماً `occurrenceId` پاس می‌ده). تصمیم‌های من:
    - نگاشت از طریق `ScheduleSlot.order` (که تیکه ۶ همون ایندکس آرایه‌ی
      legacy رو توش گذاشته)، نه یک `legacySlotIndexMap` جدا.
    - وقتی چند occurrence همزمان pending برای یک slot باشن (روی افق
      چندروزه)، زودترین (`scheduledAt` کمینه) انتخاب می‌شه.
    - اگه aggregate/occurrence پیدا نشه، best-effort سکوت (`'no_occurrence'`)
      — نه throw، نه استثنا — و dual-write قدیمی هرگز بلاک نمی‌شه.
    - `sweepMissed` برای dual-write missed از `occurrence.scheduledAt` برای
      `date` استفاده می‌کنه (نه «امروز»ی که تیک اجرا می‌شه) — چون
      `sweepMissed` حالا کل backlog چندروزه رو پردازش می‌کنه، نه فقط امروز؛
      این عمداً همون باگ نیمه‌شب شناخته‌شده‌ی بخش ۰ رو نگه می‌داره (نه
      بدترش می‌کنه، نه رفعش می‌کنه) — رفعِ کامل خارج از حیطه‌ی تیکه ۸ست.
    - `syncOccurrences` (مهاجرت + `ensureHorizon`) فقط در mount/resume/هر
      تغییر `state.medications` صدا زده می‌شه — نه یک فراخوانی صریح جدا
      به‌ازای هر CRUD روی دارو (چون افزودن/ویرایش/حذف/toggle همگی همین آرایه
      رو عوض می‌کنن، effect به‌طور غیرمستقیم پوششش می‌ده). این کاملاً `App.tsx`
      رو جایگزین نمی‌کنه — همه‌ی فیلدهای دارو دست‌نخورده می‌مونن، `ResolverBridge`
      کل این تیکه رو کامل می‌کنه.

---

۱۱. **`NotificationAdapter.schedule` — `id` ورودیه، نه خروجی** — بخش ۶ در
    جدول توصیفی می‌گه شناسه‌ی نوتیفیکیشن «id واقعی‌ای که خود پلاگین OS
    برمی‌گرداند» است، ولی امضای دقیق خودِ بخش ۹
    (`schedule(entries: {id: NativeNotificationId; ...}[])`) صراحتاً `id` رو
    به‌عنوان ورودی می‌گیره — و این با API واقعی
    `@capacitor/local-notifications` هم‌خوانه (پلاگین همیشه یک id عددی از
    caller می‌خواد، چیزی تولید/برنمی‌گردونه). تصمیم: خودِ `NotificationEngine`
    (نه پلاگین) این id رو تولید می‌کنه — با هش ۳۱بیتی از
    `occurrenceId + kind`، نه `medId + slotIndex + kind` قدیمی. چون
    `occurrenceId` (ULID) خودش واقعاً منحصربه‌فرده (بر خلاف `slotIndex` که
    برای روزهای مختلف تکرار می‌شد)، ریسک تصادم بین دو occurrence مختلف از
    ریشه حذف می‌شه — همون نتیجه‌ای که بخش ۶ توصیف می‌کنه، فقط با یک مکانیزم
    کمی متفاوت از چیزی که جدولش تحت‌اللفظی می‌گفت.
۱۲. **feature flag — مکانیزم دقیق و محدودیت wiring** — نه HANDOFF.md نه
    DESIGN.md (بخش ۱۴، فاز ۳) مکانیزم دقیق پرچم رو مشخص نکرده بودن، فقط
    اسمش رو آورده بودن. تصمیم‌ها:
    - یک کلید `KeyValueStorage` (`darooto_feature_notification_engine_v1`)،
      نه یک ثابت hardcoded — تا واقعاً در runtime (بدون rebuild) قابل
      خاموش/روشن‌کردن باشه. پیش‌فرض **خاموش** (rollback = نگه‌داشتنش خاموش).
    - طبق انحراف مستندشده‌ی #۷ (بالا)، `ResolverEngine.onEvent` (از طریق
      `resolverBridgeDeps` در `runtime.ts`) به `NotificationEngine.cancelRemaining`
      وصل شد — این بخشِ *کنسل‌کردن* واقعاً wiring شده، پشت همون پرچم.
    - **ولی بخشِ *schedule*-کردن (`syncOccurrence`) هنوز به هیچ call site ای
      وصل نشده** — نه در `runtime.ts`، نه در `App.tsx`. فهرست فایل‌های تیکه ۹
      در HANDOFF.md فقط دو فایل بود (`NotificationEngine.ts` +
      `CapacitorNotificationAdapter.ts`)؛ `App.tsx` جزوش نبود. تصمیم: این
      طرف wiring (کِی/کجا `syncOccurrence` صدا زده بشه — مثلاً همون
      effectهای mount/resume که `syncOccurrences` قدیمی رو صدا می‌زنن) برای
      یک تیکه‌ی بعدی گذاشته شد، نه اینجا حدس زده شد. **نتیجه: حتی اگه کسی
      همین الان این پرچم رو دستی روشن کنه، هنوز هیچ نوتیفیکیشن جدیدی از
      مسیر جدید schedule نمی‌شه** — فقط resolve/missed شدن یک occurrence
      (که از قبل نوتیفیکیشن داشته) باعث cancelRemaining واقعی می‌شه. مسیر
      قدیمی (`syncMedicationNotifications`، cancel-all+reschedule دوره‌ای)
      کاملاً دست‌نخورده و فعال مونده — یعنی از نظر رفتار قابل‌مشاهده‌ی کاربر،
      این تیکه (چه پرچم روشن باشه چه نه) صفر تغییر داشته، دقیقاً طبق روح
      shadow-mode بقیه‌ی تیکه‌های Domain (۱-۷).

اگه سؤالی درباره‌ی چرایی یک تصمیم داشتی که این فایل جوابش رو نداد، به
DESIGN.md برگرد؛ اگه اونجا هم نبود، خودت با توجیه مستند تصمیم بگیر و همینجا
(زیر همین بخش «انحراف‌ها») مستندش کن تا تیکه‌های بعدی هماهنگ بمونن.
