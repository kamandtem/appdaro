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

// ---------------------------------------------------------------------------
// معماری جدید Dose Occurrence — بخش ۱ سند طراحی (DESIGN.md).
// این تایپ‌ها در کنار DoseLog قدیمی (که legacy می‌ماند) اضافه می‌شوند.
// ---------------------------------------------------------------------------

/** یک جایگاه زمانی ثابت در برنامه‌ی یک دارو (مثلاً «صبح ۰۸:۰۰»). جایگزین
 *  ایندکس خام (`slotIndex`) با یک شناسه‌ی پایدار (`slotId`) — نگاه کن به
 *  بخش «چرا slotId به‌جای slotIndex» در سند. */
export interface ScheduleSlot {
  slotId: string;
  /** ساعت محلی به‌صورت "HH:mm" (اعداد انگلیسی، ۲۴ ساعته). */
  timeOfDay: string;
}

/** برنامه‌ی زمان‌بندی یک دارو — جایگزین فیلدهای پراکنده‌ی
 *  times/frequency/customIntervalHours/selectedDays/monthDay روی Medication. */
export interface MedicationSchedule {
  frequency: FrequencyType;
  slots: ScheduleSlot[];
  customIntervalHours?: number;
  selectedDays?: string[];
  monthDay?: number;
  /** ISO datetime — معادل scheduleStartAt فعلی روی Medication. */
  scheduleStartAt?: string;
}

export type OccurrenceStatus = 'pending' | 'taken' | 'skipped' | 'missed' | 'snoozed';

/** یک وقوعِ منفرد و مشخص از یک دوز — بخش ۱ سند. برخلاف DoseLog (که فقط
 *  رخدادهای resolve‌شده را نگه می‌داشت)، هر occurrence از لحظه‌ی تولید در
 *  Repository وجود دارد، صرف‌نظر از اینکه هنوز pending باشد یا resolve شده. */
export interface DoseOccurrence {
  id: string;
  medId: string;
  slotId: string;
  familyMemberId: string;
  /** لحظه‌ی مطلق (instant) سررسید دوز — نه رشته‌ی تاریخ/ساعت جدا. */
  scheduledAt: string; // ISO datetime
  /** لحظه‌ی مطلق ددلاین (T0 + نصف فاصله، سقف‌خورده با MAX_ALLOWED_DELAY_HOURS). */
  deadlineAt: string; // ISO datetime
  status: OccurrenceStatus;
  /** برنامه‌ی یادآوری منجمدشده در لحظه‌ی تولید — بخش ۵ و بخش ۱۶ (DST). */
  reminderPlan: ReminderPlan;
  /** شناسه‌های نوتیفیکیشن نیتیوی که واقعاً برای این occurrence زمان‌بندی
   *  شده‌اند — برای cancel دقیق (بخش ۶ و ۱۶ - چند Notification). */
  notificationIds: number[];
  /** IANA timezone id در لحظه‌ی تولید — برای regeneration هنگام تغییر
   *  تایم‌زون (بخش ۱۶). */
  timezoneAtGeneration: string;
  snoozeCount: number;
  resolvedAt?: string; // ISO datetime
  skipReason?: SkipReason;
  createdAt: string; // ISO datetime
}

export type ReminderKind = 'r1' | 'r2' | 'deadline';

export interface ReminderPlanEntry {
  kind: ReminderKind;
  /** لحظه‌ی مطلق (instant) — از قبل محاسبه و منجمدشده، نه دوباره‌محاسبه‌شونده. */
  at: string; // ISO datetime
}

export interface ReminderPlan {
  entries: ReminderPlanEntry[];
}

export interface AppState {
  currentTab: NavigationTab;
  familyMembers: FamilyMember[];
  selectedProfileId: string; // 'me' or member id
  medications: Medication[];
  doseLogs: DoseLog[];
  /** بخش ۱ و ۸ سند — Repository جدید Dose Occurrence، در کنار doseLogs قدیمی
   *  (dual-write تا پایان فاز ۴؛ نگاه کن به ResolverEngine و بخش ۱۴). */
  doseOccurrences: DoseOccurrence[];
  /** فاز ۱۰.۱ — پرچم یک‌باره‌ی مهاجرت داده؛ وقتی true شد یعنی
   *  runLegacyToOccurrenceMigration قبلاً روی این دستگاه اجرا شده. */
  hasMigratedOccurrences?: boolean;
  /** آخرین IANA timezone id شناخته‌شده — برای تشخیص تغییر تایم‌زون (بخش ۱۶). */
  lastKnownTimeZoneId?: string;
  isDarkMode: boolean;
  hasSeenOnboarding: boolean;
  hasSeenCardGestureTutorial: boolean;
  hasSeenInteractionsDisclaimer: boolean;
  userName: string;
  userAvatarUrl?: string;
  fontSize: FontSize;
}
