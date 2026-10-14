/** Servon brand palette (same blues as the web app), in light and dark. */
// Brand kit: Deep Navy #0B2545, Electric Blue #2563EB, Teal Green #10B981, Neutral Gray #E5E7EB.
const light = {
  /** Dark brand surface (active visit banner, visit timer bar): stays dark in both schemes. */
  navy: '#0B2545',
  /** Brand-coloured headings and header icons. */
  heading: '#0B2545',
  brand: '#2563EB',
  brandDark: '#1D4ED8',
  brandSoft: '#EFF4FF',
  /** Text and icons on brand, success and danger fills. */
  onBrand: '#FFFFFF',
  accent: '#10B981',
  accentSoft: '#E7F8F1',
  text: '#0F172A',
  textSoft: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  border: '#E5E7EB',
  inputBorder: '#D5DBE5',
  bg: '#F5F7FB',
  card: '#FFFFFF',
  /** Neutral tag / chip background and pressed rows. */
  chip: '#F1F5F9',
  pressed: '#E2E8F0',
  green: '#047857',
  greenSoft: '#ECFDF5',
  successBg: '#047857',
  amber: '#B45309',
  amberSoft: '#FFFBEB',
  amberBorder: '#FDE68A',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  dangerBg: '#DC2626',
  violet: '#6D28D9',
  violetSoft: '#F5F3FF',
  sky: '#0369A1',
  skySoft: '#F0F9FF',
  whatsapp: '#15803D',
};

export type Palette = typeof light;

const dark: Palette = {
  navy: '#13315C',
  heading: '#E2E8F0',
  brand: '#60A5FA',
  brandDark: '#3B82F6',
  brandSoft: '#172A4A',
  onBrand: '#FFFFFF',
  accent: '#34D399',
  accentSoft: '#0E2E25',
  text: '#E5E9F0',
  textSoft: '#CBD5E1',
  muted: '#94A3B8',
  faint: '#64748B',
  border: '#223047',
  inputBorder: '#2E3E57',
  bg: '#0A1120',
  card: '#111B2E',
  chip: '#1B2740',
  pressed: '#1B2740',
  green: '#4ADE80',
  greenSoft: '#0F2A1E',
  successBg: '#059669',
  amber: '#FBBF24',
  amberSoft: '#2B2210',
  amberBorder: '#5C4614',
  red: '#F87171',
  redSoft: '#2E1518',
  dangerBg: '#DC2626',
  violet: '#C4B5FD',
  violetSoft: '#231C3D',
  sky: '#7DD3FC',
  skySoft: '#0F2436',
  whatsapp: '#4ADE80',
};

export type Scheme = 'light' | 'dark';

/**
 * The active palette. Components read it while rendering, so after applyScheme() the app
 * re-renders (it is remounted by the appearance provider) with the new colours.
 */
export const colors: Palette = { ...light };
export let scheme: Scheme = 'light';

/** Soft card elevation used across the app (none in dark mode, where borders separate cards). */
export const shadow = {
  shadowColor: '#0B2545',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

export const radius = { sm: 10, md: 14, lg: 18 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const statusTone: Record<string, { fg: string; bg: string }> = {};
export const dayTone: Record<string, { fg: string; bg: string }> = {};

function buildTones() {
  Object.assign(statusTone, {
    open: { fg: colors.sky, bg: colors.skySoft },
    in_progress: { fg: colors.violet, bg: colors.violetSoft },
    pending: { fg: colors.amber, bg: colors.amberSoft },
    completed: { fg: colors.green, bg: colors.greenSoft },
    cancelled: { fg: colors.muted, bg: colors.chip },
    approved: { fg: colors.green, bg: colors.greenSoft },
    rejected: { fg: colors.red, bg: colors.redSoft },
    paid: { fg: colors.green, bg: colors.greenSoft },
    partial: { fg: colors.amber, bg: colors.amberSoft },
    unpaid: { fg: colors.red, bg: colors.redSoft },
    submitted: { fg: colors.amber, bg: colors.amberSoft },
    verified: { fg: colors.brand, bg: colors.brandSoft },
    closed: { fg: colors.green, bg: colors.greenSoft },
    high: { fg: colors.red, bg: colors.redSoft },
    medium: { fg: colors.amber, bg: colors.amberSoft },
    low: { fg: colors.muted, bg: colors.chip },
  });
  Object.assign(
    dayTone,
    scheme === 'dark'
      ? {
          present: { fg: '#6EE7B7', bg: '#0F2E25' },
          half_day: { fg: '#BEF264', bg: '#1E2A10' },
          absent: { fg: '#FCA5A5', bg: '#3A1518' },
          leave: { fg: '#7DD3FC', bg: '#0F2436' },
          unpaid_leave: { fg: '#FCD34D', bg: '#2B2210' },
          holiday: { fg: '#C4B5FD', bg: '#231C3D' },
          weekly_off: { fg: '#94A3B8', bg: '#1B2740' },
          not_joined: { fg: '#475569', bg: '#0F1828' },
          future: { fg: '#475569', bg: 'transparent' },
        }
      : {
          present: { fg: '#065F46', bg: '#D1FAE5' },
          half_day: { fg: '#3F6212', bg: '#ECFCCB' },
          absent: { fg: '#B91C1C', bg: '#FEE2E2' },
          leave: { fg: '#075985', bg: '#E0F2FE' },
          unpaid_leave: { fg: '#92400E', bg: '#FEF3C7' },
          holiday: { fg: '#5B21B6', bg: '#EDE9FE' },
          weekly_off: { fg: '#64748B', bg: '#F1F5F9' },
          not_joined: { fg: '#CBD5E1', bg: '#F8FAFC' },
          future: { fg: '#CBD5E1', bg: 'transparent' },
        },
  );
}
buildTones();

const listeners = new Set<() => void>();

/** Rebuild module-level styles (StyleSheet objects) when the scheme changes. */
export function onSchemeChange(fn: () => void) {
  listeners.add(fn);
}

export function applyScheme(next: Scheme) {
  if (next === scheme) return;
  scheme = next;
  Object.assign(colors, next === 'dark' ? dark : light);
  shadow.shadowOpacity = next === 'dark' ? 0 : 0.06;
  shadow.elevation = next === 'dark' ? 0 : 2;
  buildTones();
  listeners.forEach((fn) => fn());
}
