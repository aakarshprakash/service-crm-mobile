import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/Text';
import { callAge, date, label, schedule } from '@/lib/format';
import type { Job } from '@/lib/types';
import { Badge, Icon, type IconName } from '@/components/ui';
import { colors, radius } from '@/components/theme';

const CALL_TYPE: Record<string, string> = { crm_call: 'CRM call', walk_in: 'Walk-in', referral: 'Referral', portal: 'Customer portal' };

/** Visit time, made prominent: red when overdue, blue for today. */
export function ScheduleChip({ job, size = 'md' }: { job: Job; size?: 'md' | 'lg' }) {
  const s = schedule(job.scheduled_at);
  const finished = ['completed', 'cancelled'].includes(job.status);
  const overdue = !finished && s.when === 'past';
  const tone = overdue ? { fg: colors.red, bg: colors.redSoft } : s.when === 'today' && !finished ? { fg: colors.brand, bg: colors.brandSoft } : { fg: colors.text, bg: colors.chip };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: tone.bg, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: size === 'lg' ? 8 : 5 }}>
      <Icon name={overdue ? 'alert-circle' : 'calendar'} size={size === 'lg' ? 18 : 15} color={tone.fg} />
      <Text style={{ color: tone.fg, fontWeight: '700', fontSize: size === 'lg' ? 16 : 13 }}>
        {overdue ? 'Overdue · ' : ''}
        {s.text}
      </Text>
    </View>
  );
}

function Tag({ icon, text, tone = colors.muted, bg = colors.chip }: { icon?: IconName; text: string; tone?: string; bg?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      {icon && <Icon name={icon} size={12} color={tone} />}
      <Text style={{ color: tone, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

/** Call type, service type, warranty and purchase date as small tags. */
export function JobTags({ job }: { job: Job }) {
  const p = job.customer_product;
  const tags: ReactElement[] = [];
  tags.push(<Tag key="call" icon="call-outline" text={CALL_TYPE[job.call_type] ?? label(job.call_type)} />);
  if (job.service_type) tags.push(<Tag key="svc" icon={job.service_type === 'on_site' ? 'home-outline' : job.service_type === 'tele_call' ? 'headset-outline' : 'business-outline'} text={label(job.service_type)} />);
  if (p) {
    if (p.under_warranty) tags.push(<Tag key="w" icon="shield-checkmark" text={`${p.warranty_type === 'amc' ? 'AMC' : p.warranty_type === 'extended' ? 'Extended warranty' : 'In warranty'}${p.warranty_expiry ? ` till ${date(p.warranty_expiry)}` : ''}`} tone={colors.green} bg={colors.greenSoft} />);
    else if (p.warranty_type || p.warranty_expiry) tags.push(<Tag key="w" icon="shield-outline" text="Out of warranty" tone={colors.amber} bg={colors.amberSoft} />);
    if (p.purchase_date) tags.push(<Tag key="pd" icon="bag-handle-outline" text={`Bought ${date(p.purchase_date)}`} />);
  }
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{tags}</View>;
}

/** Area (service location, or city + PIN) in bold, then the street address. */
export function JobAddress({ job, lines = 2 }: { job: Job; lines?: number }) {
  const c = job.customer;
  const area = [job.service_location?.name ?? c?.city, c?.pincode].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 10 }}>
      <Icon name="location" size={18} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{area || 'Area not set'}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={lines}>{c?.address || 'No address on record'}</Text>
      </View>
    </View>
  );
}

export function JobCard({ job: j }: { job: Job }) {
  const product = [j.customer_product?.product?.brand?.name, j.customer_product?.product?.model_name].filter(Boolean).join(' ');
  const old = (j.call_age_days ?? 0) >= 7 ? colors.red : (j.call_age_days ?? 0) >= 3 ? colors.amber : colors.muted;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.bg : colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontWeight: '700', color: colors.text }}>{j.crm_call_id}</Text>
          {j.call_age_days != null && !['completed', 'cancelled'].includes(j.status) && <Text style={{ fontSize: 12, fontWeight: '600', color: old }}>{callAge(j.call_age_days)}</Text>}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {j.priority === 'high' && <Badge text="high" />}
          <Badge text={j.status} />
        </View>
      </View>
      <ScheduleChip job={j} />
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
          {j.customer?.name}
        </Text>
        <Text style={{ color: colors.text }} numberOfLines={1}>
          {j.complaint_type?.name ?? 'Service'}
          {product ? <Text style={{ color: colors.muted }}> · {product}</Text> : null}
        </Text>
      </View>
      <JobAddress job={j} />
      <JobTags job={j} />
    </Pressable>
  );
}
