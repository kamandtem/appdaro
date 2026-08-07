import React, { useState } from 'react';
import { ONBOARDING_SLIDES } from '../../data/initialData';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { speakPersian } from '../../utils/persian';
import { ReminderIllustration, MedicationBankIllustration, InteractionsIllustration } from './illustrations';
import { OnboardingSlide } from '../../types';

interface OnboardingProps {
  onComplete: () => void;
}

const ILLUSTRATION_BY_TYPE: Record<OnboardingSlide['illustration'], React.FC<{ className?: string }>> = {
  reminders: ReminderIllustration,
  medicationBank: MedicationBankIllustration,
  interactions: InteractionsIllustration
};

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const slide = ONBOARDING_SLIDES[currentSlideIndex];
  const Illustration = ILLUSTRATION_BY_TYPE[slide.illustration];
  const isLastSlide = currentSlideIndex === ONBOARDING_SLIDES.length - 1;

  const handleNext = () => {
    if (!isLastSlide) {
      const nextIdx = currentSlideIndex + 1;
      setCurrentSlideIndex(nextIdx);
      speakPersian(ONBOARDING_SLIDES[nextIdx].title);
    } else {
      onComplete();
    }
  };

  // اسواپ به راست/چپ برای رفتن به صفحه‌ی بعد/قبل
  const touchStartX = React.useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const SWIPE_THRESHOLD = 50;
    if (deltaX < -SWIPE_THRESHOLD) {
      handleNext();
    } else if (deltaX > SWIPE_THRESHOLD && currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-gradient-to-br from-[#E0F2F1] via-[#F0FDF4] to-[#E0F7FA] flex flex-col justify-between p-6 sm:p-10 text-[#1A2E35] overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Mesh Orbs — همون افکت پس‌زمینه‌ی بدنه‌ی اصلی اپ */}
      <div className="fixed top-[-100px] left-[-100px] w-80 h-80 bg-teal-300 rounded-full mix-blend-multiply filter blur-3xl opacity-40 pointer-events-none z-0" />
      <div className="fixed bottom-[100px] right-[-50px] w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-40 pointer-events-none z-0" />

      {/* Top Bar */}
      <div className="flex items-center justify-between z-10">
        <span className="text-sm font-bold tracking-wider text-slate-500">
          معرفی داروتو ({currentSlideIndex + 1} از {ONBOARDING_SLIDES.length})
        </span>
        <button
          onClick={onComplete}
          className="text-sm font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-full hover:bg-white/60 transition-colors"
        >
          رد کردن
        </button>
      </div>

      {/* Main Slide Content */}
      <div
        className="flex flex-col items-center text-center max-w-md mx-auto my-auto z-10 animate-in fade-in zoom-in-95 duration-300"
        key={slide.id}
      >
        {/* Illustration */}
        <div className="w-64 h-64 sm:w-72 sm:h-72 mb-8">
          <Illustration className="w-full h-full" />
        </div>

        {/* Text content */}
        <h2 className="text-2xl sm:text-3xl font-black leading-tight mb-4 text-slate-800">
          {slide.title}
        </h2>
        <p className="text-sm sm:text-base text-slate-500 font-medium leading-relaxed max-w-sm px-2">
          {slide.description}
        </p>
      </div>

      {/* Bottom Bar: Indicators & Next Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 max-w-md mx-auto w-full z-10">
        {/* Indicators */}
        <div className="flex items-center gap-2">
          {ONBOARDING_SLIDES.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setCurrentSlideIndex(idx)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                idx === currentSlideIndex
                  ? 'w-8 bg-gradient-to-r from-teal-500 to-emerald-500'
                  : 'w-2.5 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={handleNext}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-teal-500/25 transition-all transform hover:scale-105 active:scale-95"
        >
          <span>{isLastSlide ? 'شروع استفاده از داروتو' : 'مرحله بعد'}</span>
          {isLastSlide ? <CheckCircle2 className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};
