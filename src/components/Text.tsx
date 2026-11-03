import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

/** Inter (the Servon brand typeface) for every weight; React Native can't synthesise weights for custom fonts. */
export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

const BY_WEIGHT: Record<string, string> = {
  normal: FONT.regular,
  '100': FONT.regular,
  '200': FONT.regular,
  '300': FONT.regular,
  '400': FONT.regular,
  '500': FONT.medium,
  '600': FONT.semibold,
  bold: FONT.bold,
  '700': FONT.bold,
  '800': FONT.extrabold,
  '900': FONT.extrabold,
};

/** Drop-in replacement for React Native's Text that maps fontWeight to the matching Inter file. */
export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const family = flat.fontFamily ?? BY_WEIGHT[String(flat.fontWeight ?? '400')] ?? FONT.regular;
  return <RNText {...props} style={[style, { fontFamily: family, fontWeight: 'normal' }]} />;
}
