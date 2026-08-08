// CapacitorNotificationAdapter — بخش ۹ سند طراحی.
//
// تنها نقطه‌ای که مستقیماً با پلاگین @capacitor/local-notifications صحبت
// می‌کند. NotificationEngine (منطق) از این آداپتر استفاده می‌کند و خودش هیچ
// import مستقیمی از پلاگین ندارد — جدایی «منطق» از «پلاگین» طبق جدول بخش ۱۳.
//
// نکته‌ی مهم: قبلاً پلاگین با import() پویا (داخل یک تابع، هنگام نیاز) لود
// می‌شد. توی WebView اندرویدِ Capacitor این import پویا می‌تونه به‌جای resolve
// یا reject شدن، برای همیشه معلق (pending) بمونه — که دقیقاً همون چیزی بود که
// باعث می‌شد دکمه‌ی «تست نوتیفیکیشن» فقط لودینگ نشون بده و هیچ‌وقت جواب نده.
// حالا مثل پروژه‌ی دیگه‌ای که واقعاً نوتیفیکیشنش کار می‌کنه، پلاگین را از همون
// ابتدای فایل و به‌صورت static import می‌گیریم.

import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export interface ScheduledNotificationSpec {
  id: number;
  title: string;
  body: string;
  at?: Date;
  repeatDaily?: { hour: number; minute: number };
  extra?: Record<string, unknown>;
  /** اگر ست شود، نوتیفیکیشن با سه دکمه‌ی «مصرف کردم»/«بعداً»/«رد کردم» نمایش
   *  داده می‌شود (DOSE_ACTION_TYPE_ID). */
  actionTypeId?: string;
}

const CHANNEL_ID = 'daroto-dose-reminders';

/** شناسه‌ی actionType سه‌دکمه‌ای برای نوتیفیکیشن‌های دوز — باید قبل از هر
 *  schedule که از آن استفاده می‌کند، یک‌بار register شده باشد. */
export const DOSE_ACTION_TYPE_ID = 'DOSE_ACTIONS';
export const DOSE_ACTION_TAKEN = 'dose-taken';
export const DOSE_ACTION_SNOOZE = 'dose-snooze';
export const DOSE_ACTION_SKIP = 'dose-skip';

/** سقف زمانی امن برای هر تماس با پلاگین — اگر پلاگین به هر دلیلی (باگ
 *  نسخه، تداخل، هرچی) هیچ‌وقت جواب نده، دیگه UI برای همیشه چرخ‌وفلک لودینگ
 *  نشون نمی‌ده؛ بعد از این مهلت با یه خطای صریح شکست می‌خوریم. */
const PLUGIN_CALL_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`«${label}» بیش از ${PLUGIN_CALL_TIMEOUT_MS / 1000} ثانیه جواب نداد (timeout)`)), PLUGIN_CALL_TIMEOUT_MS)
    )
  ]);
}

/** نتیجه‌ی صریح درخواست مجوز — دیگر «void» نیست، چون خودِ App.tsx/UI باید
 *  بتواند به کاربر نشان دهد که آیا واقعاً مجوز گرفته شده یا نه (به‌جای اینکه
 *  فقط توی کنسول یک warning بی‌صدا بماند که کاربر هیچ‌وقت نمی‌بیند). */
export interface NotificationPermissionStatus {
  /** آیا اصلاً روی این پلتفرم پلاگین native در دسترس است؟ false یعنی احتمالاً
   *  داریم روی وب/پیش‌نمایش اجرا می‌شویم، نه اپ نصب‌شده روی گوشی. */
  pluginAvailable: boolean;
  /** مجوز نمایش نوتیفیکیشن (POST_NOTIFICATIONS در اندروید ۱۳+). */
  notificationsGranted: boolean;
  /** مجوز هشدار دقیق (SCHEDULE_EXACT_ALARM در اندروید ۱۲+) — اگر این نه باشد
   *  نوتیفیکیشن‌ها ممکن است دیر/نامنظم برسند، نه اینکه اصلاً نرسند. */
  exactAlarmGranted: boolean;
  /** آخرین خطای واقعی (اگر چیزی شکست خورد) — برای نمایش/لاگ دقیق‌تر. */
  lastError?: string;
}

export interface NotificationAdapter {
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<NotificationPermissionStatus>;
  checkPermissionStatus(): Promise<NotificationPermissionStatus>;
  schedule(specs: ScheduledNotificationSpec[]): Promise<{ ok: boolean; error?: string }>;
  cancel(ids: number[]): Promise<void>;
  /** actionId خالی/undefined یعنی خودِ نوتیفیکیشن لمس شده (نه یکی از سه دکمه). */
  addTapListener(onTap: (extra: Record<string, unknown>, actionId?: string) => void): Promise<(() => void) | undefined>;
}

export class CapacitorNotificationAdapter implements NotificationAdapter {
  async isAvailable(): Promise<boolean> {
    return Capacitor.isNativePlatform();
  }

  async checkPermissionStatus(): Promise<NotificationPermissionStatus> {
    if (!Capacitor.isNativePlatform()) {
      return { pluginAvailable: false, notificationsGranted: false, exactAlarmGranted: false };
    }
    let notificationsGranted = false;
    let exactAlarmGranted = true; // اگر API موجود نباشد فرض می‌کنیم مشکلی نیست
    let lastError: string | undefined;
    try {
      const perm = await withTimeout(LocalNotifications.checkPermissions(), 'checkPermissions');
      notificationsGranted = perm?.display === 'granted';
    } catch (e) {
      lastError = String(e);
      console.error('[Notifications] checkPermissions شکست خورد:', e);
    }
    try {
      if (typeof LocalNotifications.checkExactNotificationSetting === 'function') {
        const exact = await withTimeout(LocalNotifications.checkExactNotificationSetting(), 'checkExactNotificationSetting');
        exactAlarmGranted = !exact?.exact_alarm || exact.exact_alarm === 'granted';
      }
    } catch (e) {
      lastError = String(e);
      console.error('[Notifications] checkExactNotificationSetting شکست خورد:', e);
    }
    return { pluginAvailable: true, notificationsGranted, exactAlarmGranted, lastError };
  }

  async requestPermissions(): Promise<NotificationPermissionStatus> {
    if (!Capacitor.isNativePlatform()) {
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch (e) {
        console.error('[Notifications] درخواست مجوز نوتیفیکیشن وب شکست خورد:', e);
      }
      return { pluginAvailable: false, notificationsGranted: false, exactAlarmGranted: false };
    }

    let notificationsGranted = false;
    let lastError: string | undefined;

    try {
      const result = await withTimeout(LocalNotifications.requestPermissions(), 'requestPermissions');
      notificationsGranted = result?.display === 'granted';
      // مهم: اینجا دیگه فقط warn نمی‌کنیم — اگر کاربر رد کرده باشد، این
      // اطلاعات باید به لایه‌ی بالاتر (UI) برگردد تا نمایش داده شود.
      if (!notificationsGranted) {
        console.error('[Notifications] کاربر مجوز نوتیفیکیشن را رد کرده یا داده نشده. نتیجه:', result);
      }
    } catch (e) {
      lastError = String(e);
      console.error('[Notifications] requestPermissions() شکست خورد یا timeout شد:', e);
    }

    try {
      await withTimeout(LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'یادآور مصرف دارو',
        description: 'یادآورهای وقت مصرف دارو و یادآورهای دوز فراموش‌شده',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true
      }), 'createChannel');
    } catch (e) {
      lastError = String(e);
      console.error('[Notifications] ساخت کانال نوتیفیکیشن شکست خورد:', e);
    }

    // سه دکمه‌ی «مصرف کردم»/«بعداً»/«رد کردم» روی خودِ نوتیفیکیشن — باید یک‌بار
    // register شود تا specهای schedule بعدی بتوانند actionTypeId را استفاده کنند.
    try {
      if (typeof LocalNotifications.registerActionTypes === 'function') {
        await withTimeout(LocalNotifications.registerActionTypes({
          types: [{
            id: DOSE_ACTION_TYPE_ID,
            actions: [
              { id: DOSE_ACTION_TAKEN, title: 'مصرف کردم' },
              { id: DOSE_ACTION_SNOOZE, title: 'بعداً' },
              { id: DOSE_ACTION_SKIP, title: 'رد کردن', destructive: true }
            ]
          }]
        }), 'registerActionTypes');
      }
    } catch (e) {
      lastError = String(e);
      console.error('[Notifications] ثبت دکمه‌های نوتیفیکیشن شکست خورد:', e);
    }

    let exactAlarmGranted = true;
    try {
      if (typeof LocalNotifications.checkExactNotificationSetting === 'function') {
        const exact = await withTimeout(LocalNotifications.checkExactNotificationSetting(), 'checkExactNotificationSetting');
        if (exact?.exact_alarm && exact.exact_alarm !== 'granted' && typeof LocalNotifications.changeExactNotificationSetting === 'function') {
          await withTimeout(LocalNotifications.changeExactNotificationSetting(), 'changeExactNotificationSetting');
          const recheck = await withTimeout(LocalNotifications.checkExactNotificationSetting(), 'checkExactNotificationSetting');
          exactAlarmGranted = !recheck?.exact_alarm || recheck.exact_alarm === 'granted';
        }
      }
    } catch (e) {
      lastError = String(e);
      exactAlarmGranted = false;
      console.error('[Notifications] بررسی/درخواست مجوز هشدار دقیق شکست خورد:', e);
    }

    return { pluginAvailable: true, notificationsGranted, exactAlarmGranted, lastError };
  }

  async schedule(specs: ScheduledNotificationSpec[]): Promise<{ ok: boolean; error?: string }> {
    if (specs.length === 0) return { ok: true };
    if (!Capacitor.isNativePlatform()) {
      const error = 'پلاگین نوتیفیکیشن native در دسترس نیست (احتمالاً در حال اجرا روی وب/پیش‌نمایش هستیم، نه اپ نصب‌شده)';
      console.error('[Notifications]', error);
      return { ok: false, error };
    }
    try {
      await withTimeout(LocalNotifications.schedule({
        notifications: specs.map(s => ({
          id: s.id,
          title: s.title,
          body: s.body,
          channelId: CHANNEL_ID,
          actionTypeId: s.actionTypeId,
          extra: s.extra,
          schedule: s.repeatDaily
            ? { on: { hour: s.repeatDaily.hour, minute: s.repeatDaily.minute }, allowWhileIdle: true }
            : { at: s.at, allowWhileIdle: true }
        }))
      }), 'schedule');
      return { ok: true };
    } catch (e) {
      // قبلاً اینجا فقط console.warn می‌شد و خطا کاملاً بی‌صدا گم می‌شد —
      // همان دلیلی که کاربر هیچ نوتیفیکیشنی نمی‌دید و هیچ سرنخی هم نداشت.
      const error = String(e);
      console.error('[Notifications] schedule() شکست خورد یا timeout شد:', e);
      return { ok: false, error };
    }
  }

  async cancel(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    if (!Capacitor.isNativePlatform()) return;
    try {
      await withTimeout(LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) }), 'cancel');
    } catch (e) {
      console.warn('Failed to cancel notifications:', e);
    }
  }

  async addTapListener(onTap: (extra: Record<string, unknown>, actionId?: string) => void): Promise<(() => void) | undefined> {
    if (!Capacitor.isNativePlatform()) return undefined;
    try {
      const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (action: any) => {
        if (action?.notification?.extra) {
          // actionId پیش‌فرض پلاگین برای «خودِ نوتیفیکیشن لمس شد» چیزی مثل
          // 'tap' است — آن را نادیده می‌گیریم تا فقط سه دکمه‌ی واقعی (تعریف‌شده
          // در DOSE_ACTION_TYPE_ID) به‌عنوان اقدام مستقیم شناخته شوند.
          const rawActionId: string | undefined = action?.actionId;
          const actionId = rawActionId === DOSE_ACTION_TAKEN || rawActionId === DOSE_ACTION_SNOOZE || rawActionId === DOSE_ACTION_SKIP
            ? rawActionId
            : undefined;
          onTap(action.notification.extra, actionId);
        }
      });
      return () => handle.remove();
    } catch (e) {
      console.warn('Unable to register local notification tap listener:', e);
      return undefined;
    }
  }
}

export const notificationAdapter: NotificationAdapter = new CapacitorNotificationAdapter();
