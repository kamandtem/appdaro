// ابزار تطبیق داروهای واقعی کاربر (Medication[]) با دیتابیس آفلاین تداخلات دارویی
// (src/data/interactionsData.ts) و استخراج تداخلات موجود بین داروهای واقعاً
// ثبت‌شده‌ی کاربر. کاملاً آفلاین و بدون هیچ فراخوانی شبکه‌ای.

import { Medication } from '../types';
import { normalizePersianText } from './persian';
import {
  DRUGS,
  DrugInfo,
  DRUG_DRUG_INTERACTIONS,
  InteractionSeverity,
  getDrugById
} from '../data/interactionsData';

export interface MatchedUserMedication {
  medication: Medication;
  drug: DrugInfo;
}

export interface UserDrugPairInteraction {
  id: string;
  severity: InteractionSeverity;
  summary: string;
  description: string;
  advice: string;
  medA: Medication;
  medB: Medication;
  drugA: DrugInfo;
  drugB: DrugInfo;
}

export interface UserInteractionCheckResult {
  /** داروهایی که با موفقیت به یک رکورد دیتابیس تداخلات وصل شدند */
  matched: MatchedUserMedication[];
  /** داروهایی که در هیچ‌کدام از دیتابیس‌ها پیدا نشدند (قابل بررسی نبودند) */
  unmatched: Medication[];
  /** همه تداخلات پیدا‌شده بین جفت‌داروهای واقعی کاربر */
  interactions: UserDrugPairInteraction[];
}

/**
 * نام آزاد یک دارو (که کاربر تایپ کرده) را به یک رکورد DrugInfo در دیتابیس
 * تداخلات وصل می‌کند. به ترتیب اولویت زیر تلاش می‌کند:
 * ۱) تطابق دقیق (فارسی نرمال‌شده یا انگلیسی) با نام یا هر یک از alias های دارو
 * ۲) تطابق پیشوندی در هر دو جهت (نام کاربر با نام دارو یا برعکس شروع شود)
 * ۳) تطابق شامل‌بودن (substring) در هر دو جهت
 * اگر هیچ‌کدام موفق نشد، null برمی‌گرداند (یعنی این دارو قابل بررسی نیست).
 */
export function matchMedicationNameToDrug(rawName: string): DrugInfo | null {
  const trimmed = (rawName ?? '').trim();
  if (!trimmed) return null;

  const normFa = normalizePersianText(trimmed);
  const enQ = trimmed.toLowerCase();

  const candidatesFor = (d: DrugInfo) => ({
    fa: [d.name, ...(d.aliases ?? [])].map(normalizePersianText),
    en: [d.en, ...(d.enAliases ?? [])]
      .filter((v): v is string => Boolean(v))
      .map(v => v.toLowerCase())
  });

  // ۱) تطابق دقیق
  for (const d of DRUGS) {
    const { fa, en } = candidatesFor(d);
    if (fa.includes(normFa) || (enQ && en.includes(enQ))) {
      return d;
    }
  }

  // ۲) تطابق پیشوندی (دوطرفه)
  for (const d of DRUGS) {
    const { fa, en } = candidatesFor(d);
    const faPrefix = fa.some(c => c.length > 1 && (normFa.startsWith(c) || c.startsWith(normFa)));
    const enPrefix = enQ && en.some(c => c.length > 1 && (enQ.startsWith(c) || c.startsWith(enQ)));
    if (faPrefix || enPrefix) {
      return d;
    }
  }

  // ۳) تطابق شامل‌بودن (substring، دوطرفه)
  for (const d of DRUGS) {
    const { fa, en } = candidatesFor(d);
    const faContains = fa.some(c => c.length > 2 && (normFa.includes(c) || c.includes(normFa)));
    const enContains = enQ && en.some(c => c.length > 2 && (enQ.includes(c) || c.includes(enQ)));
    if (faContains || enContains) {
      return d;
    }
  }

  return null;
}

/**
 * دارویی که کاربر واقعاً ثبت کرده را به یک رکورد DrugInfo وصل می‌کند. اگر این دارو
 * از اتوکامپلیت یا بخش «داروخانه» انتخاب شده باشد، `catalogId` روی آن ثبت شده و
 * تطبیق مستقیم و قطعی با id انجام می‌شود (نه حدس‌زدن بر اساس شباهت متن). فقط
 * وقتی catalogId موجود نیست (مثلاً دارویی که کاربر آزادانه تایپ کرده) به تطبیق
 * fuzzy نام برمی‌گردیم.
 */
export function getDrugForMedication(med: Medication): DrugInfo | null {
  if (med.catalogId) {
    const byId = getDrugById(med.catalogId);
    if (byId) return byId;
  }
  return matchMedicationNameToDrug(med.name);
}

/**
 * داروهای واقعی ثبت‌شده‌ی کاربر را می‌گیرد، هرکدام را (در صورت امکان) به یک داروی
 * شناخته‌شده در دیتابیس تداخلات وصل می‌کند و همه‌ی تداخلات موجود بین جفت‌داروهای
 * واقعاً ثبت‌شده را برمی‌گرداند. داروهایی که قابل تطبیق نبودند، در نتیجه نهایی به
 * صورت جداگانه (unmatched) گزارش می‌شوند تا نه کرش رخ دهد و نه بی‌سروصدا نادیده
 * گرفته شوند.
 */
export function checkUserMedicationInteractions(medications: Medication[]): UserInteractionCheckResult {
  const matched: MatchedUserMedication[] = [];
  const unmatched: Medication[] = [];

  for (const med of medications) {
    const drug = getDrugForMedication(med);
    if (drug) {
      matched.push({ medication: med, drug });
    } else {
      unmatched.push(med);
    }
  }

  const interactions: UserDrugPairInteraction[] = [];

  for (let i = 0; i < matched.length; i++) {
    for (let j = i + 1; j < matched.length; j++) {
      const m1 = matched[i];
      const m2 = matched[j];

      // دو دارویی که به یک ماده مؤثره‌ی یکسان وصل شدند (مثلاً دو برند متفاوت از یک
      // ژنریک) تداخل با خودشان محسوب نمی‌شوند.
      if (m1.drug.id === m2.drug.id) continue;

      const found = DRUG_DRUG_INTERACTIONS.find(
        int =>
          (int.a === m1.drug.id && int.b === m2.drug.id) ||
          (int.a === m2.drug.id && int.b === m1.drug.id)
      );

      if (found) {
        interactions.push({
          id: found.id,
          severity: found.severity,
          summary: found.summary,
          description: found.description,
          advice: found.advice,
          medA: m1.medication,
          medB: m2.medication,
          drugA: m1.drug,
          drugB: m2.drug
        });
      }
    }
  }

  // خطرناک‌ها همیشه اول
  interactions.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1));

  return { matched, unmatched, interactions };
}
