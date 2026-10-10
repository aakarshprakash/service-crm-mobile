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
/** The token the server already has, so the same token is never sent twice. */
let sentToken: string | null = null;
let inFlight: Promise<PushStatus> | null = null;

const platform = () => (Platform.OS === 'ios' ? 'ios' : 'android');

/**
 * Sends a token to the server only if it differs from the one already sent.
 * Called with the token Android hands us; never asks Firebase again, because asking
 * Firebase fires the token event again (that loop flooded the API with /auth/device).
 */
export async function syncPushToken(token: string): Promise<void> {
  // Android fires the token event while the first registration is still being sent:
  // claim the token up front so the same one is never posted twice.
  if (!token || token === sentToken) return;
  sentToken = token;
  lastToken = token;
  try {
    await api.post('/auth/device', { token, platform: platform() });
  } catch (e) {
    sentToken = null; // let a later attempt retry
    throw e;
  }
}

/** Forget the sent token (sign-out), so the next sign-in registers this phone again. */
export function resetPushRegistration() {
  sentToken = null;
}

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
export function registerForPush(): Promise<PushStatus> {
  // One registration at a time (app start, sign-in and the Me tab can all ask together).
  inFlight ??= doRegister().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRegister(): Promise<PushStatus> {
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
    await syncPushToken(String(token.data));
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
