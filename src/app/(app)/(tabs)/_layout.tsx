import { Pressable, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, type Paginated } from '@/lib/api';
import type { NotificationItem } from '@/lib/types';
import { colors } from '@/components/theme';

function Bell() {
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Paginated<NotificationItem> & { meta: { unread: number } }>('/notifications', { per_page: 20 }),
    refetchInterval: 60_000,
  });
  const unread = (q.data?.meta.unread as number) ?? 0;
  return (
    <Pressable onPress={() => router.push('/notifications')} hitSlop={10} style={{ marginRight: 16 }} accessibilityLabel={`Notifications, ${unread} unread`}>
      <Ionicons name="notifications-outline" size={24} color={colors.text} />
      {unread > 0 && <View style={{ position: 'absolute', right: -2, top: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red }} />}
    </Pressable>
  );
}

const icon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={color as string} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        headerRight: () => <Bell />,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="jobs" options={{ title: 'My jobs', tabBarIcon: icon('clipboard-outline') }} />
      <Tabs.Screen name="cash" options={{ title: 'My cash', tabBarIcon: icon('wallet-outline') }} />
      <Tabs.Screen name="parts" options={{ title: 'Parts', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
