import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { ForcePasswordChange } from '@/components/ChangePassword';
import { FONT } from '@/components/Text';
import { colors } from '@/components/theme';

export default function AppLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // A temporary password from the office must be replaced before anything else.
  if (user?.must_change_password) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <ForcePasswordChange />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.heading,
        headerTitleStyle: { color: colors.text, fontFamily: FONT.bold, fontSize: 18 },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.card },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
      <Stack.Screen name="start/[id]" options={{ title: 'Start service' }} />
      <Stack.Screen name="visit/[id]" options={{ title: 'Service in progress', gestureEnabled: false }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="expenses" options={{ title: 'My expenses' }} />
    </Stack>
  );
}
