import type { ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { FONT, Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNetworkState } from 'expo-network';
import { ApiError } from '@/lib/api';
import { label } from '@/lib/format';
import { colors, radius, shadow, statusTone } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

/** Scrollable screen body with pull-to-refresh. */
export function Screen({ children, refreshing, onRefresh, padded = true, style }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; padded?: boolean; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    // Android draws edge to edge, so the window no longer shrinks for the keyboard: pad on both
    // platforms (offset = status bar + header, which sit above this view) so fields stay visible.
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding" keyboardVerticalOffset={insets.top + 56}>
      <ScrollView
        contentContainerStyle={[padded && { padding: 16, paddingBottom: 32 }, { gap: 12 }, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.brand]} /> : undefined}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, title, right, style, padded = true }: { children: ReactNode; title?: string; right?: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return (
    <View style={[styles.card, style]}>
      {(title || right) && (
        <View style={[styles.cardHead, !padded && { paddingHorizontal: 16 }]}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}
          {right}
        </View>
      )}
      <View style={padded ? { padding: 16, paddingTop: title || right ? 0 : 16 } : undefined}>{children}</View>
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';

export function Button({
  title, onPress, variant = 'primary', icon, loading, disabled, size = 'md', style,
}: { title: string; onPress?: () => void; variant?: Variant; icon?: IconName; loading?: boolean; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; style?: StyleProp<ViewStyle> }) {
  const v = {
    primary: { bg: colors.brand, fg: '#fff', border: colors.brand },
    secondary: { bg: '#fff', fg: colors.text, border: colors.border },
    success: { bg: colors.green, fg: '#fff', border: colors.green },
    danger: { bg: colors.red, fg: '#fff', border: colors.red },
    ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
  }[variant];
  const h = { sm: 36, md: 46, lg: 54 }[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { height: h, backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, paddingHorizontal: size === 'sm' ? 12 : 16 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={v.fg} /> : null}
      <Text style={{ color: v.fg, fontWeight: '600', fontSize: size === 'sm' ? 13 : size === 'lg' ? 17 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label: text, error, hint, children, required }: { label?: string; error?: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      {text && (
        <Text style={styles.label}>
          {text}
          {required && <Text style={{ color: colors.red }}> *</Text>}
        </Text>
      )}
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps & { invalid?: boolean }) {
  const { invalid, style, multiline, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      {...rest}
      multiline={multiline}
      style={[styles.input, multiline && { height: undefined, minHeight: 84, paddingTop: 12, textAlignVertical: 'top' }, invalid && { borderColor: colors.red }, style]}
    />
  );
}

/** Row of mutually exclusive choices (status filter, payment method, service type…). */
export function Segmented<T extends string>({ value, onChange, options, columns }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: IconName; count?: number }[]; columns?: number }) {
  return (
    <View style={[styles.segmented, columns ? { flexWrap: 'wrap' } : null]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, columns ? { flexBasis: `${100 / columns - 2}%`, flexGrow: 0 } : null, on && styles.segmentOn]}
          >
            {o.icon && <Ionicons name={o.icon} size={18} color={on ? colors.brand : colors.muted} />}
            <Text style={[styles.segmentText, on && { color: colors.brand }]} numberOfLines={1}>
              {o.label}
              {o.count !== undefined ? ` ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone?: string }) {
  const t = statusTone[tone ?? text] ?? { fg: colors.muted, bg: '#F1F5F9' };
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '600' }}>{label(text)}</Text>
    </View>
  );
}

export function Row({ k, v, strong, vStyle }: { k: string; v: ReactNode; strong?: boolean; vStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.muted, fontSize: 14, flexShrink: 1 }}>{k}</Text>
      {typeof v === 'string' || typeof v === 'number' ? <Text style={[{ color: colors.text, fontSize: 14, fontWeight: strong ? '700' : '400', textAlign: 'right', flexShrink: 1 }, vStyle]}>{v}</Text> : v}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ color: colors.muted, fontSize: 13 }, style]}>{children}</Text>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{children}</Text>;
}

export function Loading() {
  const net = useNetworkState();
  const offline = net.isConnected === false || net.isInternetReachable === false;
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator size="large" color={colors.brand} />
      {offline && <Text style={{ color: colors.muted, textAlign: 'center' }}>No internet connection. This loads automatically when you’re back online.</Text>}
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', title, message }: { icon?: IconName; title: string; message?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 6 }}>
      <Ionicons name={icon} size={36} color={colors.faint} />
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{title}</Text>
      {message && <Text style={{ color: colors.muted, textAlign: 'center' }}>{message}</Text>}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 12 }}>
      <Ionicons name="cloud-offline-outline" size={36} color={colors.faint} />
      <Text style={{ color: colors.text, textAlign: 'center' }}>{msg}</Text>
      {onRetry && <Button title="Try again" variant="secondary" size="sm" onPress={onRetry} />}
    </View>
  );
}

/** Bottom sheet style modal. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    // Full-screen modal window, so the keyboard position and this view share coordinates.
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={styles.sheetFoot}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function StatTile({ label: l, value, tone = colors.brand, icon, onPress }: { label: string; value: ReactNode; tone?: string; icon?: IconName; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.tile, { backgroundColor: tone + '12', borderColor: tone + '26' }, pressed && { opacity: 0.8 }]}
    >
      {icon && <Ionicons name={icon} size={18} color={tone} style={{ marginBottom: 6 }} />}
      <Text style={{ fontSize: 24, fontWeight: '800', color: tone }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }} numberOfLines={1}>
        {l}
      </Text>
    </Pressable>
  );
}

/** Navigation row: outlined icon in a tinted square, title, optional detail, chevron. */
export function ListRow({ icon, title, detail, right, onPress, tone = colors.brand, first }: { icon: IconName; title: string; detail?: string; right?: ReactNode; onPress?: () => void; tone?: string; first?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border, backgroundColor: pressed ? colors.bg : 'transparent' }]}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: tone + '14', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={19} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{title}</Text>
        {detail ? <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{detail}</Text> : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
    </Pressable>
  );
}

/** − value + control for quantities (parts used on a visit). */
export function Stepper({ value, onChange, step = 1, min = step, max = 100000, decimals = 0 }: { value: string; onChange: (v: string) => void; step?: number; min?: number; max?: number; decimals?: number }) {
  const n = Number(value) || 0;
  const set = (v: number) => onChange(String(+Math.min(max, Math.max(min, v)).toFixed(Math.max(decimals, 3)).replace(/\.?0+$/, '')));
  const btn = (icon: IconName, label: string, delta: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => set(n + delta)}
      hitSlop={6}
      style={({ pressed }) => ({ width: 46, height: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.brandSoft : '#fff', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 })}
    >
      <Ionicons name={icon} size={22} color={colors.brand} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn('remove', 'Less', -step, n - step < min)}
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(decimals ? /[^\d.]/g : /\D/g, ''))}
        keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        style={[styles.input, { flex: 1, textAlign: 'center', fontFamily: FONT.semibold, fontSize: 18 }]}
        accessibilityLabel="Quantity"
      />
      {btn('add', 'More', step, n + step > max)}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.sm + 2, borderWidth: 1 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: '#334155' },
  error: { fontSize: 12, color: colors.red },
  hint: { fontSize: 12, color: colors.muted },
  input: { height: 48, borderWidth: 1, borderColor: '#D5DBE5', borderRadius: radius.sm + 2, paddingHorizontal: 14, fontSize: 16, color: colors.text, backgroundColor: '#fff', fontFamily: FONT.regular },
  segmented: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm + 2, paddingVertical: 10, paddingHorizontal: 6, backgroundColor: '#fff', marginBottom: 6 },
  segmentOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  sheetFoot: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  tile: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: 14, gap: 1 },
});
