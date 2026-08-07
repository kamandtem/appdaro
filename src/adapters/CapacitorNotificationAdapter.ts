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

export interface NotificationAdapter {
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<void>;
  schedule(specs: ScheduledNotificationSpec[]): Promise<void>;
  cancel(ids: number[]): Promise<void>;
  addTapListener(onTap: (extra: Record<string, unknown>) => void): Promise<(() => void) | undefined>;
}

async function getPlugin() {
  try {
    const mod = await import('@capacitor/local-notifications');
    return mod.LocalNotifications;
  } catch {
    return null;
  }
}

export class CapacitorNotificationAdapter implements NotificationAdapter {
  async isAvailable(): Promise<boolean> {
    return (await getPlugin()) !== null;
  }

  async requestPermissions(): Promise<void> {
    const plugin = await getPlugin();
    if (!plugin) {
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch (e) {
        console.warn('Web notification permission request failed:', e);
      }
      return;
    }

    try {
      await plugin.requestPermissions();
    } catch (e) {
      console.warn('Local notification permission request failed:', e);
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
      console.warn('Failed to create/ensure notification channel:', e);
    }

    try {
      if (typeof plugin.checkExactNotificationSetting === 'function') {
        const exact = await plugin.checkExactNotificationSetting();
        if (exact?.exact_alarm && exact.exact_alarm !== 'granted' && typeof plugin.changeExactNotificationSetting === 'function') {
          await plugin.changeExactNotificationSetting();
        }
      }
    } catch (e) {
      console.warn('Exact-alarm permission check/request failed:', e);
    }
  }

  async schedule(specs: ScheduledNotificationSpec[]): Promise<void> {
    if (specs.length === 0) return;
    const plugin = await getPlugin();
    if (!plugin) return;
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
    } catch (e) {
      console.warn('Failed to schedule notifications:', e);
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
