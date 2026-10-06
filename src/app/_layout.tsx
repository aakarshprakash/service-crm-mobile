import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AuthProvider, useAuth } from '@/lib/auth';
import { api, type Envelope } from '@/lib/api';
import { routeForNotification } from '@/lib/push';
import { Toaster } from '@/components/toast';
import { Loading } from '@/components/ui';
import { colors } from '@/components/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();
  useNotificationTaps(!!user);
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
    if (last) go(last.notification.request.content.data as Record<string, unknown>);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification.request.content.data as Record<string, unknown>));
    return () => sub.remove();
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
