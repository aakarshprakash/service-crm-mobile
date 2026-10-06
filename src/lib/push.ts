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

/**
 * Registers this phone's native push token (FCM on Android) with the API, which sends
 * job assignments, reschedules, leave decisions and asset issues through FCM.
 * Silently does nothing where push isn't available (simulators, Expo Go on Android,
 * builds without Firebase config, permission denied).
 */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Jobs and updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1D40D8',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const token = await Notifications.getDevicePushTokenAsync();
    await api.post('/auth/device', { token: String(token.data), platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  } catch {
    // Push is a convenience; the app works without it.
  }
}

/** Where a tapped notification should take the technician. */
export function routeForNotification(data: Record<string, unknown> | undefined | null): string | null {
  if (!data) return null;
  if (data.job_id) return `/job/${data.job_id}`;
  if (data.leave_request_id) return '/me';
  if (data.asset_id) return '/';
  return '/notifications';
}
