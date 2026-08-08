export type MedicationForm = 'قرص' | 'شربت' | 'آمپول' | 'قطره' | 'پماد';

export type TimeOfDay = 'صبح' | 'ظهر' | 'شب' | 'زمان دلخواه';

export type FrequencyType = 'هر روز' | 'هر چند ساعت' | 'روزهای هفته' | 'ماهانه';

export type DoseStatus = 'taken' | 'skipped' | 'pending' | 'snoozed' | 'missed';

/** دلیلی که کاربر برای «مصرف نکردم» یک وعده انتخاب کرده — برای گزارش‌گیری و
 *  برای تصمیم‌گیری در مورد ادامه‌ی چرخه‌ی یادآوری همان دارو استفاده می‌شود
 *  (نگاه کن به src/components/home/MedicationSkipSheet.tsx). */
export type SkipReason = 'timing' | 'side_effects' | 'doctor_advice' | 'out_of_stock';

export interface Medication {
  id: string;
  name: string;
  /** شناسه‌ی این دارو در دیتابیس مرکزی (src/data/medicationCatalog.ts)، در صورتی که
   *  از اتوکامپلیت یا بخش داروخانه انتخاب شده باشد. برای بررسی دقیق و مبتنی‌بر-id
   *  تداخلات دارویی استفاده می‌شود؛ داروهایی که کاربر آزادانه تایپ کرده (بدون
   *  انتخاب از پیشنهادها) این فیلد را ندارند و همچنان با تطابق نام/fuzzy بررسی
   *  می‌شوند. */
  catalogId?: string;
  form: MedicationForm;
  dose: string;
  times: string[]; // e.g. ["۰۸:۰۰", "۱۴:۰۰", "۲۱:۰۰"]
  frequency: FrequencyType;
  customIntervalHours?: number;
  selectedDays?: string[]; // e.g. ["شنبه", "دوشنبه", "چهارشنبه"]
  monthDay?: number; // 1-31 — used when frequency is 'ماهانه' (day of month to take the medication)
  remainingCount: number;
  totalCount: number;
  alertThreshold: number;
  isActive: boolean;
  familyMemberId: string;
  notes?: string;
  instructions?: string; // e.g. "بعد از غذا با یک لیوان آب کامل"
  reason?: string; // e.g. "گلودرد" — why the medication is being taken
  photoUrl?: string; // Base64 or image URL of medication
  createdAt: string;
  scheduleStartAt?: string; // ISO datetime — when the user chose for the dosing schedule to start counting
  /** زمان‌بندی دستی پیش از پیشنهاد optimizer، برای بازگشت کاربر. */
  optimizedScheduleBackup?: { times: string[]; scheduleStartAt?: string };
  /** چرا این دارو غیرفعال شده — فقط وقتی معنا دارد که isActive برابر false باشد.
   *  از طریق دکمه‌ی «مصرف نکردم» روی کارت خانه ست می‌شود (بخش MedicationSkipSheet)؛
   *  اگر کاربر با کلید فعال/غیرفعال در لیست داروها به‌صورت دستی دارو را خاموش/روشن
   *  کند، این فیلد پاک می‌شود. 'awaiting_refill' وضعیت جدا و اختصاصی «در انتظار
   *  تهیه» را نشان می‌دهد و نباید مثل «غیرفعال» عادی (قطع‌شده توسط پزشک/عوارض)
   *  به کاربر نمایش داده شود. */
  pauseReason?: 'side_effects' | 'doctor_advice' | 'awaiting_refill';
}

export interface DoseLog {
  id: string;
  medId: string;
  /** ایندکس این دوز در آرایه‌ی med.times — هر جایگاه زمانی (صبح/ظهر/شب و...)
   *  لاگ مستقل خودش رو داره، تا ثبت یک وعده روی بقیه‌ی وعده‌های همون روز اثر
   *  نذاره. لاگ‌های قدیمی‌تر (قبل از این فیلد) که این مقدار رو ندارن، همه‌جا
   *  به‌عنوان جایگاه ۰ در نظر گرفته می‌شن (نگاه کن به‌جاهایی که `?? 0` دارن). */
  slotIndex: number;
  medName: string;
  medForm: MedicationForm;
  medDose: string;
  scheduledTime: string; // e.g. "۰۸:۰۰ صبح"
  actualTime?: string;
  status: DoseStatus;
  /** فقط برای status === 'skipped' — دلیلی که کاربر از طریق دکمه‌ی «مصرف نکردم»
   *  روی کارت خانه انتخاب کرده. */
  skipReason?: SkipReason;
  date: string; // YYYY-MM-DD
  familyMemberId: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: 'من' | 'مادر' | 'پدر' | 'کودک' | 'همسر' | 'پدربزرگ';
  avatarColor: string;
  bgGradient: string;
  todayStatus: 'completed' | 'pending' | 'warning';
  todayStatusText: string;
  adherenceRate: number; // percentage e.g. 96
}

export interface OnboardingSlide {
  id: number;
  title: string;
  description: string;
  illustration: 'reminders' | 'medicationBank' | 'interactions';
}

export interface AndroidProjectFile {
  id: string;
  path: string;
  name: string;
  language: 'kotlin' | 'xml' | 'gradle' | 'yaml' | 'properties' | 'json';
  category: 'Clean Architecture' | 'UI Compose' | 'Database Room' | 'WorkManager' | 'Gradle & CI/CD' | 'Config';
  description: string;
  content: string;
}

export type NavigationTab = 
  | 'today' 
  | 'medications' 
  | 'reports'
  | 'interactions'
  | 'pharmacy'
  | 'add';

export type FontSize = 'small' | 'medium' | 'large';

export interface AppState {
  currentTab: NavigationTab;
  familyMembers: FamilyMember[];
  selectedProfileId: string; // 'me' or member id
  medications: Medication[];
  doseLogs: DoseLog[];
  isDarkMode: boolean;
  hasSeenOnboarding: boolean;
  hasSeenCardGestureTutorial: boolean;
  hasSeenInteractionsDisclaimer: boolean;
  userName: string;
  userAvatarUrl?: string;
  fontSize: FontSize;
}

// ============================================================================
// Dose Occurrence Architecture — Domain Model (DESIGN.md بخش ۱)
// ============================================================================
//
// این بخش پیاده‌سازی فاز ۰ سند طراحی است (DESIGN.md بخش ۱۴ — «پایه، بدون
// تغییر رفتار کاربر»). این تایپ‌ها صرفاً کنار مدل قدیمی بالا (Medication,
// DoseLog, FrequencyType, AppState) اضافه شده‌اند — هیچ تایپ موجودی تغییر
// نکرده و هیچ‌جای UI/App.tsx فعلاً به این‌ها وصل نیست. اتصال تدریجی طبق
// فازهای ۱ تا ۵ همان سند انجام می‌شود.
//
// نکته درباره‌ی DoseLog (بالا): طبق DESIGN.md بخش ۱۰ (Migration Strategy)،
// رکوردهای DoseLog موجود هرگز بازنویسی نمی‌شوند و برای همیشه به‌عنوان
// «legacy» در کنار DoseOccurrence جدید در گزارش‌ها قابل‌خواندن باقی می‌مانند؛
// این فلگ در فاز مهاجرت داده (فاز ۱) اضافه می‌شود، نه اینجا.

/** لحظه‌ی مطلق زمان — epoch milliseconds (UTC). جایگزین جفتِ «رشته‌ی تاریخ +
 *  رشته‌ی ساعت» قدیمی؛ دقیقاً همان چیزی که باگ نیمه‌شب/DST را از ریشه می‌بندد
 *  (DESIGN.md بخش ۱ - «چرا scheduledAt به‌جای time+date» و بخش ۱۶). */
export type Instant = number;

/** شناسه‌ی یک DoseOccurrence — ULID، در لحظه‌ی تولید (Occurrence Generator،
 *  فاز ۱) ساخته می‌شود. */
export type OccurrenceId = string;

/** id واقعی‌ای که خود پلاگین نوتیفیکیشن OS برمی‌گرداند — نه یک هش حدسی
 *  (DESIGN.md بخش ۶، جدول «تفاوت کلیدی با امروز»). */
export type NativeNotificationId = number | string;

/** روزهای هفته برای frequencyType: 'weekly' — معادل ساختاری همان مقادیر
 *  استفاده‌شده در Medication.selectedDays قدیمی. */
export type Weekday = 'شنبه' | 'یکشنبه' | 'دوشنبه' | 'سه‌شنبه' | 'چهارشنبه' | 'پنجشنبه' | 'جمعه';

/** نوع فرکانس در مدل جدید (DESIGN.md بخش ۱). عمداً هم‌نام با `FrequencyType`
 *  قدیمی (فارسی، بالا) نیست تا با هم تداخل نکنند؛ نگاشت این دو دنیا وظیفه‌ی
 *  اسکریپت مهاجرت است (DESIGN.md بخش ۱۰)، نه این فایل. */
export type ScheduleFrequencyType = 'daily' | 'interval' | 'weekly' | 'monthly';

/** یک جایگاه زمانی مستقل در برنامه‌ی یک دارو (مثلاً «وعده‌ی صبح»).
 *  Value Object — بدون رفتار، فقط داده. */
export interface ScheduleSlot {
  /** شناسه‌ی پایدار — مستقل از ایندکس آرایه. تا وقتی همان «جایگاه مفهومی»
   *  وجود دارد عوض نمی‌شود؛ حذف/افزودن سایر وعده‌ها رویش اثر ندارد
   *  (DESIGN.md بخش ۱ - «چرا slotId به‌جای slotIndex»). */
  slotId: string;
  timeOfDay: { hour: number; minute: number };
  /** فقط برای نمایش/مرتب‌سازی در UI — بخشی از هویت مفهومی نیست. */
  order: number;
}

/** Value Object غیرقابل‌تغییر: هر ویرایش برنامه‌ی یک دارو یک نسخه‌ی جدید
 *  می‌سازد (scheduleVersion بالا می‌رود)، نه mutate روی همان شیء
 *  (DESIGN.md بخش ۱ و ۳). */
export interface MedicationSchedule {
  scheduleVersion: number;
  frequencyType: ScheduleFrequencyType;
  slots: ScheduleSlot[];
  /** فقط برای frequencyType === 'weekly'. */
  selectedWeekdays?: Weekday[];
  /** فقط برای frequencyType === 'monthly' — روز ۱ تا ۳۱. سیاست fallback برای
   *  ماه‌های کوتاه‌تر بر عهده‌ی RuleEngine.monthDayFallback است (DESIGN.md
   *  بخش ۲ و ۷)، نه این تایپ. */
  monthDay?: number;
  /** فقط برای frequencyType === 'interval'. */
  intervalHours?: number;
  scheduleStartAt?: Instant;
  /** شناسه‌ی IANA، مثل 'Asia/Tehran' — صراحتاً ذخیره می‌شود، نه فرض ضمنی روی
   *  تایم‌زون فعلی دستگاه (DESIGN.md بخش ۱ و ۱۶ - «تغییر Time Zone»). */
  timezoneId: string;
}

/** خلاصه‌ی cache‌شده از فیلدهای safetyLevel/isSingleDose کاتالوگ
 *  (src/data/medicationCatalog.ts) — منبع حقیقت همچنان خود کاتالوگ است؛ این
 *  فقط یک مشتق ذخیره‌شده روی خود دارو است تا Rule Engine مجبور به جستجوی
 *  مکرر کاتالوگ نباشد (DESIGN.md بخش ۱ - «Medication Aggregate Root»). */
export interface MedicationSafetyProfile {
  safetyLevel?: 'normal' | 'attention' | 'critical';
  isSingleDose?: boolean;
}

export type ReminderKind = 'dose_time' | 'r1' | 'r2' | 'deadline';

/** سیاست یادآوری یک دارو — خروجی Rule Engine، ورودی Reminder Engine.
 *  `exempt` معادل داروهای safetyLevel: 'critical' یا isSingleDose امروز
 *  (DESIGN.md بخش ۵ و ۷). */
export type ReminderPolicy =
  | { kind: 'exempt' }
  | { kind: 'standard'; intervalHours: number };

/** برنامه‌ی یادآوری یک occurrence — دقیقاً همان فرمول سه‌گانه‌ی امروز
 *  (reminder1 = T0+۱۵m، reminder2 = T0+interval/۴، deadline = T0+min(interval/۲,
 *  MAX_ALLOWED_DELAY_HOURS))، با این تفاوت که یک‌بار در لحظه‌ی تولید محاسبه و
 *  منجمد می‌شود؛ دیگر هیچ‌جای سیستم دوباره با یک «الان» تازه محاسبه‌اش
 *  نمی‌کند (DESIGN.md بخش ۵). */
export interface ReminderPlan {
  entries: { kind: ReminderKind; fireAt: Instant }[];
}

export type OccurrenceStatus =
  | 'pending'    // هنوز تصمیمی ثبت نشده، ددلاین نگذشته
  | 'taken'      // ترمینال — کاربر مصرف کرد
  | 'skipped'    // ترمینال — کاربر «مصرف نکردم» زد (با reason)
  | 'missed'     // ترمینال — Resolver خودکار، چون ددلاین گذشت
  | 'canceled';  // ترمینال — دارو حذف/غیرفعال شد، یا schedule عوض شد و این occurrence دیگر معتبر نیست

/** رخداد واقعی و مستقل مصرف دارو — Aggregate Root مرکزی بازطراحی
 *  (DESIGN.md بخش ۱). به‌محض ساخته‌شدن دیگر تغییر نمی‌کند؛ فقط `status`ش
 *  می‌تواند یک‌بار transition کند — و آن هم فقط از طریق ResolverEngine
 *  (فاز ۲، DESIGN.md بخش ۴)، نه با mutate مستقیم از UI یا سرویس دیگر. */
export interface DoseOccurrence {
  id: OccurrenceId;
  medicationId: string;
  /** ارجاع به ScheduleSlot.slotId — نه به ایندکس آرایه (رفع باگ slotIndex). */
  slotId: string;
  /** از کدام نسخه‌ی MedicationSchedule تولید شده. */
  scheduleVersion: number;
  /** لحظه‌ی مطلق دوز؛ نه رشته‌ی ساعت، نه تاریخ جدا. */
  scheduledAt: Instant;
  deadlineAt: Instant;
  reminderPlan: ReminderPlan;
  status: OccurrenceStatus;
  /** فقط برای status === 'skipped'. */
  statusReason?: SkipReason;
  resolvedAt?: Instant;
  resolvedBy?: 'user' | 'system';
  snoozeCount: number;
  notificationIds: Partial<Record<ReminderKind, NativeNotificationId>>;
  /** برای تشخیص تغییر تایم‌زون دستگاه بعد از تولید این occurrence
   *  (DESIGN.md بخش ۱۶ - «تغییر Time Zone»). */
  timezoneAtGeneration: string;
  createdAt: Instant;
  updatedAt: Instant;
}

/** نسخه‌ی مسطح‌شده (denormalized) از یک DoseOccurrence حل‌شده — Read Model
 *  سبک برای ReportsView و برای فشرده‌سازی occurrenceهای ترمینال قدیمی (بخش
 *  retention، DESIGN.md بخش ۸). DoseLog قدیمی هم با flag `legacy: true` در
 *  کنار این‌ها باقی می‌ماند (DESIGN.md بخش ۱ و ۱۰). */
export interface DoseHistoryRecord {
  id: string;
  occurrenceId: OccurrenceId;
  medicationId: string;
  medName: string;
  medForm: MedicationForm;
  medDose: string;
  slotId: string;
  scheduledAt: Instant;
  resolvedAt?: Instant;
  status: OccurrenceStatus;
  statusReason?: SkipReason;
  familyMemberId: string;
  legacy: false;
}

/**
 * Medication Aggregate Root نسخه‌ی جدید (DESIGN.md بخش ۱: «Medication
 * (Aggregate Root)»). عمداً هم‌نام با `Medication` قدیمی (بالای همین فایل)
 * نیست — طبق تصمیم تیکه ۱، آن تایپ قدیمی دست‌نخورده می‌ماند تا کد فعلی
 * (App.tsx، AddMedicationWizard، ...) نشکند؛ این تایپ فقط پشت Repository
 * Layer (تیکه ۵ به بعد) زندگی می‌کند تا وقتی UI هم به آن وصل شود (تیکه ۱۲).
 *
 * تفاوت با `Medication` قدیمی دقیقاً همون چیزیه که سند گفته «بدون تغییر
 * نسبت به امروز» به‌جز این دو مورد:
 *   - فیلدهای پراکنده‌ی زمان‌بندی (`times`, `frequency`, `customIntervalHours`,
 *     `selectedDays`, `monthDay`, `scheduleStartAt`) با یک `schedule: MedicationSchedule`
 *     واحد جایگزین شدن.
 *   - `safety: MedicationSafetyProfile` اضافه شده (cache از کاتالوگ).
 * بقیه‌ی فیلدها (شامل `pauseReason` با همون union قدیمی) عیناً حفظ شدن.
 */
export interface MedicationAggregate {
  id: string;
  name: string;
  catalogId?: string;
  form: MedicationForm;
  dose: string;
  schedule: MedicationSchedule;
  safety: MedicationSafetyProfile;
  remainingCount: number;
  totalCount: number;
  alertThreshold: number;
  isActive: boolean;
  familyMemberId: string;
  notes?: string;
  instructions?: string;
  reason?: string;
  photoUrl?: string;
  createdAt: string;
  pauseReason?: 'side_effects' | 'doctor_advice' | 'awaiting_refill';
}
