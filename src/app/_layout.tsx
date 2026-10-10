import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { Stack, router, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { PERSIST_MAX_AGE, queryPersister, shouldPersistQuery } from '@/lib/queryCache';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { AuthProvider, useAuth } from '@/lib/auth';
import { api, ApiError, type Envelope } from '@/lib/api';
import { routeForNotification, syncPushToken } from '@/lib/push';
import { initUploads, onUploaded, takeRememberedCapture } from '@/lib/uploads';
import { queuePhoto } from '@/lib/photos';
import { Toaster, toast } from '@/components/toast';
import { StatusPill } from '@/components/StatusPill';
import { Button, Icon, Loading } from '@/components/ui';
import { colors } from '@/components/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Kept (and saved on the phone) for a day so screens open instantly with the last data.
      gcTime: PERSIST_MAX_AGE,
      // Retry dropped connections (common in the field) twice, never 4xx answers.
      retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
  },
});

// Pause queries while offline and refetch on reconnect / when the app comes back to the foreground.
onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((s) => setOnline(s.isConnected !== false));
  return () => sub.remove();
});
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
  return () => sub.remove();
});

// Photos and signatures queued on the phone keep uploading across restarts.
initUploads();
onUploaded((visitId, item) => {
  if (item.kind === 'receipt') queryClient.invalidateQueries({ queryKey: ['my-expenses'] });
  else queryClient.invalidateQueries({ queryKey: ['visit', String(visitId)] });
});

/** Last line of defence: a crash in a screen shows this instead of closing the app. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg }}>
      <Icon name="warning-outline" size={48} color={colors.amber} />
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Something went wrong on this screen</Text>
      <Text style={{ color: colors.muted, textAlign: 'center' }}>Your work is saved. Photos waiting to upload are kept on the phone.</Text>
      {__DEV__ && <Text style={{ color: colors.red, fontSize: 12, textAlign: 'center' }}>{error.message}</Text>}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Button title="Try again" icon="refresh" onPress={retry} />
        <Button title="Home" variant="secondary" icon="home-outline" onPress={() => router.replace('/')} />
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE, buster: Constants.expoConfig?.version ?? '', dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery } }}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
          <StatusPill />
          <Toaster />
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();
  useNotificationTaps(!!user);
  usePushTokenRefresh(!!user);
  useRecoverCameraPhoto(!!user);
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <Loading />
      </View>
    );
  }
  return (
    <>
      <UpdateBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Opens the job (or leave / notifications) a tapped push notification is about. */
function useNotificationTaps(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const go = (data: Record<string, unknown> | undefined) => {
      const to = routeForNotification(data);
      if (to) router.push(to as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      go(last.notification.request.content.data as Record<string, unknown>);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification.request.content.data as Record<string, unknown>));
    return () => sub.remove();
  }, [signedIn]);
}

/**
 * FCM can rotate the device token; send the new one to the server. Uses the token from
 * the event itself and skips one the server already has (never re-fetches it: fetching
 * fires this event again, which looped and flooded the API).
 */
function usePushTokenRefresh(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const sub = Notifications.addPushTokenListener((t) => {
      syncPushToken(String(t.data)).catch(() => undefined);
    });
    return () => sub.remove();
  }, [signedIn]);
}

/** Android may close the app while the camera is open; queue the photo that was taken. */
function useRecoverCameraPhoto(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || Platform.OS !== 'android') return;
    (async () => {
      const result = await ImagePicker.getPendingResultAsync().catch(() => null);
      const capture = takeRememberedCapture();
      if (!result || !capture || !('assets' in result) || result.canceled || !result.assets?.length) return;
      for (const asset of result.assets) await queuePhoto(capture.visitId, capture.type, asset);
      toast.success('Your photo was saved and is uploading');
      router.push({ pathname: '/visit/[id]', params: { id: String(capture.visitId), job: String(capture.jobId) } });
    })().catch(() => undefined);
  }, [signedIn]);
}

function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

/** Asks technicians on an app older than the API supports to update. */
function UpdateBanner() {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    api
      .get<Envelope<{ version: string; min_mobile_version: string }>>('/version')
      .then((r) => setNeeded(newer(r.data.min_mobile_version, Constants.expoConfig?.version ?? '0.0.0')))
      .catch(() => undefined);
  }, []);
  if (!needed) return null;
  return (
    <Pressable onPress={() => Linking.openURL('market://details?id=com.servon.technician').catch(() => undefined)} style={{ backgroundColor: colors.amber, paddingTop: 44, paddingBottom: 10, paddingHorizontal: 16 }}>
      <Text style={{ color: '#fff', fontWeight: '600' }}>A newer version of the Servon app is required. Tap to update.</Text>
    </Pressable>
  );
}
