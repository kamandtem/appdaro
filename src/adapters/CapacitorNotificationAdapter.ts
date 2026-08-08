// NotificationAdapter (DESIGN.md بخش ۹) — جداکردن هر چیز platform-specific
// نوتیفیکیشن از Notification Engine (بخش ۶). امروز `NotificationEngine/CapacitorNotificationAdapter`
// مستقیماً `import('@capacitor/local-notifications')` می‌کند و در همان فایل
// هم منطق زمان‌بندی هست هم منطق پلاگین — این دو باید جدا شوند (بخش ۹، بخش
// ۱۳ - جدول فایل‌ها: «تفکیک به src/notification/NotificationEngine.ts
// (منطق) + src/adapters/CapacitorNotificationAdapter.ts (پلاگین)»).
//
// این فایل عمداً به NotificationEngine/CapacitorNotificationAdapter فعلی دست نمی‌زنه — طبق همون
// الگوی shadow-mode که بقیه‌ی Adapter/Repository/Domain layerها تا الان
// داشتن (تیکه‌های ۱ تا ۷)، این مسیر جدید کنار مسیر قدیمی زندگی می‌کنه.
// اتصال واقعی (جایگزینی) پشت یک feature flag انجام می‌شه — نگاه کن به
// src/notification/NotificationEngine.ts.

import { NativeNotificationId, ReminderKind } from '../types';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/** یک entry آماده‌ی زمان‌بندی — دقیقاً هم‌راستا با امضای خام بخش ۹
 *  (`schedule(entries: {id; title; body; fireAt; extra}[])`)، با این تفاوت
 *  که `extra` طبق بخش ۱۶ («چند Notification») حتماً `occurrenceId` و `kind`
 *  واقعی حمل می‌کند — نه یک هش رشته‌ای حدسی مثل کد قدیمی. */
export interface NotificationScheduleEntry {
  id: NativeNotificationId;
  title: string;
  body: string;
  fireAt: number;
  extra: { occurrenceId: string; kind: ReminderKind };
}

/**
 * NotificationAdapter — امضای دقیق بخش ۹.
 *
 * **انحراف مستندشده (نسبت به جدول توصیفی بخش ۶):** بخش ۶ در جدول «تفاوت
 * کلیدی با امروز» می‌گوید شناسه‌ی نوتیفیکیشن «id واقعی‌ای که خود پلاگین OS
 * برمی‌گرداند» است — ولی امضای خودِ این interface (بخش ۹) `id` را به‌عنوان
 * *ورودی* `schedule()` می‌گیرد، نه خروجی. این با API واقعی
 * `@capacitor/local-notifications` هم‌خوانی دارد: آن پلاگین همیشه یک id
 * عددی از طرف caller می‌خواهد و چیزی تولید/برنمی‌گرداند. پس تولید id واقعاً
 * به عهده‌ی خود Notification Engine (caller) است — نه OS و نه این Adapter؛
 * بخش ۶ فقط این نکته را توصیف می‌کند که (بر خلاف کد قدیمی) این id دیگر یک
 * هش حدسی از `medId+slot+kind` نیست، بلکه از خودِ `occurrenceId` (که واقعاً
 * منحصربه‌فرده) مشتق می‌شود — نگاه کن به `NotificationEngine.ts`.
 */
export interface NotificationAdapter {
  ensureChannel(): Promise<void>;
  schedule(entries: NotificationScheduleEntry[]): Promise<void>;
  cancel(ids: NativeNotificationId[]): Promise<void>;
  onTap(cb: (event: { occurrenceId: string; actionId?: string }) => void): () => void;
}

// همون شناسه‌ی کانال قدیمی (NotificationEngine/CapacitorNotificationAdapter) — عمداً عوض نشده، چون
// این فقط یک id داخلی برای OS است و تغییرش هیچ سودی نداره، فقط ریسک از دست
// دادن تنظیمات صدا/ویبره‌ی از‌قبل‌اعطاشده‌ی کاربر رو داره.
const CHANNEL_ID = 'daroto-dose-reminders';

/** Lazily resolves the native plugin. Returns null when not running inside a
 *  Capacitor native shell (e.g. plain browser preview) — دقیقاً همون الگوی
 *  `getPlugin` قدیمی NotificationEngine/CapacitorNotificationAdapter. */
const PLUGIN_TIMEOUT_MS = 8_000;

function withPluginTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${PLUGIN_TIMEOUT_MS}ms`)), PLUGIN_TIMEOUT_MS))
  ]);
}

function getPlugin() {
  return Capacitor.isNativePlatform() ? LocalNotifications : null;
}


/**
 * پیاده‌سازی واقعی، برای اجرا روی device — دقیقاً پشت
 * `@capacitor/local-notifications`.
 */
export class CapacitorNotificationAdapter implements NotificationAdapter {
  private channelEnsured = false;

  async ensureChannel(): Promise<void> {
    // Idempotent در همون session — دیگه لازم نیست هر syncOccurrence دوباره
    // پلاگین رو صدا بزنه؛ createChannel خودش هم توی OS idempotent هست، ولی
    // این کش یک round-trip غیرلازم به پلاگین رو هم حذف می‌کنه.
    if (this.channelEnsured) return;
    const plugin = await getPlugin();
    if (!plugin) return;
    try {
      await withPluginTimeout(plugin.createChannel({
        id: CHANNEL_ID,
        name: 'یادآور مصرف دارو',
        description: 'یادآورهای وقت مصرف دارو و یادآورهای دوز فراموش‌شده',
        importance: 5, // IMPORTANCE_HIGH — heads-up + صدا
        visibility: 1, // public
        vibration: true,
        lights: true
      }), 'createChannel');
      this.channelEnsured = true;
    } catch (e) {
      console.warn('CapacitorNotificationAdapter: failed to ensure channel:', e);
      throw e;
    }
  }

  async schedule(entries: NotificationScheduleEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const plugin = await getPlugin();
    if (!plugin) return;
    try {
      await withPluginTimeout(plugin.schedule({
        notifications: entries.map(e => ({
          id: toNumericId(e.id),
          title: e.title,
          body: e.body,
          schedule: { at: new Date(e.fireAt), allowWhileIdle: true },
          channelId: CHANNEL_ID,
          extra: e.extra,
          actionTypeId: 'DOSE_ACTIONS'
        }))
      }), 'schedule');
    } catch (e) {
      console.warn('CapacitorNotificationAdapter: schedule failed:', e);
      throw e;
    }
  }

  async cancel(ids: NativeNotificationId[]): Promise<void> {
    if (ids.length === 0) return;
    const plugin = await getPlugin();
    if (!plugin) return;
    try {
      await withPluginTimeout(plugin.cancel({ notifications: ids.map(id => ({ id: toNumericId(id) })) }), 'cancel');
    } catch (e) {
      console.warn('CapacitorNotificationAdapter: cancel failed:', e);
      throw e;
    }
  }

  onTap(cb: (event: { occurrenceId: string; actionId?: string }) => void): () => void {
    let handle: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const plugin = await getPlugin();
      if (!plugin) return;
      try {
        const h = await plugin.addListener('localNotificationActionPerformed', (action: any) => {
          const occurrenceId = action?.notification?.extra?.occurrenceId;
          if (occurrenceId) cb({ occurrenceId, actionId: action?.actionId });
        });
        if (cancelled) {
          h.remove();
        } else {
          handle = h;
        }
      } catch (e) {
        console.warn('CapacitorNotificationAdapter: failed to register tap listener:', e);
      }
    })();

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }
}

/**
 * پیاده‌سازی تستی — کاملاً در حافظه، بدون هیچ import دینامیک واقعی؛ دقیقاً
 * همون الگوی `FakeClockAdapter`/`FakeAppLifecycleAdapter` (تیکه ۴).
 */
export class FakeNotificationAdapter implements NotificationAdapter {
  public channelEnsured = false;
  public scheduled: NotificationScheduleEntry[] = [];
  public canceled: NativeNotificationId[] = [];
  private tapListeners: Set<(extra: { occurrenceId: string; actionId?: string }) => void> = new Set();

  async ensureChannel(): Promise<void> {
    this.channelEnsured = true;
  }

  async schedule(entries: NotificationScheduleEntry[]): Promise<void> {
    this.scheduled.push(...entries);
  }

  async cancel(ids: NativeNotificationId[]): Promise<void> {
    this.canceled.push(...ids);
  }

  onTap(cb: (event: { occurrenceId: string; actionId?: string }) => void): () => void {
    this.tapListeners.add(cb);
    return () => this.tapListeners.delete(cb);
  }

  /** برای تست: شبیه‌سازی تپ کاربر روی یک نوتیفیکیشن. */
  simulateTap(occurrenceId: string, actionId?: string): void {
    for (const cb of this.tapListeners) cb({ occurrenceId, actionId });
  }
}

/** مجوزها و listener تپ هم بخشی از adapter هستند؛ منطق زمان‌بندی دیگر در
 * `services/NotificationEngine/CapacitorNotificationAdapter` پخش نشده است. */
export async function requestNotificationPermissions(): Promise<void> {
  try {
    const plugin = await getPlugin();
    if (!plugin) return;
    await withPluginTimeout(plugin.requestPermissions(), 'requestPermissions');
    await withPluginTimeout(plugin.registerActionTypes({ types: [{ id: 'DOSE_ACTIONS', actions: [{ id: 'taken', title: 'مصرف شد' }, { id: 'later', title: 'بعداً' }] }] }), 'registerActionTypes');
    await new CapacitorNotificationAdapter().ensureChannel();
    if (typeof plugin.checkExactNotificationSetting === 'function') {
      const exact = await plugin.checkExactNotificationSetting();
      if (exact?.exact_alarm !== 'granted' && typeof plugin.changeExactNotificationSetting === 'function') {
        await plugin.changeExactNotificationSetting();
      }
    }
  } catch (error) {
    console.warn('Notification permissions unavailable:', error);
    throw error;
  }
}

export async function addNotificationTapListener(onAction: (event: { occurrenceId: string; actionId?: string }) => void): Promise<(() => void) | undefined> {
  const adapter = new CapacitorNotificationAdapter();
  return adapter.onTap(onAction);
}
