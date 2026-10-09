import { View } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkState } from 'expo-network';
import { useUploads } from '@/lib/uploads';
import { Icon } from './ui';
import { colors } from './theme';

/**
 * Small floating status above the tab bar: offline, and how many photos / signatures
 * are still waiting on the phone. Never blocks touches.
 */
export function StatusPill() {
  const insets = useSafeAreaInsets();
  const net = useNetworkState();
  const uploads = useUploads();
  const offline = net.isConnected === false || net.isInternetReachable === false;
  const failed = uploads.filter((u) => u.status === 'failed').length;
  const waiting = uploads.length - failed;

  if (!offline && !uploads.length) return null;

  let text: string;
  let tone = colors.text;
  let icon: 'cloud-offline-outline' | 'cloud-upload-outline' | 'alert-circle-outline' = 'cloud-upload-outline';
  if (offline) {
    icon = 'cloud-offline-outline';
    tone = colors.amber;
    text = waiting ? `Offline · ${waiting} upload${waiting > 1 ? 's' : ''} saved on phone` : 'You are offline';
  } else if (failed) {
    icon = 'alert-circle-outline';
    tone = colors.red;
    text = `${failed} upload${failed > 1 ? 's' : ''} need attention`;
  } else {
    text = `Uploading ${waiting} item${waiting > 1 ? 's' : ''}…`;
  }

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 74, alignItems: 'center' }}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
          backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border,
          shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4,
        }}
      >
        <Icon name={icon} size={16} color={tone} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: tone }}>{text}</Text>
      </View>
    </View>
  );
}
