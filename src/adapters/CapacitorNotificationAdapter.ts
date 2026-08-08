// CapacitorNotificationAdapter — بخش ۹ سند طراحی.
//
// تنها نقطه‌ای که مستقیماً با پلاگین @capacitor/local-notifications صحبت
// می‌کند. NotificationEngine (منطق) از این آداپتر استفاده می‌کند و خودش هیچ
// import مستقیمی از پلاگین ندارد — جدایی «منطق» از «پلاگین» طبق جدول بخش ۱۳.

export interface ScheduledNotificationSpec {
  id: number;
  title: string;
  body: string;
  at?: Date;
  repeatDaily?: { hour: number; minute: number };
  extra?: Record<string, unknown>;
}

const CHANNEL_ID = 'daroto-dose-reminders';

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
  addTapListener(onTap: (extra: Record<string, unknown>) => void): Promise<(() => void) | undefined>;
}

async function getPlugin() {
  try {
    const mod = await import('@capacitor/local-notifications');
    return mod.LocalNotifications;
  } catch (e) {
    console.error('[Notifications] پلاگین @capacitor/local-notifications در دسترس نیست:', e);
    return null;
  }
}

export class CapacitorNotificationAdapter implements NotificationAdapter {
  async isAvailable(): Promise<boolean> {
    return (await getPlugin()) !== null;
  }

  async checkPermissionStatus(): Promise<NotificationPermissionStatus> {
    const plugin = await getPlugin();
    if (!plugin) {
      return { pluginAvailable: false, notificationsGranted: false, exactAlarmGranted: false };
    }
    let notificationsGranted = false;
    let exactAlarmGranted = true; // اگر API موجود نباشد فرض می‌کنیم مشکلی نیست
    let lastError: string | undefined;
    try {
      const perm = await plugin.checkPermissions();
      notificationsGranted = perm?.display === 'granted';
    } catch (e) {
      lastError = String(e);
      console.error('[Notifications] checkPermissions شکست خورد:', e);
    }
    try {
      if (typeof plugin.checkExactNotificationSetting === 'function') {
        const exact = await plugin.checkExactNotificationSetting();
        exactAlarmGranted = !exact?.exact_alarm || exact.exact_alarm === 'granted';
      }
    } catch (e) {
      lastError = String(e);
      console.error('[Notifications] checkExactNotificationSetting شکست خورد:', e);
    }
    return { pluginAvailable: true, notificationsGranted, exactAlarmGranted, lastError };
  }

  async requestPermissions(): Promise<NotificationPermissionStatus> {
    const plugin = await getPlugin();
    if (!plugin) {
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
      const result = await plugin.requestPermissions();
      notificationsGranted = result?.display === 'granted';
      // مهم: اینجا دیگه فقط warn نمی‌کنیم — اگر کاربر رد کرده باشد، این
      // اطلاعات باید به لایه‌ی بالاتر (UI) برگردد تا نمایش داده شود.
      if (!notificationsGranted) {
        console.error('[Notifications] کاربر مجوز نوتیفیکیشن را رد کرده یا داده نشده. نتیجه:', result);
      }
    } catch (e) {
      lastError = String(e);
      console.error('[Notifications] plugin.requestPermissions() پرتاب خطا کرد:', e);
    }

    try {
      await plugin.createChannel({
        id: CHANNEL_ID,
        name: 'یادآور مصرف دارو',
        description: 'یادآورهای وقت مصرف دارو و یادآورهای دوز فراموش‌شده',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true
      });
    } catch (e) {
      lastError = String(e);
      console.error('[Notifications] ساخت کانال نوتیفیکیشن شکست خورد:', e);
    }

    let exactAlarmGranted = true;
    try {
      if (typeof plugin.checkExactNotificationSetting === 'function') {
        const exact = await plugin.checkExactNotificationSetting();
        if (exact?.exact_alarm && exact.exact_alarm !== 'granted' && typeof plugin.changeExactNotificationSetting === 'function') {
          await plugin.changeExactNotificationSetting();
          const recheck = await plugin.checkExactNotificationSetting();
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
    const plugin = await getPlugin();
    if (!plugin) {
      const error = 'پلاگین نوتیفیکیشن native در دسترس نیست (احتمالاً در حال اجرا روی وب/پیش‌نمایش هستیم، نه اپ نصب‌شده)';
      console.error('[Notifications]', error);
      return { ok: false, error };
    }
    try {
      await plugin.schedule({
        notifications: specs.map(s => ({
          id: s.id,
          title: s.title,
          body: s.body,
          channelId: CHANNEL_ID,
          extra: s.extra,
          schedule: s.repeatDaily
            ? { on: { hour: s.repeatDaily.hour, minute: s.repeatDaily.minute }, allowWhileIdle: true }
            : { at: s.at, allowWhileIdle: true }
        }))
      });
      return { ok: true };
    } catch (e) {
      // قبلاً اینجا فقط console.warn می‌شد و خطا کاملاً بی‌صدا گم می‌شد —
      // همان دلیلی که کاربر هیچ نوتیفیکیشنی نمی‌دید و هیچ سرنخی هم نداشت.
      const error = String(e);
      console.error('[Notifications] schedule() شکست خورد:', e);
      return { ok: false, error };
    }
  }

  async cancel(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const plugin = await getPlugin();
    if (!plugin) return;
    try {
      await plugin.cancel({ notifications: ids.map(id => ({ id })) });
    } catch (e) {
      console.warn('Failed to cancel notifications:', e);
    }
  }

  async addTapListener(onTap: (extra: Record<string, unknown>) => void): Promise<(() => void) | undefined> {
    const plugin = await getPlugin();
    if (!plugin) return undefined;
    try {
      const handle = await plugin.addListener('localNotificationActionPerformed', (action: any) => {
        if (action?.notification?.extra) onTap(action.notification.extra);
      });
      return () => handle.remove();
    } catch (e) {
      console.warn('Unable to register local notification tap listener:', e);
      return undefined;
    }
  }
}

export const notificationAdapter: NotificationAdapter = new CapacitorNotificationAdapter();
