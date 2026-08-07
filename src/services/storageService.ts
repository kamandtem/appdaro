// storageService — بخش ۱۳ سند طراحی: بخش خامِ خواندن/نوشتنِ کل AppState حالا
// از طریق LocalStoragePersistenceAdapter انجام می‌شود (تفکیک «منطق» از
// «پلاگین/storage»)؛ این فایل فقط شکل AppState را می‌داند، نه جزئیات
// localStorage خام.

import { AppState } from '../types';
import { INITIAL_FAMILY_MEMBERS, INITIAL_MEDICATIONS, INITIAL_DOSE_LOGS, INITIAL_DOSE_OCCURRENCES } from '../data/initialData';
import { persistenceAdapter, STORAGE_KEY } from '../adapters/LocalStoragePersistenceAdapter';

export function loadAppState(): AppState {
  try {
    const saved = persistenceAdapter.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        currentTab: parsed.currentTab || 'today',
        familyMembers: parsed.familyMembers || INITIAL_FAMILY_MEMBERS,
        selectedProfileId: parsed.selectedProfileId || 'me',
        medications: parsed.medications || INITIAL_MEDICATIONS,
        doseLogs: parsed.doseLogs || INITIAL_DOSE_LOGS,
        doseOccurrences: parsed.doseOccurrences || INITIAL_DOSE_OCCURRENCES,
        hasMigratedOccurrences: parsed.hasMigratedOccurrences ?? false,
        lastKnownTimeZoneId: parsed.lastKnownTimeZoneId,
        isDarkMode: parsed.isDarkMode || false,
        hasSeenOnboarding: parsed.hasSeenOnboarding ?? false,
        hasSeenCardGestureTutorial: parsed.hasSeenCardGestureTutorial ?? false,
        hasSeenInteractionsDisclaimer: parsed.hasSeenInteractionsDisclaimer ?? false,
        userName: parsed.userName || 'کاربر داروتو',
        userAvatarUrl: parsed.userAvatarUrl || undefined,
        fontSize: parsed.fontSize || 'medium'
      };
    }
  } catch (e) {
    console.error('Failed to load state from localStorage', e);
  }

  return {
    currentTab: 'today',
    familyMembers: INITIAL_FAMILY_MEMBERS,
    selectedProfileId: 'me',
    medications: INITIAL_MEDICATIONS,
    doseLogs: INITIAL_DOSE_LOGS,
    doseOccurrences: INITIAL_DOSE_OCCURRENCES,
    hasMigratedOccurrences: false,
    isDarkMode: false,
    hasSeenOnboarding: false,
    hasSeenCardGestureTutorial: false,
    hasSeenInteractionsDisclaimer: false,
    userName: 'کاربر داروتو',
    userAvatarUrl: undefined,
    fontSize: 'medium'
  };
}

export function saveAppState(state: AppState): void {
  persistenceAdapter.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Simulate Android WorkManager reminder notification
 */
export function triggerSimulatedReminder(title: String, body: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(`💊 ${title}`, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      });
    } catch (e) {
      console.warn('Browser notification failed, check console:', e);
    }
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const res = await Notification.requestPermission();
    return res === 'granted';
  }
  return false;
}
