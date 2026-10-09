import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushStatus = 'registered' | 'denied' | 'unavailable' | 'error';

let lastToken: string | null = null;
let lastStatus: PushStatus | null = null;

/** The FCM token this phone registered with the server (sent on sign-out to unregister). */
export function getPushToken(): string | null {
  return lastToken;
}

export function getPushStatus(): PushStatus | null {
  return lastStatus;
}

/**
 * Registers this phone's native push token (FCM on Android) with the API, which sends
 * job assignments, reschedules, leave decisions and asset issues through FCM.
 * Never throws: push is a convenience and the app works without it (simulators,
 * builds without Firebase config, permission denied).
 */
export async function registerForPush(): Promise<PushStatus> {
  if (!Device.isDevice) return (lastStatus = 'unavailable');
  try {
    if (Platform.OS === 'android') {
      // Must match the channel_id the server sends ("default").
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Jobs and updates',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return (lastStatus = 'denied');
    const token = await Notifications.getDevicePushTokenAsync();
    lastToken = String(token.data);
    await api.post('/auth/device', { token: lastToken, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    return (lastStatus = 'registered');
  } catch (e) {
    // getDevicePushTokenAsync fails when the APK was built without google-services.json.
    lastStatus = /firebase|FCM|google|fetch/i.test(String((e as Error)?.message)) ? 'unavailable' : 'error';
    return lastStatus;
  }
}

/** Where a tapped notification should take the technician. */
export function routeForNotification(data: Record<string, unknown> | undefined | null): string | null {
  if (!data) return null;
  if (data.test) return null;
  if (data.job_id) return `/job/${data.job_id}`;
  if (data.expense_claim_id) return '/expenses';
  if (data.leave_request_id) return '/me';
  if (data.asset_id) return '/';
  return '/notifications';
}
