/**
 * Converts English digits to Persian digits
 */
export function toPersianNumbers(str: string | number | undefined | null): string {
  if (str === undefined || str === null) return '';
  const englishToPersianMap: { [key: string]: string } = {
    '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
    '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹'
  };
  return String(str).replace(/[0-9]/g, (char) => englishToPersianMap[char] || char);
}

/**
 * Converts Persian digits to English digits
 */
export function toEnglishNumbers(str: string): string {
  const persianToEnglishMap: { [key: string]: string } = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  return str.replace(/[۰-۹٠-٩]/g, (char) => persianToEnglishMap[char] || char);
}

/**
 * متن فارسی را برای مقایسه نرمال می‌کند:
 * - یکسان‌سازی «ي» عربی با «ی» فارسی
 * - یکسان‌سازی «ك» عربی با «ک» فارسی
 * - حذف نیم‌فاصله (ZWNJ)، Zero Width Joiner و Zero Width Space
 * - جمع کردن فاصله‌های اضافه و trim کردن ابتدا/انتها
 * - lower-case کردن (برای بخش‌های لاتین احتمالی داخل نام)
 *
 * این تابع محل مشترک نرمال‌سازی متن فارسی برای کل پروژه است (استفاده‌شده در
 * src/data/medicationCatalog.ts و src/data/interactionsData.ts) تا از تکرار
 * پیاده‌سازی در چند فایل جلوگیری شود.
 */
export function normalizePersianText(text: string): string {
  return text
    .replace(/\u064A/g, '\u06CC') // ي (Arabic Yeh) -> ی (Persian Yeh)
    .replace(/\u0643/g, '\u06A9') // ك (Arabic Kaf) -> ک (Persian Kaf)
    .replace(/[\u200C\u200D\u200B]/g, '') // ZWNJ / ZWJ / ZWSP
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Formats a date string into a clean Persian representation
 */
export function getPersianTodayString(): string {
  const now = new Date();
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
  } catch {
    return 'امروز، ۵ مرداد ۱۴۰۵';
  }
}

/**
 * Short Persian Day Names for charts
 */
export const PERSIAN_WEEKDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

/**
 * Persian text-to-speech helper (currently unused; kept for potential future accessibility features)
 */
export function speakPersian(text: string, onStart?: () => void, onEnd?: () => void) {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported');
    if (onEnd) onEnd();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fa-IR';
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0;

    if (onStart) utterance.onstart = onStart;
    if (onEnd) utterance.onend = onEnd;
    utterance.onerror = () => { if (onEnd) onEnd(); };

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.error('Error speaking:', e);
    if (onEnd) onEnd();
  }
}

/**
 * Get form icon emoji
 */
export function getFormEmoji(form: string): string {
  switch (form) {
    case 'قرص': return '💊';
    case 'شربت': return '💧';
    case 'آمپول': return '💉';
    case 'قطره': return '💧';
    case 'پماد': return '🧴';
    default: return '💊';
  }
}
