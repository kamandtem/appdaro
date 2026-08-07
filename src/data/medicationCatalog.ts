// دیتابیس مرکزی و یکپارچه‌ی داروها — تنها منبع داده برای:
// افزودن دارو (اتوکامپلیت)، بخش «داروخانه»، جست‌وجو، و پایه‌ی تداخلات دارویی.
//
// این فایل جایگزین دو فایل قبلاً جدا (src/data/medicationNames.ts و آرایه‌ی DRUGS
// در src/data/interactionsData.ts) شده است. آن دو فایل با `id` مستقل و بدون ارتباط
// صریح نگه‌داری می‌شدند و تطبیق بین‌شان با تشابه‌سنجی متن (fuzzy match) در زمان اجرا
// انجام می‌شد. این نسخه هر دارو را با یک `id` پایدار و واحد نگه می‌دارد؛
// src/data/interactionsData.ts اکنون DRUGS را مستقیماً از همین آرایه می‌سازد.
//
// نکته درباره instructionTags: این تگ‌ها فقط برای دسته‌های دارویی با پایه‌ی
// پزشکی/فارماکولوژی کاملاً شناخته‌شده و غیرقابل‌بحث (نه دوز، فقط نحوه‌ی مصرف
// عمومی) از قبل پر شده‌اند؛ اکثر داروها عمداً بدون تگ رها شده‌اند تا اطلاعات
// نادرست حدسی وارد اپ نشود. تکمیل موارد بیشتر باید با بازبینی داروساز/پزشک انجام شود.

import { normalizePersianText } from '../utils/persian';
import { MedicationForm } from '../types';

/** برچسب‌های راهنمای مصرف عمومی — بدون دوز، فقط نحوه/زمان/پرهیزهای شناخته‌شده. */
export type InstructionTag =
  | 'empty_stomach'      // ناشتا مصرف شود
  | 'with_food'          // همراه یا بعد از غذا
  | 'in_morning'         // ترجیحاً صبح
  | 'in_evening'         // ترجیحاً شب
  | 'avoid_dairy'        // با لبنیات مصرف نشود
  | 'avoid_iron_gap'     // با مکمل آهن فاصله داشته باشد
  | 'avoid_tea_coffee'   // با چای/قهوه فاصله داشته باشد
  | 'drowsiness'         // ممکن است خواب‌آلودگی ایجاد کند
  | 'no_alcohol';        // مصرف الکل ممنوع/پرخطر

export const INSTRUCTION_TAG_LABELS: Record<InstructionTag, string> = {
  empty_stomach: 'ناشتا مصرف شود',
  with_food: 'همراه یا بعد از غذا',
  in_morning: 'ترجیحاً صبح مصرف شود',
  in_evening: 'ترجیحاً شب مصرف شود',
  avoid_dairy: 'با لبنیات مصرف نشود',
  avoid_iron_gap: 'با مکمل آهن فاصله بگذارید',
  avoid_tea_coffee: 'با چای/قهوه فاصله بگذارید',
  drowsiness: 'ممکن است خواب‌آلودگی ایجاد کند',
  no_alcohol: 'مصرف هم‌زمان الکل توصیه نمی‌شود'
};

export interface MedicationCatalogEntry {
  /** شناسه پایدار و یکتا — همین id در تداخلات دارویی (DRUG_DRUG_INTERACTIONS /
   *  DRUG_FOOD_INTERACTIONS) و در Medication.catalogId استفاده می‌شود. */
  id: string;
  fa: string;
  en: string;
  aliases?: string[];
  enAliases?: string[];
  category: string;
  /** توضیح کوتاه کاربرد دارو (نمایش در اتوکامپلیت و صفحه داروخانه) */
  use: string;
  instructionTags?: InstructionTag[];
  /** سطح ایمنی برای منطق دوز فراموش‌شده. فقط برای دسته‌های محدودی که قانون
   *  عمومی نصف‌فاصله برایشان به‌خاطر وابستگی به داده‌های شخصی بیمار (هدف INR،
   *  قند خون لحظه‌ای، روز پک قرص ضدبارداری) کفایت نمی‌کند 'critical' گذاشته
   *  شده — نه بر اساس حدس یا خطرناک به نظر رسیدن. اکثر داروها این فیلد را
   *  ندارند و normal فرض می‌شوند. */
  safetyLevel?: 'normal' | 'attention' | 'critical';
  /** فقط برای داروهایی که ذاتاً «تک‌دوزه» هستن (نه یک برنامه‌ی تکرارشونده) — مثل
   *  قرص اورژانسی ضدبارداری. برای این‌ها مفهوم «دوز بعدی» و «ددلاین» بی‌معنیه،
   *  پس کل سیستم دوز فراموش‌شده (ددلاین/یادآوری‌های سه‌گانه/ثبت خودکار missed)
   *  روشون اجرا نمی‌شه. اکثر داروها این فیلد رو ندارن. */
  isSingleDose?: boolean;
  /** فرم(های) دارویی که این محصول مشخصاً با آن‌ها عرضه می‌شود — فقط برای مواردی
   *  پر می‌شود که کاملاً بدون ابهام هستند (مثل قطره چشمی، پماد، یا آمپول
   *  تزریقی). وقتی پر باشد، در ویزارد افزودن دارو فرم به‌طور خودکار انتخاب و
   *  بقیه‌ی گزینه‌ها غیرفعال می‌شوند. برای داروهای چندفرمی (مثل آموکسی‌سیلین که
   *  هم قرص و هم شربت دارد) این فیلد عمداً خالی می‌ماند تا رفتار فعلی (انتخاب
   *  دستی فرم) حفظ شود — حدس زده نمی‌شود. */
  availableForms?: MedicationForm[];
}

export const MEDICATION_CATALOG: MedicationCatalogEntry[] = [
  { id: "apixaban", fa: "آپیکسابان", en: "Apixaban", aliases: ["الیکوئیس"], enAliases: ["Eliquis"], category: "ضدانعقاد خون خوراکی", use: "ضدانعقاد خون خوراکی", safetyLevel: "critical" },
  { id: "atenolol", fa: "آتنولول", en: "Atenolol", category: "داروی فشار خون و قلب (بتابلاکر)", use: "داروی فشار خون و قلب (بتابلاکر)" },
  { id: "atorvastatin", fa: "آتورواستاتین", en: "Atorvastatin", aliases: ["لیپیتور"], enAliases: ["Lipitor"], category: "کاهنده کلسترول (استاتین)", use: "کاهنده کلسترول (استاتین)" },
  { id: "adapalene", fa: "آداپالن", en: "Adapalene", category: "داروی آکنه", use: "داروی آکنه" },
  { id: "azathioprine", fa: "آزاتیوپرین", en: "Azathioprine", category: "سرکوب‌کننده ایمنی (روماتیسم/پیوند)", use: "سرکوب‌کننده ایمنی (روماتیسم/پیوند)" },
  { id: "azithromycin", fa: "آزیترومایسین", en: "Azithromycin", category: "آنتی‌بیوتیک (ماکرولید)", use: "آنتی‌بیوتیک (ماکرولید)" },
  { id: "aspirin", fa: "آسپرین", en: "Aspirin", aliases: ["آسپیرین", "ای‌اس‌ای"], enAliases: ["ASA"], category: "ضددرد و ضدپلاکت", use: "مسکن و ضدپلاکت (پیشگیری از لخته)" },
  { id: "acyclovir", fa: "آسیکلوویر", en: "Acyclovir", category: "ضدویروس (تبخال)", use: "ضدویروس (تبخال)" },
  { id: "augmentin", fa: "آگمنتین", en: "Augmentin", category: "آنتی‌بیوتیک وسیع‌الطیف", use: "آنتی‌بیوتیک وسیع‌الطیف" },
  { id: "albendazole", fa: "آلبندازول", en: "Albendazole", category: "ضدانگل روده", use: "ضدانگل روده" },
  { id: "alprazolam", fa: "آلپرازولام", en: "Alprazolam", aliases: ["زاناکس"], enAliases: ["Xanax"], category: "آرام‌بخش (بنزودیازپین)", use: "آرام‌بخش (بنزودیازپین)", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "alendronate", fa: "آلندرونات", en: "Alendronate", category: "داروی پوکی استخوان", use: "داروی پوکی استخوان" },
  { id: "allopurinol", fa: "آلوپورینول", en: "Allopurinol", category: "داروی نقرس (کاهنده اسید اوریک)", use: "داروی نقرس (کاهنده اسید اوریک)" },
  { id: "ambroxol", fa: "آمبروکسول", en: "Ambroxol", category: "خلط‌آور (سرفه)", use: "خلط‌آور (سرفه)" },
  { id: "ampicillin", fa: "آمپی‌سیلین", en: "Ampicillin", category: "آنتی‌بیوتیک", use: "آنتی‌بیوتیک" },
  { id: "amlodipine", fa: "آملودیپین", en: "Amlodipine", aliases: ["نورواسک"], enAliases: ["Norvasc"], category: "داروی فشار خون (مسدودکننده کانال کلسیم)", use: "داروی فشار خون (مسدودکننده کانال کلسیم)" },
  { id: "amoxicillin", fa: "آموکسی‌سیلین", en: "Amoxicillin", category: "آنتی‌بیوتیک (پنی‌سیلین)", use: "آنتی‌بیوتیک (پنی‌سیلین)" },
  { id: "amoxicillin_clavulanic_acid_co_amoxiclav", fa: "آموکسی‌سیلین کلاوولانیک اسید", en: "Amoxicillin/Clavulanic Acid (Co-amoxiclav)", category: "آنتی‌بیوتیک وسیع‌الطیف", use: "آنتی‌بیوتیک وسیع‌الطیف" },
  { id: "amitriptyline", fa: "آمی‌تریپتیلین", en: "Amitriptyline", category: "ضدافسردگی سه‌حلقه‌ای / ضددرد عصبی", use: "ضدافسردگی سه‌حلقه‌ای / ضددرد عصبی" },
  { id: "amiodarone", fa: "آمیودارون", en: "Amiodarone", aliases: ["کوردارون"], enAliases: ["Cordarone"], category: "ضدآریتمی قلب", use: "ضدآریتمی قلب" },
  { id: "ferrous_sulfate", fa: "آهن (فروس سولفات)", en: "Ferrous Sulfate", category: "مکمل آهن (کم‌خونی)", use: "مکمل آهن (کم‌خونی)" },
  { id: "adalat_nifedipine", fa: "ادالت", en: "Adalat (Nifedipine)", category: "داروی فشار خون (نیفدیپین)", use: "داروی فشار خون (نیفدیپین)" },
  { id: "adalat_cold", fa: "ادالت کلد", en: "Adalat Cold", category: "داروی فشار خون (نیفدیپین، آهسته‌رهش)", use: "داروی فشار خون (نیفدیپین، آهسته‌رهش)" },
  { id: "erythromycin", fa: "اریترومایسین", en: "Erythromycin", category: "آنتی‌بیوتیک (ماکرولید)", use: "آنتی‌بیوتیک (ماکرولید)" },
  { id: "saline_nasal_spray", fa: "اسپری آب دریا", en: "Saline Nasal Spray", category: "شست‌وشوی بینی (احتقان)", use: "شست‌وشوی بینی (احتقان)" },
  { id: "spironolactone", fa: "اسپیرونولاکتون", en: "Spironolactone", aliases: ["آلداکتون"], enAliases: ["Aldactone"], category: "دیورتیک نگه‌دارنده پتاسیم", use: "دیورتیک نگه‌دارنده پتاسیم" },
  { id: "acetaminophen", fa: "استامینوفن", en: "Acetaminophen", aliases: ["پاراستامول", "تایلنول"], enAliases: ["Paracetamol", "Tylenol"], category: "مسکن و تب‌بر", use: "مسکن و تب‌بر" },
  { id: "acetaminophen_caffeine_ibuprofen", fa: "استامینوفن کافئین ایبوپروفن", en: "Acetaminophen + Caffeine + Ibuprofen", category: "مسکن ترکیبی (سردرد و دردهای خفیف)", use: "مسکن ترکیبی (سردرد و دردهای خفیف)" },
  { id: "acetaminophen_codeine", fa: "استامینوفن کدئین", en: "Acetaminophen + Codeine", category: "مسکن قوی (استامینوفن + کدئین)", use: "مسکن قوی (استامینوفن + کدئین)" },
  { id: "estradiol", fa: "استرادیول", en: "Estradiol", category: "هورمون زنانه (یائسگی)", use: "هورمون زنانه (یائسگی)" },
  { id: "acetylcysteine", fa: "استیل‌سیستئین", en: "Acetylcysteine", category: "رقیق‌کننده خلط", use: "رقیق‌کننده خلط" },
  { id: "escitalopram", fa: "اس‌سیتالوپرام", en: "Escitalopram", category: "ضدافسردگی (SSRI)", use: "ضدافسردگی (SSRI)" },
  { id: "folic_acid", fa: "اسید فولیک", en: "Folic Acid", category: "مکمل بارداری / کم‌خونی", use: "مکمل بارداری / کم‌خونی" },
  { id: "afrin", fa: "افرین", en: "Afrin", category: "اسپری ضداحتقان بینی", use: "اسپری ضداحتقان بینی" },
  { id: "acarbose", fa: "اکاربوز", en: "Acarbose", category: "داروی دیابت", use: "داروی دیابت" },
  { id: "oxycodone", fa: "اکسی‌کدون", en: "Oxycodone", category: "مسکن اپیوئیدی قوی", use: "مسکن اپیوئیدی قوی", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "oxymetazoline", fa: "اکسی‌متازولین", en: "Oxymetazoline", category: "قطره/اسپری ضداحتقان بینی", use: "قطره/اسپری ضداحتقان بینی" },
  { id: "oxacillin", fa: "اگزاسیلین", en: "Oxacillin", category: "آنتی‌بیوتیک", use: "آنتی‌بیوتیک" },
  { id: "olanzapine", fa: "الانزاپین", en: "Olanzapine", category: "ضدروان‌پریشی", use: "ضدروان‌پریشی" },
  { id: "empagliflozin", fa: "امپاگلیفلوزین", en: "Empagliflozin", category: "داروی دیابت (SGLT2 inhibitor)", use: "داروی دیابت (SGLT2 inhibitor)" },
  { id: "omeprazole", fa: "امپرازول", en: "Omeprazole", category: "کاهنده اسید معده (PPI)", use: "کاهنده اسید معده (PPI)" },
  { id: "omega_3", fa: "امگا ۳", en: "Omega-3", category: "مکمل چربی مفید (قلب/مغز)", use: "مکمل چربی مفید (قلب/مغز)" },
  { id: "enalapril", fa: "انالاپریل", en: "Enalapril", category: "داروی فشار خون (ACE inhibitor)", use: "داروی فشار خون (ACE inhibitor)" },
  { id: "ondansetron", fa: "اندانسترون", en: "Ondansetron", category: "ضدتهوع قوی", use: "ضدتهوع قوی" },
  { id: "nph_insulin", fa: "انسولین ان‌پی‌اچ", en: "NPH Insulin", category: "انسولین میان‌اثر (دیابت)", use: "انسولین میان‌اثر (دیابت)", safetyLevel: "critical" },
  { id: "regular_insulin", fa: "انسولین رگولار", en: "Regular Insulin", category: "انسولین کوتاه‌اثر (دیابت)", use: "انسولین کوتاه‌اثر (دیابت)", safetyLevel: "critical" },
  { id: "insulin_glargine", fa: "انسولین گلارژین", en: "Insulin Glargine", category: "انسولین طولانی‌اثر (دیابت)", use: "انسولین طولانی‌اثر (دیابت)", safetyLevel: "critical" },
  { id: "enoxaparin", fa: "انوکساپارین", en: "Enoxaparin", category: "ضدانعقاد خون تزریقی", use: "ضدانعقاد خون تزریقی", safetyLevel: "critical", availableForms: ["آمپول"] },
  { id: "ors_oral_rehydration_salts", fa: "اوآرسی", en: "ORS (Oral Rehydration Salts)", category: "جبران آب و املاح (اسهال)", use: "جبران آب و املاح (اسهال)" },
  { id: "oseltamivir", fa: "اوسلتامیویر", en: "Oseltamivir", category: "ضدویروس آنفلوانزا", use: "ضدویروس آنفلوانزا" },
  { id: "ibuprofen", fa: "ایبوپروفن", en: "Ibuprofen", aliases: ["بروفن"], enAliases: ["Brufen"], category: "مسکن ضدالتهاب (NSAID)", use: "مسکن ضدالتهاب (NSAID)", instructionTags: ["with_food"] },
  { id: "ipratropium", fa: "ایپراتروپیوم", en: "Ipratropium", category: "گشادکننده برونش (COPD)", use: "گشادکننده برونش (COPD)" },
  { id: "itraconazole", fa: "ایتراکونازول", en: "Itraconazole", category: "ضدقارچ", use: "ضدقارچ" },
  { id: "irbesartan", fa: "ایربسارتان", en: "Irbesartan", category: "داروی فشار خون (ARB)", use: "داروی فشار خون (ARB)" },
  { id: "isotretinoin", fa: "ایزوترتینوئین", en: "Isotretinoin", aliases: ["آکوتان", "راکوتان"], enAliases: ["Accutane"], category: "داروی آکنه", use: "داروی آکنه", instructionTags: ["with_food"] },
  { id: "isosorbide_dinitrate", fa: "ایزوسورباید دی نیترات", en: "Isosorbide Dinitrate", category: "گشادکننده عروق قلب (آنژین صدری)", use: "گشادکننده عروق قلب (آنژین صدری)" },
  { id: "isosorbide_mononitrate", fa: "ایزوسورباید مونونیترات", en: "Isosorbide Mononitrate", category: "گشادکننده عروق قلب (آنژین صدری)", use: "گشادکننده عروق قلب (آنژین صدری)" },
  { id: "isoniazid", fa: "ایزونیازید", en: "Isoniazid", category: "آنتی‌بیوتیک ضدسل", use: "آنتی‌بیوتیک ضدسل" },
  { id: "imipenem", fa: "ایمی‌پنم", en: "Imipenem", category: "آنتی‌بیوتیک تزریقی قوی", use: "آنتی‌بیوتیک تزریقی قوی", availableForms: ["آمپول"] },
  { id: "indapamide", fa: "اینداپامید", en: "Indapamide", category: "دیورتیک (فشار خون)", use: "دیورتیک (فشار خون)" },
  { id: "indomethacin", fa: "ایندومتاسین", en: "Indomethacin", category: "مسکن ضدالتهاب (NSAID)", use: "مسکن ضدالتهاب (NSAID)", instructionTags: ["with_food"] },
  { id: "baclofen", fa: "باکلوفن", en: "Baclofen", category: "شل‌کننده عضله", use: "شل‌کننده عضله" },
  { id: "betamethasone", fa: "بتامتازون", en: "Betamethasone", category: "کورتیکواستروئید موضعی قوی", use: "کورتیکواستروئید موضعی قوی" },
  { id: "betahistine", fa: "بتاهیستین", en: "Betahistine", category: "داروی سرگیجه (ورتیگو)", use: "داروی سرگیجه (ورتیگو)" },
  { id: "bromhexine", fa: "برم‌هگزین", en: "Bromhexine", category: "خلط‌آور (سرفه)", use: "خلط‌آور (سرفه)" },
  { id: "brufen", fa: "بروفن", en: "Brufen", category: "مسکن و ضدالتهاب (ایبوپروفن)", use: "مسکن و ضدالتهاب (ایبوپروفن)", instructionTags: ["with_food"] },
  { id: "benzoyl_peroxide", fa: "بنزوئیل پروکسید", en: "Benzoyl Peroxide", category: "داروی آکنه", use: "داروی آکنه" },
  { id: "benzocaine", fa: "بنزوکائین", en: "Benzocaine", category: "بی‌حس‌کننده موضعی (دهان/گلو)", use: "بی‌حس‌کننده موضعی (دهان/گلو)" },
  { id: "bupropion", fa: "بوپروپیون", en: "Bupropion", aliases: ["ولبوترین"], enAliases: ["Wellbutrin"], category: "ضدافسردگی / ترک سیگار", use: "ضدافسردگی / ترک سیگار" },
  { id: "budesonide", fa: "بودزوناید", en: "Budesonide", category: "کورتیکواستروئید استنشاقی (آسم)", use: "کورتیکواستروئید استنشاقی (آسم)" },
  { id: "buspirone", fa: "بوسپیرون", en: "Buspirone", category: "ضداضطراب (غیر بنزودیازپین)", use: "ضداضطراب (غیر بنزودیازپین)", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "buscopan", fa: "بوسکوپان", en: "Buscopan", category: "ضداسپاسم روده (هیوسین)", use: "ضداسپاسم روده (هیوسین)" },
  { id: "biperiden", fa: "بیپریدن", en: "Biperiden", category: "کنترل عوارض حرکتی داروهای روان‌پزشکی", use: "کنترل عوارض حرکتی داروهای روان‌پزشکی" },
  { id: "bisacodyl", fa: "بیزاکودیل", en: "Bisacodyl", category: "ملین (یبوست)", use: "ملین (یبوست)" },
  { id: "bisoprolol", fa: "بیزوپرولول", en: "Bisoprolol", category: "داروی فشار خون و قلب (بتابلاکر)", use: "داروی فشار خون و قلب (بتابلاکر)" },
  { id: "bismuth_subsalicylate", fa: "بیسموت ساب سالیسیلات", en: "Bismuth Subsalicylate", category: "ضداسهال و ناراحتی معده", use: "ضداسهال و ناراحتی معده" },
  { id: "biotin", fa: "بیوتین", en: "Biotin", category: "مکمل تقویت مو و ناخن", use: "مکمل تقویت مو و ناخن" },
  { id: "paratel", fa: "پاراتل", en: "Paratel", category: "تب‌بر و مسکن کودکان (استامینوفن)", use: "تب‌بر و مسکن کودکان (استامینوفن)" },
  { id: "parakid", fa: "پاراکید", en: "Parakid", category: "تب‌بر کودکان (استامینوفن)", use: "تب‌بر کودکان (استامینوفن)" },
  { id: "paroxetine", fa: "پاروکستین", en: "Paroxetine", category: "ضدافسردگی (SSRI)", use: "ضدافسردگی (SSRI)" },
  { id: "prednisolone", fa: "پردنیزولون", en: "Prednisolone", category: "کورتیکواستروئید خوراکی (ضدالتهاب)", use: "کورتیکواستروئید خوراکی (ضدالتهاب)", instructionTags: ["with_food"] },
  { id: "permethrin", fa: "پرمترین", en: "Permethrin", category: "ضدشپش و گال", use: "ضدشپش و گال" },
  { id: "propafenone", fa: "پروپافنون", en: "Propafenone", category: "ضدآریتمی قلب", use: "ضدآریتمی قلب" },
  { id: "propranolol", fa: "پروپرانولول", en: "Propranolol", category: "بتابلاکر (فشار خون/اضطراب/میگرن)", use: "بتابلاکر (فشار خون/اضطراب/میگرن)" },
  { id: "propylthiouracil", fa: "پروپیل‌تیواوراسیل", en: "Propylthiouracil", category: "داروی پرکاری تیروئید", use: "داروی پرکاری تیروئید", instructionTags: ["empty_stomach", "in_morning", "avoid_dairy", "avoid_iron_gap", "avoid_tea_coffee"] },
  { id: "progesterone", fa: "پروژسترون", en: "Progesterone", category: "هورمون زنانه (نظم قاعدگی/بارداری)", use: "هورمون زنانه (نظم قاعدگی/بارداری)" },
  { id: "pregabalin", fa: "پره‌گابالین", en: "Pregabalin", category: "ضددرد عصبی", use: "ضددرد عصبی" },
  { id: "pseudoephedrine", fa: "پسودوافدرین", en: "Pseudoephedrine", category: "ضداحتقان بینی", use: "ضداحتقان بینی" },
  { id: "plavix", fa: "پلاویکس", en: "Plavix", category: "ضدپلاکت (کلوپیدوگرل)", use: "ضدپلاکت (کلوپیدوگرل)" },
  { id: "tetracycline_eye_ointment", fa: "پماد چشمی تتراسایکلین", en: "Tetracycline Eye Ointment", category: "آنتی‌بیوتیک چشمی", use: "آنتی‌بیوتیک چشمی", availableForms: ["پماد"] },
  { id: "pantoprazole", fa: "پنتوپرازول", en: "Pantoprazole", category: "کاهنده اسید معده (PPI)", use: "کاهنده اسید معده (PPI)" },
  { id: "penicillin", fa: "پنی‌سیلین", en: "Penicillin", category: "آنتی‌بیوتیک", use: "آنتی‌بیوتیک" },
  { id: "pyrantel", fa: "پیرانتل", en: "Pyrantel", category: "ضدانگل روده (کرم)", use: "ضدانگل روده (کرم)" },
  { id: "piroxicam", fa: "پیروکسیکام", en: "Piroxicam", category: "مسکن ضدالتهاب (NSAID)", use: "مسکن ضدالتهاب (NSAID)", instructionTags: ["with_food"] },
  { id: "pyridoxine_vitamin_b6", fa: "پیریدوکسین", en: "Pyridoxine (Vitamin B6)", category: "مکمل ویتامین B6", use: "مکمل ویتامین B6" },
  { id: "pioglitazone", fa: "پیوگلیتازون", en: "Pioglitazone", category: "داروی دیابت", use: "داروی دیابت" },
  { id: "tadalafil", fa: "تادالافیل", en: "Tadalafil", aliases: ["سیالیس"], enAliases: ["Cialis"], category: "داروی نعوظ", use: "داروی نعوظ" },
  { id: "tamsulosin", fa: "تامسولوسین", en: "Tamsulosin", aliases: ["فلوماکس"], enAliases: ["Flomax"], category: "داروی بزرگی پروستات", use: "داروی بزرگی پروستات" },
  { id: "tamoxifen", fa: "تاموکسیفن", en: "Tamoxifen", category: "داروی هورمونی سرطان پستان", use: "داروی هورمونی سرطان پستان" },
  { id: "tylenol", fa: "تایلنول", en: "Tylenol", category: "مسکن و تب‌بر (استامینوفن)", use: "مسکن و تب‌بر (استامینوفن)" },
  { id: "tylophen", fa: "تایلوفن", en: "Tylophen", category: "تب‌بر کودکان (استامینوفن)", use: "تب‌بر کودکان (استامینوفن)" },
  { id: "theophylline", fa: "تئوفیلین", en: "Theophylline", category: "داروی تنفسی / آسم", use: "گشادکننده برونش (آسم/COPD)" },
  { id: "tetracycline", fa: "تتراسایکلین", en: "Tetracycline", category: "آنتی‌بیوتیک", use: "آنتی‌بیوتیک" },
  { id: "tramadol", fa: "ترامادول", en: "Tramadol", category: "مسکن اپیوئیدی", use: "مسکن اپیوئیدی", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "tretinoin", fa: "ترتینوئین", en: "Tretinoin", category: "داروی آکنه/ضدچروک", use: "داروی آکنه/ضدچروک" },
  { id: "terconazole", fa: "ترکونازول", en: "Terconazole", category: "ضدقارچ موضعی (زنان)", use: "ضدقارچ موضعی (زنان)" },
  { id: "triprolidine", fa: "تری‌پرولیدین", en: "Triprolidine", category: "آنتی‌هیستامین سرماخوردگی", use: "آنتی‌هیستامین سرماخوردگی" },
  { id: "trimetazidine", fa: "تری‌متازیدین", en: "Trimetazidine", category: "داروی آنژین قلبی", use: "داروی آنژین قلبی" },
  { id: "trimethoprim_sulfamethoxazole_co_trimoxazole", fa: "تری‌متوپریم سولفامتوکسازول", en: "Trimethoprim/Sulfamethoxazole (Co-trimoxazole)", category: "آنتی‌بیوتیک عفونت ادراری", use: "آنتی‌بیوتیک عفونت ادراری" },
  { id: "telmisartan", fa: "تلمیسارتان", en: "Telmisartan", category: "داروی فشار خون (ARB)", use: "داروی فشار خون (ARB)" },
  { id: "tizanidine", fa: "تیزانیدین", en: "Tizanidine", category: "شل‌کننده عضله", use: "شل‌کننده عضله" },
  { id: "tinidazole", fa: "تینیدازول", en: "Tinidazole", category: "ضدانگل", use: "ضدانگل", instructionTags: ["no_alcohol"] },
  { id: "gentamicin", fa: "جنتامایسین", en: "Gentamicin", category: "آنتی‌بیوتیک تزریقی (آمینوگلیکوزید)", use: "آنتی‌بیوتیک تزریقی (آمینوگلیکوزید)", availableForms: ["آمپول"] },
  { id: "dapagliflozin", fa: "داپاگلیفلوزین", en: "Dapagliflozin", category: "داروی دیابت (SGLT2 inhibitor)", use: "داروی دیابت (SGLT2 inhibitor)" },
  { id: "doxycycline", fa: "داکسی‌سایکلین", en: "Doxycycline", category: "آنتی‌بیوتیک (تتراسایکلین)", use: "آنتی‌بیوتیک (تتراسایکلین)", instructionTags: ["avoid_dairy", "avoid_iron_gap"] },
  { id: "dramamine", fa: "دراماین", en: "Dramamine", category: "ضدتهوع سفر (دیمن‌هیدرینات)", use: "ضدتهوع سفر (دیمن‌هیدرینات)" },
  { id: "desloratadine", fa: "دسلوراتادین", en: "Desloratadine", category: "آنتی‌هیستامین (آلرژی)", use: "آنتی‌هیستامین (آلرژی)" },
  { id: "dextromethorphan", fa: "دکسترومتورفان", en: "Dextromethorphan", category: "ضدسرفه خشک", use: "ضدسرفه خشک" },
  { id: "dexamethasone", fa: "دگزامتازون", en: "Dexamethasone", category: "کورتیکواستروئید (ضدالتهاب قوی)", use: "کورتیکواستروئید (ضدالتهاب قوی)", instructionTags: ["with_food"] },
  { id: "domperidone", fa: "دومپریدون", en: "Domperidone", category: "ضدتهوع و تسریع تخلیه معده", use: "ضدتهوع و تسریع تخلیه معده" },
  { id: "diazepam", fa: "دیازپام", en: "Diazepam", aliases: ["والیوم"], enAliases: ["Valium"], category: "آرام‌بخش (بنزودیازپین)", use: "آرام‌بخش (بنزودیازپین)", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "dydrogesterone", fa: "دیدروژسترون", en: "Dydrogesterone", category: "هورمون زنانه (حفظ بارداری)", use: "هورمون زنانه (حفظ بارداری)" },
  { id: "diphenoxylate_atropine_lomotil", fa: "دیفنوکسیلات آتروپین", en: "Diphenoxylate/Atropine (Lomotil)", category: "ضداسهال", use: "ضداسهال" },
  { id: "diphenhydramine", fa: "دیفن‌هیدرامین", en: "Diphenhydramine", aliases: ["بنادریل"], enAliases: ["Benadryl"], category: "آنتی‌هیستامین خواب‌آور", use: "آنتی‌هیستامین / خواب‌آور خفیف", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "diclofenac", fa: "دیکلوفناک", en: "Diclofenac", aliases: ["ولتارن"], enAliases: ["Voltaren"], category: "مسکن ضدالتهاب (NSAID)", use: "مسکن ضدالتهاب (NSAID)", instructionTags: ["with_food"] },
  { id: "digoxin", fa: "دیگوکسین", en: "Digoxin", aliases: ["لانوکسین"], enAliases: ["Lanoxin"], category: "داروی قلبی", use: "داروی قلبی (نارسایی قلب/آریتمی)" },
  { id: "diltiazem", fa: "دیلتیازم", en: "Diltiazem", category: "داروی فشار خون و قلب (مسدودکننده کانال کلسیم)", use: "داروی فشار خون و قلب (مسدودکننده کانال کلسیم)" },
  { id: "dimetindene_fenistil", fa: "دیمتیندن", en: "Dimetindene (Fenistil)", category: "آنتی‌هیستامین کودکان", use: "آنتی‌هیستامین کودکان" },
  { id: "dimenhydrinate", fa: "دیمن‌هیدرینات", en: "Dimenhydrinate", category: "ضدتهوع سفر (تهوع حرکتی)", use: "ضدتهوع سفر (تهوع حرکتی)" },
  { id: "rabeprazole", fa: "رابپرازول", en: "Rabeprazole", category: "کاهنده اسید معده (PPI)", use: "کاهنده اسید معده (PPI)" },
  { id: "ranitidine", fa: "رانیتیدین", en: "Ranitidine", category: "کاهنده اسید معده", use: "کاهنده اسید معده" },
  { id: "repaglinide", fa: "رپاگلینید", en: "Repaglinide", category: "داروی دیابت", use: "داروی دیابت" },
  { id: "rosuvastatin", fa: "روزوواستاتین", en: "Rosuvastatin", category: "کاهنده کلسترول (استاتین)", use: "کاهنده کلسترول (استاتین)" },
  { id: "ritalin", fa: "ریتالین", en: "Ritalin", category: "داروی بیش‌فعالی (متیل‌فنیدات)", use: "داروی بیش‌فعالی (متیل‌فنیدات)" },
  { id: "risperidone", fa: "ریسپریدون", en: "Risperidone", category: "ضدروان‌پریشی", use: "ضدروان‌پریشی" },
  { id: "rifampin", fa: "ریفامپین", en: "Rifampin", enAliases: ["Rifampicin"], category: "آنتی‌بیوتیک ضدسل", use: "آنتی‌بیوتیک ضدسل" },
  { id: "rivaroxaban", fa: "ریواروکسابان", en: "Rivaroxaban", aliases: ["زارلتو"], enAliases: ["Xarelto"], category: "ضدانعقاد خون خوراکی", use: "ضدانعقاد خون خوراکی", safetyLevel: "critical" },
  { id: "zolpidem", fa: "زولپیدم", en: "Zolpidem", aliases: ["استیلنوکس"], enAliases: ["Ambien"], category: "قرص خواب", use: "قرص خواب", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "zithromax", fa: "زیترومکس", en: "Zithromax", category: "آنتی‌بیوتیک (ماکرولید)", use: "آنتی‌بیوتیک (ماکرولید)" },
  { id: "zinc_oxide", fa: "زینک اکساید", en: "Zinc Oxide", category: "محافظ پوست (سوختگی/کهنه‌گی)", use: "محافظ پوست (سوختگی/کهنه‌گی)" },
  { id: "zinc_sulfate", fa: "زینک سولفات", en: "Zinc Sulfate", category: "مکمل روی", use: "مکمل روی" },
  { id: "jelfen", fa: "ژلوفن", en: "Jelfen", category: "مسکن و ضدالتهاب (ایبوپروفن)", use: "مسکن و ضدالتهاب (ایبوپروفن)", instructionTags: ["with_food"] },
  { id: "salbutamol", fa: "سالبوتامول", en: "Salbutamol", category: "گشادکننده برونش (آسم)", use: "گشادکننده برونش (آسم)" },
  { id: "salmeterol", fa: "سالمترول", en: "Salmeterol", category: "گشادکننده برونش طولانی‌اثر (آسم)", use: "گشادکننده برونش طولانی‌اثر (آسم)" },
  { id: "salicylic_acid", fa: "سالیسیلیک اسید", en: "Salicylic Acid", category: "لایه‌بردار پوست (آکنه/میخچه)", use: "لایه‌بردار پوست (آکنه/میخچه)" },
  { id: "cimetidine", fa: "سایمتیدین", en: "Cimetidine", category: "کاهنده اسید معده", use: "کاهنده اسید معده" },
  { id: "simethicone", fa: "سایمتیکون", en: "Simethicone", category: "ضدنفخ", use: "ضدنفخ" },
  { id: "cetirizine", fa: "ستیریزین", en: "Cetirizine", category: "آنتی‌هیستامین (آلرژی)", use: "آنتی‌هیستامین (آلرژی)" },
  { id: "sertraline", fa: "سرترالین", en: "Sertraline", aliases: ["زولوفت"], enAliases: ["Zoloft"], category: "ضدافسردگی (SSRI)", use: "ضدافسردگی (SSRI)" },
  { id: "normal_saline", fa: "سرم نمکی", en: "Normal Saline", category: "شست‌وشو و رقیق‌سازی (بینی/تنفسی)", use: "شست‌وشو و رقیق‌سازی (بینی/تنفسی)" },
  { id: "cefazolin", fa: "سفازولین", en: "Cefazolin", category: "آنتی‌بیوتیک تزریقی (سفالوسپورین)", use: "آنتی‌بیوتیک تزریقی (سفالوسپورین)", availableForms: ["آمپول"] },
  { id: "cephalexin", fa: "سفالکسین", en: "Cephalexin", category: "آنتی‌بیوتیک (سفالوسپورین)", use: "آنتی‌بیوتیک (سفالوسپورین)" },
  { id: "cefpodoxime", fa: "سفپودوکسیم", en: "Cefpodoxime", category: "آنتی‌بیوتیک (سفالوسپورین)", use: "آنتی‌بیوتیک (سفالوسپورین)" },
  { id: "ceftriaxone", fa: "سفتریاکسون", en: "Ceftriaxone", category: "آنتی‌بیوتیک تزریقی (سفالوسپورین)", use: "آنتی‌بیوتیک تزریقی (سفالوسپورین)", availableForms: ["آمپول"] },
  { id: "cefdinir", fa: "سفدینیر", en: "Cefdinir", category: "آنتی‌بیوتیک (سفالوسپورین)", use: "آنتی‌بیوتیک (سفالوسپورین)" },
  { id: "cefuroxime", fa: "سفوروکسیم", en: "Cefuroxime", category: "آنتی‌بیوتیک (سفالوسپورین)", use: "آنتی‌بیوتیک (سفالوسپورین)" },
  { id: "cefixime", fa: "سفیکسیم", en: "Cefixime", category: "آنتی‌بیوتیک (سفالوسپورین)", use: "آنتی‌بیوتیک (سفالوسپورین)" },
  { id: "celecoxib", fa: "سلکوکسیب", en: "Celecoxib", category: "مسکن ضدالتهاب (کم‌عارضه گوارشی)", use: "مسکن ضدالتهاب (کم‌عارضه گوارشی)", instructionTags: ["with_food"] },
  { id: "senna", fa: "سنا", en: "Senna", category: "ملین گیاهی (یبوست)", use: "ملین گیاهی (یبوست)" },
  { id: "magnesium_sulfate", fa: "سولفات منیزیم", en: "Magnesium Sulfate", category: "ملین/مکمل منیزیم", use: "ملین/مکمل منیزیم" },
  { id: "sumatriptan", fa: "سوماتریپتان", en: "Sumatriptan", aliases: ["ایمیترکس"], enAliases: ["Imitrex"], category: "داروی میگرن", use: "داروی حمله میگرن" },
  { id: "ciprofloxacin", fa: "سیپروفلوکساسین", en: "Ciprofloxacin", aliases: ["سیپرو"], enAliases: ["Cipro"], category: "آنتی‌بیوتیک (کینولون)", use: "آنتی‌بیوتیک (کینولون)" },
  { id: "sitagliptin", fa: "سیتاگلیپتین", en: "Sitagliptin", category: "داروی دیابت", use: "داروی دیابت" },
  { id: "citalopram", fa: "سیتالوپرام", en: "Citalopram", category: "ضدافسردگی (SSRI)", use: "ضدافسردگی (SSRI)" },
  { id: "cyclobenzaprine", fa: "سیکلوبنزاپرین", en: "Cyclobenzaprine", category: "شل‌کننده عضله", use: "شل‌کننده عضله" },
  { id: "cyclosporine", fa: "سیکلوسپورین", en: "Cyclosporine", category: "سرکوب‌کننده ایمنی (پیوند/پوست)", use: "سرکوب‌کننده ایمنی (پیوند/پوست)" },
  { id: "sildenafil", fa: "سیلدنافیل", en: "Sildenafil", aliases: ["ویاگرا"], enAliases: ["Viagra"], category: "داروی نعوظ", use: "داروی اختلال نعوظ" },
  { id: "silver_sulfadiazine", fa: "سیلور سولفادیازین", en: "Silver Sulfadiazine", category: "پماد سوختگی (ضدعفونی)", use: "پماد سوختگی (ضدعفونی)", availableForms: ["پماد"] },
  { id: "simvastatin", fa: "سیمواستاتین", en: "Simvastatin", aliases: ["زوکور"], enAliases: ["Zocor"], category: "کاهنده کلسترول (استاتین)", use: "کاهنده کلسترول (استاتین)", instructionTags: ["in_evening"] },
  { id: "cinnarizine", fa: "سیناریزین", en: "Cinnarizine", category: "داروی سرگیجه و تهوع حرکتی", use: "داروی سرگیجه و تهوع حرکتی" },
  { id: "ketoconazole_shampoo", fa: "شامپو کتوکونازول", en: "Ketoconazole Shampoo", category: "ضدشوره (ضدقارچ)", use: "ضدشوره (ضدقارچ)" },
  { id: "faramox", fa: "فاراموکس", en: "Faramox", category: "آنتی‌بیوتیک کودکان (آموکسی‌سیلین)", use: "آنتی‌بیوتیک کودکان (آموکسی‌سیلین)" },
  { id: "famotidine", fa: "فاموتیدین", en: "Famotidine", category: "کاهنده اسید معده", use: "کاهنده اسید معده" },
  { id: "fexofenadine", fa: "فکسوفنادین", en: "Fexofenadine", category: "آنتی‌هیستامین (آلرژی، بدون خواب‌آلودگی)", use: "آنتی‌هیستامین (آلرژی، بدون خواب‌آلودگی)" },
  { id: "fluticasone", fa: "فلوتیکازون", en: "Fluticasone", category: "کورتیکواستروئید استنشاقی (آسم)", use: "کورتیکواستروئید استنشاقی (آسم)" },
  { id: "fluoxetine", fa: "فلوکستین", en: "Fluoxetine", aliases: ["پروزاک"], enAliases: ["Prozac"], category: "ضدافسردگی (SSRI)", use: "ضدافسردگی (SSRI)" },
  { id: "fluconazole", fa: "فلوکونازول", en: "Fluconazole", category: "ضدقارچ", use: "ضدقارچ" },
  { id: "fentanyl", fa: "فنتانیل", en: "Fentanyl", category: "مسکن اپیوئیدی قوی (چسب/تزریق)", use: "مسکن اپیوئیدی قوی (چسب/تزریق)", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "phenelzine", fa: "فنلزین", en: "Phenelzine", aliases: ["مهارکننده مونوآمین‌اکسیداز", "MAOI"], enAliases: ["MAOI"], category: "ضدافسردگی (MAOI)", use: "ضدافسردگی (MAOI)", instructionTags: ["no_alcohol"] },
  { id: "phenytoin", fa: "فنی‌توئین", en: "Phenytoin", category: "ضدتشنج (صرع)", use: "ضدتشنج (صرع)" },
  { id: "fenistil", fa: "فنیستیل", en: "Fenistil", category: "آنتی‌هیستامین کودکان (دیمتیندن)", use: "آنتی‌هیستامین کودکان (دیمتیندن)" },
  { id: "furosemide", fa: "فوروزماید", en: "Furosemide", aliases: ["لازیکس"], enAliases: ["Lasix"], category: "دیورتیک قوی", use: "دیورتیک قوی" },
  { id: "fusidic_acid", fa: "فوسیدیک اسید", en: "Fusidic Acid", category: "آنتی‌بیوتیک موضعی پوست", use: "آنتی‌بیوتیک موضعی پوست" },
  { id: "finasteride", fa: "فیناستراید", en: "Finasteride", category: "داروی بزرگی پروستات / ریزش مو", use: "داروی بزرگی پروستات / ریزش مو" },
  { id: "hd_contraceptive_pill", fa: "قرص اچ‌دی", en: "HD Contraceptive Pill", category: "قرص ضدبارداری", use: "قرص ضدبارداری", safetyLevel: "critical" },
  { id: "ld_contraceptive_pill", fa: "قرص ال‌دی", en: "LD Contraceptive Pill", category: "قرص ضدبارداری", use: "قرص ضدبارداری", safetyLevel: "critical" },
  { id: "birth_control", fa: "قرص ضدبارداری ترکیبی", en: "Combined Oral Contraceptive", aliases: ["ال‌دی", "قرص ضدحاملگی"], category: "پیشگیری از بارداری", use: "پیشگیری از بارداری", safetyLevel: "critical" },
  { id: "artificial_tears", fa: "قطره اشک مصنوعی", en: "Artificial Tears", category: "رطوبت‌رسان چشم خشک", use: "رطوبت‌رسان چشم خشک", availableForms: ["قطره"] },
  { id: "ceruminolytic_ear_drop", fa: "قطره باز کننده جرم گوش", en: "Ceruminolytic Ear Drop", category: "نرم‌کننده جرم گوش", use: "نرم‌کننده جرم گوش", availableForms: ["قطره"] },
  { id: "olopatadine_eye_drop", fa: "قطره چشمی اولوپاتادین", en: "Olopatadine Eye Drop", category: "ضدآلرژی چشمی", use: "ضدآلرژی چشمی", availableForms: ["قطره"] },
  { id: "pilocarpine_eye_drop", fa: "قطره چشمی پیلوکارپین", en: "Pilocarpine Eye Drop", category: "داروی گلوکوم (فشار چشم)", use: "داروی گلوکوم (فشار چشم)", availableForms: ["قطره"] },
  { id: "timolol_eye_drop", fa: "قطره چشمی تیمولول", en: "Timolol Eye Drop", category: "داروی گلوکوم (فشار چشم)", use: "داروی گلوکوم (فشار چشم)", availableForms: ["قطره"] },
  { id: "dexamethasone_eye_drop", fa: "قطره چشمی دگزامتازون", en: "Dexamethasone Eye Drop", category: "ضدالتهاب چشمی", use: "ضدالتهاب چشمی", instructionTags: ["with_food"], availableForms: ["قطره"] },
  { id: "ciprofloxacin_eye_drop", fa: "قطره چشمی سیپروفلوکساسین", en: "Ciprofloxacin Eye Drop", category: "آنتی‌بیوتیک چشمی", use: "آنتی‌بیوتیک چشمی", availableForms: ["قطره"] },
  { id: "chloramphenicol_eye_drop", fa: "قطره چشمی کلرامفنیکل", en: "Chloramphenicol Eye Drop", category: "آنتی‌بیوتیک چشمی", use: "آنتی‌بیوتیک چشمی", availableForms: ["قطره"] },
  { id: "latanoprost_eye_drop", fa: "قطره چشمی لاتانوپروست", en: "Latanoprost Eye Drop", category: "داروی گلوکوم (فشار چشم)", use: "داروی گلوکوم (فشار چشم)", availableForms: ["قطره"] },
  { id: "ciprofloxacin_ear_drop", fa: "قطره گوش سیپروفلوکساسین", en: "Ciprofloxacin Ear Drop", category: "آنتی‌بیوتیک گوش", use: "آنتی‌بیوتیک گوش", availableForms: ["قطره"] },
  { id: "captopril", fa: "کاپتوپریل", en: "Captopril", category: "داروی فشار خون (ACE inhibitor)", use: "داروی فشار خون (ACE inhibitor)" },
  { id: "carbamazepine", fa: "کاربامازپین", en: "Carbamazepine", aliases: ["تگرتول"], enAliases: ["Tegretol"], category: "ضدتشنج / تثبیت‌کننده خلق", use: "ضدتشنج / تثبیت‌کننده خلق" },
  { id: "carvedilol", fa: "کارودیلول", en: "Carvedilol", category: "داروی فشار خون و نارسایی قلب (بتابلاکر)", use: "داروی فشار خون و نارسایی قلب (بتابلاکر)" },
  { id: "calamine", fa: "کالامین", en: "Calamine", category: "آرام‌بخش پوست (خارش/آفتاب‌سوختگی)", use: "آرام‌بخش پوست (خارش/آفتاب‌سوختگی)" },
  { id: "ketoprofen", fa: "کتوپروفن", en: "Ketoprofen", category: "مسکن ضدالتهاب (NSAID)", use: "مسکن ضدالتهاب (NSAID)", instructionTags: ["with_food"] },
  { id: "ketoconazole", fa: "کتوکونازول", en: "Ketoconazole", category: "ضدقارچ", use: "ضدقارچ" },
  { id: "codeine", fa: "کدئین", en: "Codeine", category: "مسکن اپیوئیدی / ضدسرفه", use: "مسکن اپیوئیدی / ضدسرفه", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "cromolyn_sodium", fa: "کرومولین سدیم", en: "Cromolyn Sodium", category: "پیشگیری از آلرژی (چشم/بینی)", use: "پیشگیری از آلرژی (چشم/بینی)" },
  { id: "clarithromycin", fa: "کلاریترومایسین", en: "Clarithromycin", category: "آنتی‌بیوتیک (ماکرولید)", use: "آنتی‌بیوتیک (ماکرولید)" },
  { id: "chloramphenicol", fa: "کلرامفنیکل", en: "Chloramphenicol", category: "آنتی‌بیوتیک", use: "آنتی‌بیوتیک" },
  { id: "chlordiazepoxide", fa: "کلردیازپوکساید", en: "Chlordiazepoxide", category: "آرام‌بخش (بنزودیازپین)", use: "آرام‌بخش (بنزودیازپین)", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "chlorpheniramine", fa: "کلرفنیرامین", en: "Chlorpheniramine", category: "آنتی‌هیستامین (آلرژی)", use: "آنتی‌هیستامین (آلرژی)" },
  { id: "chloroquine", fa: "کلروکین", en: "Chloroquine", category: "ضدمالاریا", use: "ضدمالاریا" },
  { id: "calcium_d", fa: "کلسیم دی", en: "Calcium D", category: "مکمل کلسیم و ویتامین D (استخوان)", use: "مکمل کلسیم و ویتامین D (استخوان)" },
  { id: "colchicine", fa: "کلشی‌سین", en: "Colchicine", category: "داروی حمله نقرس", use: "داروی حمله نقرس" },
  { id: "clexane", fa: "کلگزان", en: "Clexane", category: "ضدانعقاد خون تزریقی (انوکساپارین)", use: "ضدانعقاد خون تزریقی (انوکساپارین)", safetyLevel: "critical", availableForms: ["آمپول"] },
  { id: "clobetasol", fa: "کلوبتازول", en: "Clobetasol", category: "کورتیکواستروئید موضعی بسیار قوی", use: "کورتیکواستروئید موضعی بسیار قوی" },
  { id: "clopidogrel", fa: "کلوپیدوگرل", en: "Clopidogrel", category: "ضدپلاکت (پیشگیری از لخته)", use: "ضدپلاکت (پیشگیری از لخته)" },
  { id: "clotrimazole", fa: "کلوتریمازول", en: "Clotrimazole", category: "ضدقارچ موضعی", use: "ضدقارچ موضعی" },
  { id: "cloxacillin", fa: "کلوگزاسیلین", en: "Cloxacillin", category: "آنتی‌بیوتیک", use: "آنتی‌بیوتیک" },
  { id: "clomipramine", fa: "کلومیپرامین", en: "Clomipramine", category: "ضدافسردگی سه‌حلقه‌ای (وسواس)", use: "ضدافسردگی سه‌حلقه‌ای (وسواس)" },
  { id: "clomiphene", fa: "کلومیفن", en: "Clomiphene", category: "داروی تحریک تخمک‌گذاری (ناباروری)", use: "داروی تحریک تخمک‌گذاری (ناباروری)" },
  { id: "clonazepam", fa: "کلونازپام", en: "Clonazepam", category: "آرام‌بخش / ضدتشنج (بنزودیازپین)", use: "آرام‌بخش / ضدتشنج (بنزودیازپین)", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "clonidine", fa: "کلونیدین", en: "Clonidine", category: "داروی فشار خون", use: "داروی فشار خون" },
  { id: "clindamycin", fa: "کلیندامایسین", en: "Clindamycin", category: "آنتی‌بیوتیک", use: "آنتی‌بیوتیک" },
  { id: "coenzyme_q10", fa: "کوآنزیم کیو۱۰", en: "Coenzyme Q10", category: "مکمل آنتی‌اکسیدان (قلب)", use: "مکمل آنتی‌اکسیدان (قلب)" },
  { id: "quetiapine", fa: "کوئتیاپین", en: "Quetiapine", category: "ضدروان‌پریشی / تثبیت خلق", use: "ضدروان‌پریشی / تثبیت خلق" },
  { id: "cholecalciferol_vitamin_d3", fa: "کوله‌کلسیفرول", en: "Cholecalciferol (Vitamin D3)", category: "مکمل ویتامین D3", use: "مکمل ویتامین D3" },
  { id: "gabapentin", fa: "گاباپنتین", en: "Gabapentin", category: "ضددرد عصبی", use: "ضددرد عصبی" },
  { id: "gaviscon", fa: "گاویسکون", en: "Gaviscon", category: "ضد رفلاکس و سوزش سردل", use: "ضد رفلاکس و سوزش سردل" },
  { id: "guaifenesin", fa: "گایافنزین", en: "Guaifenesin", category: "خلط‌آور (سرفه)", use: "خلط‌آور (سرفه)" },
  { id: "glucosamine", fa: "گلوکزامین", en: "Glucosamine", category: "مکمل مفصل (آرتروز)", use: "مکمل مفصل (آرتروز)" },
  { id: "glibenclamide_glyburide", fa: "گلی‌بن‌کلامید", en: "Glibenclamide (Glyburide)", category: "داروی دیابت (سولفونیل‌اوره)", use: "داروی دیابت (سولفونیل‌اوره)" },
  { id: "glipizide", fa: "گلی‌پیزید", en: "Glipizide", category: "داروی دیابت (سولفونیل‌اوره)", use: "داروی دیابت (سولفونیل‌اوره)" },
  { id: "gliclazide", fa: "گلی‌کلازید", en: "Gliclazide", category: "داروی دیابت (سولفونیل‌اوره)", use: "داروی دیابت (سولفونیل‌اوره)" },
  { id: "lactulose", fa: "لاکتولوز", en: "Lactulose", category: "ملین (یبوست)", use: "ملین (یبوست)" },
  { id: "lamotrigine", fa: "لاموتریژین", en: "Lamotrigine", category: "ضدتشنج / تثبیت‌کننده خلق", use: "ضدتشنج / تثبیت‌کننده خلق" },
  { id: "lomotil", fa: "لاموتیل", en: "Lomotil", category: "ضداسهال (دیفنوکسیلات)", use: "ضداسهال (دیفنوکسیلات)" },
  { id: "lantus", fa: "لانتوس", en: "Lantus", category: "انسولین طولانی‌اثر (دیابت)", use: "انسولین طولانی‌اثر (دیابت)", safetyLevel: "critical" },
  { id: "lansoprazole", fa: "لانزوپرازول", en: "Lansoprazole", category: "کاهنده اسید معده (PPI)", use: "کاهنده اسید معده (PPI)" },
  { id: "loperamide", fa: "لوپرامید", en: "Loperamide", category: "ضداسهال", use: "ضداسهال" },
  { id: "levetiracetam", fa: "لوتیراستام", en: "Levetiracetam", category: "ضدتشنج (صرع)", use: "ضدتشنج (صرع)" },
  { id: "loratadine", fa: "لوراتادین", en: "Loratadine", category: "آنتی‌هیستامین (آلرژی، بدون خواب‌آلودگی)", use: "آنتی‌هیستامین (آلرژی، بدون خواب‌آلودگی)" },
  { id: "lorazepam", fa: "لورازپام", en: "Lorazepam", category: "آرام‌بخش (بنزودیازپین)", use: "آرام‌بخش (بنزودیازپین)", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "losartan", fa: "لوزارتان", en: "Losartan", aliases: ["کوزار"], enAliases: ["Cozaar"], category: "داروی فشار خون (ARB)", use: "داروی فشار خون (ARB)" },
  { id: "levothyroxine", fa: "لووتیروکسین", en: "Levothyroxine", aliases: ["لتروکس", "یوتیروکس"], enAliases: ["Letrox", "Eutirox"], category: "داروی تیروئید", use: "داروی کم‌کاری تیروئید", instructionTags: ["empty_stomach", "in_morning", "avoid_dairy", "avoid_iron_gap", "avoid_tea_coffee"] },
  { id: "levodopa", fa: "لوودوپا", en: "Levodopa", aliases: ["سینمت", "لوودوپا کاربی‌دوپا"], enAliases: ["Sinemet", "Levodopa-Carbidopa"], category: "داروی پارکینسون", use: "داروی پارکینسون" },
  { id: "levofloxacin", fa: "لووفلوکساسین", en: "Levofloxacin", category: "آنتی‌بیوتیک (کینولون)", use: "آنتی‌بیوتیک (کینولون)" },
  { id: "levonorgestrel", fa: "لوونورژسترل", en: "Levonorgestrel", category: "قرص اورژانسی ضدبارداری", use: "قرص اورژانسی ضدبارداری", isSingleDose: true },
  { id: "lithium", fa: "لیتیوم", en: "Lithium", category: "تثبیت‌کننده خلق", use: "تثبیت‌کننده خلق" },
  { id: "lithium_carbonate", fa: "لیتیوم کربنات", en: "Lithium Carbonate", category: "تثبیت‌کننده خلق (اختلال دوقطبی)", use: "تثبیت‌کننده خلق (اختلال دوقطبی)" },
  { id: "lidocaine", fa: "لیدوکائین", en: "Lidocaine", category: "بی‌حس‌کننده موضعی", use: "بی‌حس‌کننده موضعی" },
  { id: "lisinopril", fa: "لیزینوپریل", en: "Lisinopril", category: "داروی فشار خون (ACE inhibitor)", use: "داروی فشار خون (ACE inhibitor)" },
  { id: "linezolid", fa: "لینزولید", en: "Linezolid", category: "آنتی‌بیوتیک قوی", use: "آنتی‌بیوتیک قوی" },
  { id: "mebendazole", fa: "مبندازول", en: "Mebendazole", category: "ضدانگل روده (کرم)", use: "ضدانگل روده (کرم)" },
  { id: "mebeverine", fa: "مبورین", en: "Mebeverine", category: "ضداسپاسم روده (سندرم روده تحریک‌پذیر)", use: "ضداسپاسم روده (سندرم روده تحریک‌پذیر)" },
  { id: "methadone", fa: "متادون", en: "Methadone", category: "جایگزین اعتیاد / مسکن اپیوئیدی", use: "جایگزین اعتیاد / مسکن اپیوئیدی", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "metronidazole", fa: "مترونیدازول", en: "Metronidazole", aliases: ["فلاژیل"], enAliases: ["Flagyl"], category: "آنتی‌بیوتیک / ضدانگل", use: "آنتی‌بیوتیک / ضدانگل", instructionTags: ["no_alcohol"] },
  { id: "metformin", fa: "متفورمین", en: "Metformin", aliases: ["گلوکوفاژ"], enAliases: ["Glucophage"], category: "داروی دیابت", use: "داروی دیابت (کاهنده قند خون)" },
  { id: "metoprolol", fa: "متوپرولول", en: "Metoprolol", category: "داروی فشار خون و قلب (بتابلاکر)", use: "داروی فشار خون و قلب (بتابلاکر)" },
  { id: "methotrexate", fa: "متوترکسات", en: "Methotrexate", category: "داروی روماتیسم / سرطان", use: "داروی روماتیسم / سرطان" },
  { id: "metoclopramide", fa: "متوکلوپرامید", en: "Metoclopramide", category: "ضدتهوع و تسریع تخلیه معده", use: "ضدتهوع و تسریع تخلیه معده" },
  { id: "methylprednisolone", fa: "متیل‌پردنیزولون", en: "Methylprednisolone", category: "کورتیکواستروئید (ضدالتهاب)", use: "کورتیکواستروئید (ضدالتهاب)", instructionTags: ["with_food"] },
  { id: "methyldopa", fa: "متیل‌دوپا", en: "Methyldopa", category: "داروی فشار خون (مناسب بارداری)", use: "داروی فشار خون (مناسب بارداری)" },
  { id: "methylphenidate", fa: "متیل‌فنیدات", en: "Methylphenidate", category: "داروی بیش‌فعالی (ADHD)", use: "داروی بیش‌فعالی (ADHD)" },
  { id: "methimazole", fa: "متیمازول", en: "Methimazole", category: "داروی پرکاری تیروئید", use: "داروی پرکاری تیروئید", instructionTags: ["empty_stomach", "in_morning", "avoid_dairy", "avoid_iron_gap", "avoid_tea_coffee"] },
  { id: "meropenem", fa: "مروپنم", en: "Meropenem", category: "آنتی‌بیوتیک تزریقی قوی", use: "آنتی‌بیوتیک تزریقی قوی", availableForms: ["آمپول"] },
  { id: "mesalamine", fa: "مزالازین", en: "Mesalamine", category: "داروی کولیت/بیماری التهابی روده", use: "داروی کولیت/بیماری التهابی روده" },
  { id: "mefenamic_acid", fa: "مفنامیک اسید", en: "Mefenamic Acid", category: "مسکن (دردهای قاعدگی و التهاب خفیف)", use: "مسکن (دردهای قاعدگی و التهاب خفیف)" },
  { id: "iron_supplement", fa: "مکمل آهن", en: "Iron", aliases: ["فروس سولفات", "قرص آهن", "فروفورت", "فروفولیک", "فروگلوبین", "آیروفیکس", "فیفول", "فروسانول"], enAliases: ["Ferrous Sulfate"], category: "مکمل", use: "مکمل", instructionTags: ["avoid_dairy", "avoid_tea_coffee", "empty_stomach"] },
  { id: "potassium_supplement", fa: "مکمل پتاسیم", en: "Potassium", aliases: ["کلرید پتاسیم", "قرص پتاسیم"], enAliases: ["Potassium Chloride"], category: "مکمل", use: "مکمل" },
  { id: "zinc_supplement", fa: "مکمل زینک", en: "Zinc", aliases: ["زینک پلاس", "زینکوویت", "زینک سولفات", "زینک یوروویتال", "زینک آپوویتال", "زینک هلث اید"], enAliases: ["Zinc Sulfate"], category: "مکمل", use: "مکمل" },
  { id: "calcium_supplement", fa: "مکمل کلسیم", en: "Calcium", aliases: ["استئوکر", "کلسیم D", "کلسی‌مکس", "کلسیم سیترات", "کلسیم پلاس", "کلسیم ویتامین D"], enAliases: ["Osteocare"], category: "مکمل", use: "مکمل" },
  { id: "melatonin", fa: "ملاتونین", en: "Melatonin", category: "کمک به خواب (مکمل)", use: "کمک به خواب (مکمل)" },
  { id: "meloxicam", fa: "ملوکسیکام", en: "Meloxicam", category: "مسکن ضدالتهاب (NSAID)", use: "مسکن ضدالتهاب (NSAID)", instructionTags: ["with_food"] },
  { id: "magnesium", fa: "منیزیم", en: "Magnesium", category: "مکمل منیزیم", use: "مکمل منیزیم" },
  { id: "magnesium_vitamin_b6", fa: "منیزیم + ویتامین B6", en: "Magnesium + Vitamin B6", aliases: ["منیزیم B6", "مگنیفورت", "مگترا", "منیزیم یوروویتال", "منیزیم آپوویتال", "منیزیم هلث اید"], enAliases: ["Magnesium B6"], category: "مکمل (منیزیم و ویتامین B6)", use: "مکمل (منیزیم و ویتامین B6)" },
  { id: "mupirocin", fa: "موپیروسین", en: "Mupirocin", category: "آنتی‌بیوتیک موضعی پوست", use: "آنتی‌بیوتیک موضعی پوست" },
  { id: "morphine", fa: "مورفین", en: "Morphine", category: "مسکن اپیوئیدی قوی", use: "مسکن اپیوئیدی قوی", instructionTags: ["drowsiness", "no_alcohol"] },
  { id: "multivitamin", fa: "مولتی ویتامین", en: "Multivitamin", category: "مکمل چندویتامینه", use: "مکمل چندویتامینه" },
  { id: "montelukast", fa: "مونته‌لوکاست", en: "Montelukast", category: "پیشگیری از آسم و آلرژی فصلی", use: "پیشگیری از آسم و آلرژی فصلی" },
  { id: "mirtazapine", fa: "میرتازاپین", en: "Mirtazapine", category: "ضدافسردگی (کمک به خواب/اشتها)", use: "ضدافسردگی (کمک به خواب/اشتها)" },
  { id: "miconazole", fa: "میکونازول", en: "Miconazole", category: "ضدقارچ موضعی", use: "ضدقارچ موضعی" },
  { id: "naproxen", fa: "ناپروکسن", en: "Naproxen", aliases: ["ناپروسین"], enAliases: ["Naprosyn"], category: "مسکن ضدالتهاب (NSAID)", use: "مسکن ضدالتهاب (NSAID)", instructionTags: ["with_food"] },
  { id: "novafen", fa: "نووافن", en: "Novafen", category: "مسکن ترکیبی (سردرد و دردهای خفیف)", use: "مسکن ترکیبی (سردرد و دردهای خفیف)" },
  { id: "nitrofurantoin", fa: "نیتروفورانتوئین", en: "Nitrofurantoin", category: "آنتی‌بیوتیک عفونت ادراری", use: "آنتی‌بیوتیک عفونت ادراری" },
  { id: "nitroglycerin", fa: "نیتروگلیسیرین", en: "Nitroglycerin", aliases: ["قرص زیرزبانی قلب"], category: "گشادکننده عروق قلب", use: "گشادکننده عروق قلب" },
  { id: "nystatin", fa: "نیستاتین", en: "Nystatin", category: "ضدقارچ موضعی/دهانی", use: "ضدقارچ موضعی/دهانی" },
  { id: "nifedipine", fa: "نیفدیپین", en: "Nifedipine", category: "داروی فشار خون (مسدودکننده کانال کلسیم)", use: "داروی فشار خون (مسدودکننده کانال کلسیم)" },
  { id: "vardenafil", fa: "واردنافیل", en: "Vardenafil", aliases: ["لویترا"], enAliases: ["Levitra"], category: "داروی نعوظ", use: "داروی نعوظ" },
  { id: "warfarin", fa: "وارفارین", en: "Warfarin", aliases: ["کومادین"], enAliases: ["Coumadin"], category: "ضدانعقاد خون", use: "ضدانعقاد خون", safetyLevel: "critical" },
  { id: "petroleum_jelly", fa: "وازلین", en: "Petroleum Jelly", category: "نرم‌کننده و محافظ پوست", use: "نرم‌کننده و محافظ پوست" },
  { id: "valacyclovir", fa: "والاسیکلوویر", en: "Valacyclovir", category: "ضدویروس (تبخال/زونا)", use: "ضدویروس (تبخال/زونا)" },
  { id: "valproate", fa: "والپروات سدیم", en: "Sodium Valproate", aliases: ["دپاکین"], enAliases: ["Depakine"], category: "ضدتشنج / تثبیت‌کننده خلق", use: "ضدتشنج / تثبیت‌کننده خلق" },
  { id: "valsartan", fa: "والزارتان", en: "Valsartan", aliases: ["دیووان"], enAliases: ["Diovan"], category: "داروی فشار خون (ARB)", use: "داروی فشار خون (ARB)" },
  { id: "verapamil", fa: "وراپامیل", en: "Verapamil", category: "داروی فشار خون و قلب (مسدودکننده کانال کلسیم)", use: "داروی فشار خون و قلب (مسدودکننده کانال کلسیم)" },
  { id: "velotyl", fa: "ولوتیل", en: "Velotyl", category: "تب‌بر کودکان (استامینوفن)", use: "تب‌بر کودکان (استامینوفن)" },
  { id: "ventolin", fa: "ونتولین", en: "Ventolin", category: "گشادکننده برونش (آسم/سالبوتامول)", use: "گشادکننده برونش (آسم/سالبوتامول)" },
  { id: "vancomycin", fa: "ونکومایسین", en: "Vancomycin", category: "آنتی‌بیوتیک تزریقی قوی", use: "آنتی‌بیوتیک تزریقی قوی", availableForms: ["آمپول"] },
  { id: "venlafaxine", fa: "ونلافاکسین", en: "Venlafaxine", category: "ضدافسردگی (SNRI)", use: "ضدافسردگی (SNRI)" },
  { id: "vitamin_a", fa: "ویتامین آ", en: "Vitamin A", category: "مکمل ویتامین A", use: "مکمل ویتامین A" },
  { id: "vitamin_e", fa: "ویتامین ای", en: "Vitamin E", category: "مکمل ویتامین E (آنتی‌اکسیدان)", use: "مکمل ویتامین E (آنتی‌اکسیدان)" },
  { id: "vitamin_b_complex", fa: "ویتامین ب کمپلکس", en: "Vitamin B Complex", aliases: ["نوروبیون", "ب کمپلکس یوروویتال", "ب کمپلکس آپوویتال", "ب کمپلکس هلث اید", "ب کمپلکس نیچرز پلنتی", "ب کمپلکس دانا", "ویتامین ب۱۲", "اسید فولیک"], enAliases: ["Neurobion", "Vitamin B12", "Folic Acid"], category: "مکمل ویتامین‌های گروه B (شامل B12 و اسید فولیک)", use: "مکمل ویتامین‌های گروه B" },
  { id: "vitamin_b12_cyanocobalamin", fa: "ویتامین ب۱۲", en: "Vitamin B12 (Cyanocobalamin)", category: "مکمل ویتامین B12 (کم‌خونی/اعصاب)", use: "مکمل ویتامین B12 (کم‌خونی/اعصاب)" },
  { id: "vitamin_c", fa: "ویتامین ث", en: "Vitamin C", category: "مکمل ویتامین C", use: "مکمل ویتامین C" },
  { id: "vitamin_d3_cholecalciferol", fa: "ویتامین د۳", en: "Vitamin D3 (Cholecalciferol)", category: "مکمل ویتامین D", use: "مکمل ویتامین D" },
  { id: "vitamin_k", fa: "ویتامین کا", en: "Vitamin K", category: "مکمل ویتامین K (انعقاد خون)", use: "مکمل ویتامین K (انعقاد خون)" },
  { id: "vitamin_d3_supplement", fa: "ویتامین D3", en: "Vitamin D3", aliases: ["ویتامین D3 دانا", "ویتامین D3 یوروویتال", "ویتامین D3 آپوویتال", "ویتامین D3 هلث اید", "ویتامین D3 نیچرز پلنتی", "پرل ویتامین D3"], enAliases: ["Cholecalciferol"], category: "مکمل", use: "مکمل" },
  { id: "vildagliptin", fa: "ویلداگلیپتین", en: "Vildagliptin", category: "داروی دیابت", use: "داروی دیابت" },
  { id: "haloperidol", fa: "هالوپریدول", en: "Haloperidol", category: "ضدروان‌پریشی", use: "ضدروان‌پریشی" },
  { id: "heparin", fa: "هپارین", en: "Heparin", category: "ضدانعقاد خون تزریقی", use: "ضدانعقاد خون تزریقی", safetyLevel: "critical", availableForms: ["آمپول"] },
  { id: "hydralazine", fa: "هیدرالازین", en: "Hydralazine", category: "داروی فشار خون", use: "داروی فشار خون" },
  { id: "hydroxyzine", fa: "هیدروکسی‌زین", en: "Hydroxyzine", category: "آنتی‌هیستامین و ضداضطراب خفیف", use: "آنتی‌هیستامین و ضداضطراب خفیف" },
  { id: "hydroxychloroquine", fa: "هیدروکسی‌کلروکین", en: "Hydroxychloroquine", category: "ضدمالاریا/روماتیسم", use: "ضدمالاریا/روماتیسم" },
  { id: "hydrochlorothiazide", fa: "هیدروکلروتیازید", en: "Hydrochlorothiazide", aliases: ["قرص ادرارآور"], enAliases: ["HCTZ"], category: "دیورتیک", use: "دیورتیک (فشار خون)" },
  { id: "hydrocortisone", fa: "هیدروکورتیزون", en: "Hydrocortisone", category: "کورتیکواستروئید موضعی (خارش/التهاب پوست)", use: "کورتیکواستروئید موضعی (خارش/التهاب پوست)" },
  { id: "hydrocortisone_injection", fa: "هیدروکورتیزون تزریقی", en: "Hydrocortisone Injection", category: "کورتیکواستروئید تزریقی (اورژانس)", use: "کورتیکواستروئید تزریقی (اورژانس)", availableForms: ["آمپول"] },
  { id: "hyoscine_buscopan", fa: "هیوسین", en: "Hyoscine (Buscopan)", category: "ضداسپاسم روده (دل‌درد)", use: "ضداسپاسم روده (دل‌درد)" }
];

// -------------------------------------------------------------------------
// ایندکس جست‌وجو — یک‌بار در زمان بارگذاری ماژول ساخته می‌شود (نه در هر keystroke)
// -------------------------------------------------------------------------
interface IndexedEntry {
  entry: MedicationCatalogEntry;
  faCandidates: string[]; // نام + Aliasهای فارسی، از قبل normalize شده
  enCandidates: string[]; // نام + Aliasهای انگلیسی، از قبل lower-case شده
}

const SEARCH_INDEX: IndexedEntry[] = MEDICATION_CATALOG.map(entry => ({
  entry,
  faCandidates: [entry.fa, ...(entry.aliases ?? [])].map(normalizePersianText),
  enCandidates: [entry.en, ...(entry.enAliases ?? [])].filter(Boolean).map(v => v.toLowerCase())
}));

const PERSIAN_CHAR_REGEX = /[\u0600-\u06FF]/;

export function getCatalogEntryById(id: string): MedicationCatalogEntry | undefined {
  return MEDICATION_CATALOG.find(e => e.id === id);
}

/**
 * جست‌وجوی مشترک روی دیتابیس مرکزی — هم برای اتوکامپلیت «افزودن دارو» و هم برای
 * «داروخانه» استفاده می‌شود، تا یک موتور جست‌وجوی واحد در کل اپ وجود داشته باشد.
 * از ایندکس از‌پیش‌نرمال‌شده استفاده می‌کند (نه محاسبه‌ی normalize روی کل دیتابیس
 * در هر بار فراخوانی)، بنابراین با رشد دیتابیس تا چند هزار مورد هم واکنش‌گر می‌ماند.
 */
export function searchMedicationCatalog(query: string, limit = 20): MedicationCatalogEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const isPersianQuery = PERSIAN_CHAR_REGEX.test(trimmed);
  const normFaQuery = normalizePersianText(trimmed);
  const normEnQuery = trimmed.toLowerCase();

  const faStart: MedicationCatalogEntry[] = [];
  const faWord: MedicationCatalogEntry[] = [];
  const enStart: MedicationCatalogEntry[] = [];
  const enWord: MedicationCatalogEntry[] = [];

  for (const { entry, faCandidates, enCandidates } of SEARCH_INDEX) {
    if (normFaQuery && faCandidates.some(c => c.startsWith(normFaQuery))) {
      faStart.push(entry);
    } else if (normFaQuery && faCandidates.some(c => c.split(' ').some(w => w.startsWith(normFaQuery)))) {
      faWord.push(entry);
    } else if (normEnQuery && enCandidates.some(c => c.startsWith(normEnQuery))) {
      enStart.push(entry);
    } else if (normEnQuery && enCandidates.some(c => c.split(' ').some(w => w.startsWith(normEnQuery)))) {
      enWord.push(entry);
    }
  }

  const orderedGroups = isPersianQuery
    ? [faStart, faWord, enStart, enWord]
    : [enStart, enWord, faStart, faWord];

  const merged: MedicationCatalogEntry[] = [];
  for (const group of orderedGroups) {
    for (const entry of group) {
      if (merged.length >= limit) break;
      if (!merged.some(m => m.id === entry.id)) merged.push(entry);
    }
    if (merged.length >= limit) break;
  }

  return merged;
}
