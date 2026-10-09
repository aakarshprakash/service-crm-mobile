import { Stack } from 'expo-router';
import { FONT } from '@/components/Text';
import { colors } from '@/components/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.navy,
        headerTitleStyle: { color: colors.text, fontFamily: FONT.bold, fontSize: 18 },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#fff' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
      <Stack.Screen name="visit/[id]" options={{ title: 'Service in progress', gestureEnabled: false }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="expenses" options={{ title: 'My expenses' }} />
    </Stack>
  );
}
