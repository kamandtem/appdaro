import React, { useState, useEffect } from 'react';
import { X, Settings as SettingsIcon, Camera, User, Type, Check, Bell, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { FontSize } from '../../types';
import { resizeImageFile } from '../../utils/image';
import { checkNotificationPermissionStatus, requestNotificationPermissions } from '../../services/notificationService';
import { NotificationPermissionStatus } from '../../adapters/CapacitorNotificationAdapter';

interface SettingsViewProps {
  onClose: () => void;
  userName: string;
  userAvatarUrl?: string;
  fontSize: FontSize;
  onSave: (data: { userName: string; userAvatarUrl?: string; fontSize: FontSize }) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onClose,
  userName,
  userAvatarUrl,
  fontSize,
  onSave
}) => {
  const [name, setName] = useState(userName);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(userAvatarUrl);
  const [selectedFontSize, setSelectedFontSize] = useState<FontSize>(fontSize);

  // بخش تشخیص نوتیفیکیشن — تا کاربر مجبور نباشد منتظر رسیدن نوبت واقعی یک
  // دارو بماند تا بفهمد نوتیفیکیشن روی گوشی‌اش اصلاً کار می‌کند یا نه، و اگر
  // کار نمی‌کند، دقیقاً کدام مجوز مشکل دارد.
  const [notifStatus, setNotifStatus] = useState<NotificationPermissionStatus | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    checkNotificationPermissionStatus().then(setNotifStatus).catch(() => {});
  }, []);

  const handleRequestPermissionAgain = async () => {
    setNotifBusy(true);
    try {
      const status = await requestNotificationPermissions();
      setNotifStatus(status);
    } finally {
      setNotifBusy(false);
    }
  };

  const fontOptions: { id: FontSize; label: string; sample: string }[] = [
    { id: 'small', label: 'کوچک', sample: 'text-xs' },
    { id: 'medium', label: 'متوسط', sample: 'text-base' },
    { id: 'large', label: 'بزرگ', sample: 'text-xl' }
  ];

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageFile(file, 480, 0.85);
      setAvatarUrl(resized);
      // Persist right away — the user shouldn't have to also find and tap "ذخیره
      // تغییرات" for the new photo to survive leaving this screen.
      onSave({ userName: name.trim() || 'کاربر داروتو', userAvatarUrl: resized, fontSize: selectedFontSize });
    } catch (err) {
      console.error('Failed to process avatar image:', err);
      alert('پردازش تصویر با خطا مواجه شد. لطفاً تصویر دیگری را امتحان کنید.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      userName: name.trim() || 'کاربر داروتو',
      userAvatarUrl: avatarUrl,
      fontSize: selectedFontSize
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white/85 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/60 dark:border-slate-800 rounded-[40px] shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 sm:p-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-gradient-to-tr from-teal-500 to-emerald-600 text-white rounded-2xl shadow-md">
              <SettingsIcon className="w-6 h-6" />
            </div>
            <h3 className="font-black text-slate-800 dark:text-white text-lg sm:text-xl">
              تنظیمات برنامه
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Upload */}
          <div className="flex flex-col items-center">
            <div className="relative mb-3">
              <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-teal-400 via-emerald-400 to-cyan-300 shadow-lg flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-teal-600 flex items-center justify-center text-white text-4xl font-bold border-2 border-white dark:border-slate-800 shadow-inner overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="عکس پروفایل" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-11 h-11 text-white" strokeWidth={2.25} />
                  )}
                </div>
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-teal-500 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-white shadow-md cursor-pointer hover:scale-105 transition-transform">
                <Camera className="w-4 h-4" />
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
            <span className="text-xs text-slate-400 font-medium">برای تغییر عکس، ضربه بزنید</span>
          </div>

          {/* Username */}
          <div>
            <label className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <User className="w-4 h-4 text-teal-600" />
              نام کاربری
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="نام خود را وارد کنید"
              className="w-full px-4 py-3 bg-white/70 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
            />
          </div>

          {/* Font Size */}
          <div>
            <label className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <Type className="w-4 h-4 text-teal-600" />
              اندازه فونت برنامه
            </label>
            <div className="grid grid-cols-3 gap-2">
              {fontOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedFontSize(opt.id)}
                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all font-bold ${
                    selectedFontSize === opt.id
                      ? 'bg-teal-500 border-teal-500 text-white shadow-md'
                      : 'bg-white/70 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <span className={opt.sample}>Aآ</span>
                  <span className="text-[11px]">{opt.label}</span>
                  {selectedFontSize === opt.id && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          </div>

          {/* Notification diagnostics */}
          <div>
            <label className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-teal-600" />
              وضعیت نوتیفیکیشن
            </label>
            <div className="bg-white/70 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl p-4 space-y-3">
              {notifStatus && (
                <div className="space-y-1.5 text-xs sm:text-sm font-bold">
                  <div className="flex items-center gap-2">
                    {notifStatus.pluginAvailable ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                    <span className="text-slate-600 dark:text-slate-300">
                      {notifStatus.pluginAvailable ? 'اپ نصب‌شده روی گوشی تشخیص داده شد' : 'در محیط وب/پیش‌نمایش هستی — نوتیفیکیشن روی این محیط کار نمی‌کند'}
                    </span>
                  </div>
                  {notifStatus.pluginAvailable && (
                    <>
                      <div className="flex items-center gap-2">
                        {notifStatus.notificationsGranted ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                        )}
                        <span className="text-slate-600 dark:text-slate-300">
                          {notifStatus.notificationsGranted ? 'مجوز نوتیفیکیشن داده شده' : 'مجوز نوتیفیکیشن داده نشده'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {notifStatus.exactAlarmGranted ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        )}
                        <span className="text-slate-600 dark:text-slate-300">
                          {notifStatus.exactAlarmGranted ? 'مجوز هشدار دقیق داده شده' : 'مجوز هشدار دقیق داده نشده (ممکنه نوتیفیکیشن دیر برسه)'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleRequestPermissionAgain}
                disabled={notifBusy}
                className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {notifBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                درخواست مجدد مجوز
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-black shadow-lg shadow-teal-500/30 hover:scale-[1.02] active:scale-95 transition-all"
            >
              ذخیره تغییرات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
