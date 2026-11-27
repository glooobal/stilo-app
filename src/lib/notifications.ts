import * as Notifications from 'expo-notifications';

import { notifyDataChanged } from '@/db/events';

import { readTextPreference, writePreference } from './preferences';

const ENABLED_PREFERENCE = 'notifications.dividends';

// Shown also while the app is open (as a banner), without sound or badge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Dividend notifications switched on in the app (on by default). */
export function areDividendNotificationsOn(): boolean {
  return readTextPreference(ENABLED_PREFERENCE) !== 'false';
}

/** The system allows notifications for the app. */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    const status = await Notifications.getPermissionsAsync();
    return status.granted;
  } catch {
    return false;
  }
}

/**
 * Switches dividend notifications on (asking the system once, if it has
 * not been asked yet) or off. Returns whether they can be shown.
 */
export async function setDividendNotifications(isOn: boolean): Promise<boolean> {
  writePreference(ENABLED_PREFERENCE, String(isOn));
  let granted = false;
  if (isOn) {
    try {
      const current = await Notifications.getPermissionsAsync();
      granted = current.granted
        ? true
        : current.canAskAgain
          ? (await Notifications.requestPermissionsAsync()).granted
          : false;
    } catch {
      granted = false;
    }
  }
  // Re-plans (or cancels) the scheduled reminders.
  notifyDataChanged();
  return granted;
}
