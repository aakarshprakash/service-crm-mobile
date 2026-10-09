/** Servon brand palette (same blues as the web app). */
export const colors = {
  // Brand kit: Deep Navy #0B2545, Electric Blue #2563EB, Teal Green #10B981, Neutral Gray #E5E7EB.
  navy: '#0B2545',
  brand: '#2563EB',
  brandDark: '#1D4ED8',
  brandSoft: '#EFF4FF',
  accent: '#10B981',
  accentSoft: '#E7F8F1',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  border: '#E5E7EB',
  bg: '#F5F7FB',
  card: '#FFFFFF',
  green: '#047857',
  greenSoft: '#ECFDF5',
  amber: '#B45309',
  amberSoft: '#FFFBEB',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  violet: '#6D28D9',
  violetSoft: '#F5F3FF',
  sky: '#0369A1',
  skySoft: '#F0F9FF',
};

/** Soft card elevation used across the app. */
export const shadow = {
  shadowColor: '#0B2545',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;

export const radius = { sm: 10, md: 14, lg: 18 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const statusTone: Record<string, { fg: string; bg: string }> = {
  open: { fg: colors.sky, bg: colors.skySoft },
  in_progress: { fg: colors.violet, bg: colors.violetSoft },
  pending: { fg: colors.amber, bg: colors.amberSoft },
  completed: { fg: colors.green, bg: colors.greenSoft },
  cancelled: { fg: colors.muted, bg: '#F1F5F9' },
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
  low: { fg: colors.muted, bg: '#F1F5F9' },
};

export const dayTone: Record<string, { fg: string; bg: string }> = {
  present: { fg: '#065F46', bg: '#D1FAE5' },
  half_day: { fg: '#3F6212', bg: '#ECFCCB' },
  absent: { fg: '#B91C1C', bg: '#FEE2E2' },
  leave: { fg: '#075985', bg: '#E0F2FE' },
  unpaid_leave: { fg: '#92400E', bg: '#FEF3C7' },
  holiday: { fg: '#5B21B6', bg: '#EDE9FE' },
  weekly_off: { fg: '#64748B', bg: '#F1F5F9' },
  not_joined: { fg: '#CBD5E1', bg: '#F8FAFC' },
  future: { fg: '#CBD5E1', bg: 'transparent' },
};
