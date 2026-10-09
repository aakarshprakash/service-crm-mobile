import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
let listener: ((t: Toast) => void) | null = null;
let nextId = 1;

function emit(message: string, tone: Toast['tone']) {
  listener?.({ id: nextId++, message, tone });
}

export const toast = {
  success: (m: string) => emit(m, 'success'),
  error: (m: string) => emit(m, 'error'),
  info: (m: string) => emit(m, 'info'),
};

/** One toast at a time, above the tab bar. */
export function Toaster() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listener = (t) => setCurrent(t);
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setCurrent((c) => (c?.id === current.id ? null : c)));
    }, current.tone === 'error' ? 4500 : 2500);
    return () => clearTimeout(timer);
  }, [current, opacity]);

  if (!current) return null;
  const bg = current.tone === 'error' ? colors.red : current.tone === 'success' ? colors.green : colors.text;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 72, opacity }]}>
      <Text style={[styles.toast, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
        {current.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
  toast: { color: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, overflow: 'hidden', fontSize: 14, fontWeight: '500' },
});
