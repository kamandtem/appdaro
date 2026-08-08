import React, { useRef, useState } from 'react';
import { 
  Home, 
  Pill, 
  BarChart3,
  ShieldAlert,
  Store,
  Moon, 
  Sun, 
  Send, 
  Instagram, 
  Camera,
  Star,
  User,
  Settings as SettingsIcon
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { toPersianNumbers } from '../../utils/persian';
import { resizeImageFile } from '../../utils/image';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenSettings: () => void;
  userName?: string;
  userAvatarUrl?: string;
  /** Called with a resized data URL when the user picks a new photo from the
   *  camera badge on the avatar — saves immediately, no separate "save" step. */
  onChangeAvatar?: (dataUrl: string) => void;
  activeMedsCount?: number;
  adherenceRate?: number;
  takenTodayCount?: number;
  remainingTodayCount?: number;
  totalTodayCount?: number;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  isOpen,
  onClose,
  currentTab,
  onSelectTab,
  isDarkMode,
  onToggleDarkMode,
  onOpenSettings,
  userName = 'کاربر داروتو',
  userAvatarUrl,
  onChangeAvatar,
  activeMedsCount = 6,
  adherenceRate = 98,
  takenTodayCount = 0,
  remainingTodayCount = 0,
  totalTodayCount = 0
}) => {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageFile(file, 480, 0.85);
      onChangeAvatar?.(resized);
    } catch (err) {
      console.error('Failed to process avatar image:', err);
    }
  };

  // Real 5-star health/adherence rating, derived from the actual adherence rate
  // (every 20% ≈ one star), rounded to the nearest half-star — no longer a fixed ۵.۰.
  const healthStars = Math.min(5, Math.max(0, Math.round((adherenceRate / 100) * 5 * 2) / 2));
  const healthStarsValue = toPersianNumbers(healthStars.toFixed(1));

  if (!isOpen) return null;

  // Swipe-to-close: dragging the drawer to the right (toward the screen edge) closes it
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientX - startXRef.current;
    setDragX(Math.max(0, delta));
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragX > 90) {
      onClose();
    }
    setDragX(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-start animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Drawer Content - appears centered vertically (not pinned to the top),
          flush to the right edge horizontally. Height follows its own content
          instead of being stretched, so there's no leftover empty space. */}
      <div 
        className="relative w-[76vw] max-w-[290px] max-h-[93vh] bg-[#F0FDF4]/95 dark:bg-slate-900 shadow-2xl flex flex-col justify-between overflow-hidden z-10 p-4 rounded-[28px] border border-white/40 dark:border-slate-800 animate-in slide-in-from-right duration-300"
        style={{
          transform: `translateX(${dragX}px)`,
          opacity: Math.max(0.3, 1 - dragX / 300),
          transition: isDragging ? 'none' : 'transform 0.2s ease-out'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        
        <div className="space-y-3 flex flex-col">
          {/* Top Profile Card Header */}
          <div className="px-2 pt-1 relative shrink-0">

            {/* Top Toolbar Actions — یک ردیف افقی به‌جای دو دکمه‌ی روی‌هم؛ فضای
                عمودی زیادی که قبلاً بالای عکس کاربر خالی می‌ماند همینجا آزاد شد. */}
            <div className="flex items-center justify-between mb-2.5">
              <button
                onClick={() => {
                  onOpenSettings();
                  onClose();
                }}
                className="p-2 bg-white/70 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 rounded-xl hover:scale-105 transition-all shadow-xs border border-slate-200/60 dark:border-slate-600"
                title="تنظیمات"
              >
                <SettingsIcon className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={onToggleDarkMode}
                className="p-2 bg-teal-100/60 dark:bg-slate-700/80 text-teal-700 dark:text-teal-300 rounded-xl hover:scale-105 transition-all shadow-xs"
                title={isDarkMode ? 'حالت روز' : 'حالت شب'}
              >
                {isDarkMode ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px] text-teal-700" />}
              </button>
            </div>

            {/* Profile Avatar (Centered) — حلقه‌ی دور عکس دیگر فقط تزئینی
                نیست: واقعاً درصد پایبندی امروز را نشان می‌دهد (روند رایج
                «حلقه‌ی پیشرفت» به‌جای گرادیان ساکن)، و خودِ عکس هم بزرگ‌تر شد. */}
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-2">
                <div
                  className="w-20 h-20 rounded-full p-[3px] shadow-lg flex items-center justify-center"
                  style={{
                    background: `conic-gradient(#14b8a6 ${Math.round(adherenceRate * 3.6)}deg, #e2e8f0 ${Math.round(adherenceRate * 3.6)}deg)`
                  }}
                >
                  <div className="w-full h-full rounded-full bg-teal-600 flex items-center justify-center text-white text-xl font-bold border-2 border-white dark:border-slate-800 shadow-inner overflow-hidden">
                    {userAvatarUrl ? (
                      <img src={userAvatarUrl} alt={userName} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-9 h-9 text-white" strokeWidth={2.25} />
                    )}
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-5 h-5 bg-teal-500 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-white shadow-md cursor-pointer hover:scale-110 transition-transform">
                  <label className="w-full h-full flex items-center justify-center cursor-pointer">
                    <Camera className="w-2.5 h-2.5" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                  </label>
                </div>
              </div>

              {/* User Name & Subtitle */}
              <h3 className="font-black text-slate-800 dark:text-white text-base tracking-tight">
                {userName}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                مدیریت و یادآوری سلامت
              </p>

              {/* یک ردیف واحد از آمارها به‌جای دو بلوک جدا (تگ‌ها + جدول
                  معیارها با خط جداکننده) — همان اطلاعات، فضای کمتر. */}
              <div className="flex items-center justify-center flex-wrap gap-1.5 mt-2">
                <span className="px-2 py-1 rounded-full bg-teal-100/70 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 text-[10px] font-bold border border-teal-200/50 dark:border-teal-800/50">
                  فعال: {toPersianNumbers(activeMedsCount)}
                </span>
                <span className="px-2 py-1 rounded-full bg-emerald-100/70 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200/50 dark:border-emerald-800/50">
                  پایبندی: {toPersianNumbers(adherenceRate)}٪
                </span>
                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100/70 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[10px] font-bold border border-amber-200/50 dark:border-amber-800/50">
                  {healthStarsValue}
                  <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" strokeLinejoin="round" />
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: Main Sections */}
          <div className="space-y-2 shrink-0">
            <span className="text-[11px] font-bold text-slate-400 px-2 block text-right">
              بخش‌های اصلی
            </span>

            <button
              onClick={() => {
                onSelectTab('pharmacy');
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3.5 rounded-2xl transition-all font-bold text-[15px] ${
                currentTab === 'pharmacy'
                  ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Store className={`w-[18px] h-[18px] ${currentTab === 'pharmacy' ? 'text-white' : 'text-slate-500 dark:text-slate-300'}`} />
                <span>داروخانه</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectTab('today');
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3.5 rounded-2xl transition-all font-bold text-[15px] ${
                currentTab === 'today'
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/30'
                  : 'bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Home className={`w-[18px] h-[18px] ${currentTab === 'today' ? 'text-white' : 'text-slate-500 dark:text-slate-300'}`} />
                <span>داشبورد اصلی (خانه)</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectTab('medications');
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3.5 rounded-2xl transition-all font-bold text-[15px] ${
                currentTab === 'medications'
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/30'
                  : 'bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Pill className={`w-[18px] h-[18px] ${currentTab === 'medications' ? 'text-white' : 'text-slate-500 dark:text-slate-300'}`} />
                <span>مدیریت داروها</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectTab('interactions');
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3.5 rounded-2xl transition-all font-bold text-[15px] ${
                currentTab === 'interactions'
                  ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/30'
                  : 'bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert className={`w-[18px] h-[18px] ${currentTab === 'interactions' ? 'text-white' : 'text-slate-500 dark:text-slate-300'}`} />
                <span>تداخلات دارویی</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectTab('reports');
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3.5 rounded-2xl transition-all font-bold text-[15px] ${
                currentTab === 'reports'
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/30'
                  : 'bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className={`w-[18px] h-[18px] ${currentTab === 'reports' ? 'text-white' : 'text-slate-500 dark:text-slate-300'}`} />
                <span>گزارشات و تاریخچه</span>
              </div>
            </button>
          </div>
        </div>

        {/* Drawer Bottom Footer - Social Links */}
        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 space-y-1.5 shrink-0">
          <div className="flex items-center justify-center gap-2">
            <a
              href="https://t.me"
              target="_blank"
              rel="noreferrer"
              className="p-2 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 rounded-xl hover:scale-105 transition-all"
              title="تلگرام داروتو"
            >
              <Send className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              className="p-2 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 rounded-xl hover:scale-105 transition-all"
              title="اینستاگرام داروتو"
            >
              <Instagram className="w-3.5 h-3.5" />
            </a>
          </div>

          <p className="text-[10px] text-center text-slate-400 font-medium">
            ما را در شبکه‌های اجتماعی دنبال کنید
          </p>
        </div>

      </div>
    </div>
  );
};
