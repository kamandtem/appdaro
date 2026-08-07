import React from 'react';

// SVGهای اصلی ارسالی (بدون تغییر در ساختار)، فقط با رنگ لهجه‌ای هماهنگ‌شده با
// برند (teal-500 اپ) به‌جای رنگ لهجه‌ای اصلی هرکدوم. رنگ پوست، لباس تیره و
// خاکستری‌های خنثی دست‌نخورده باقی مونده‌اند.
import timeManagementRaw from '../../assets/onboarding/undraw_time-management_4ss6.svg?raw';
import medicineRaw from '../../assets/onboarding/Medicine-amico.svg?raw';
import interactionsRaw from '../../assets/onboarding/Warning-amico.svg?raw';

interface IllustrationProps {
  className?: string;
}

const InlineSvg: React.FC<{ markup: string; className?: string }> = ({ markup, className }) => (
  <div
    className={`onboarding-illustration ${className ?? ''}`}
    role="img"
    dangerouslySetInnerHTML={{ __html: markup }}
  />
);

// صفحه‌ی اول: یادآوری هوشمند مصرف دارو
export const ReminderIllustration: React.FC<IllustrationProps> = ({ className }) => (
  <InlineSvg markup={timeManagementRaw} className={className} />
);

// صفحه‌ی دوم: بانک داروهای پرکاربرد
export const MedicationBankIllustration: React.FC<IllustrationProps> = ({ className }) => (
  <InlineSvg markup={medicineRaw} className={className} />
);

// صفحه‌ی سوم: بررسی تداخلات دارویی
export const InteractionsIllustration: React.FC<IllustrationProps> = ({ className }) => (
  <InlineSvg markup={interactionsRaw} className={className} />
);
