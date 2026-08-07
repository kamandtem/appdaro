import React, { useEffect } from 'react';
import { Logo } from '../common/Logo';

interface SplashScreenProps {
  onFinish: () => void;
}

// اسپلش اسکرین: همیشه در هر بار اجرای برنامه (نه فقط بار اول) دیده می‌شه، روی
// پس‌زمینه‌ی روشن، و شامل دقیقاً سه عنصر: آیکون برنامه، اسم برنامه، و پایین‌تر
// نام برنامه‌نویس. بعد از یک مکث کوتاه خودش به مرحله‌ی بعد می‌ره — بدون نیاز
// به هیچ کلیکی از کاربر.
const SPLASH_DURATION_MS = 1500;

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  useEffect(() => {
    const timer = setTimeout(onFinish, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#FDFEFE] via-[#F6FBFA] to-[#EFF9F7] flex flex-col items-center justify-between py-16 px-8">
      {/* عنصر ۱ و ۲: آیکون برنامه و اسم برنامه، وسط‌چین */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in-95 duration-500">
        <Logo size="xl" showText={false} />
        <h1 className="text-3xl font-black tracking-tight text-slate-800">
          داروتو
        </h1>
      </div>

      {/* عنصر ۳: نام برنامه‌نویس، پایین صفحه و جدا از اسم برنامه */}
      <p className="text-xs font-medium text-slate-400">
        برنامه‌نویس: محمدرضا ارجمند
      </p>
    </div>
  );
};
