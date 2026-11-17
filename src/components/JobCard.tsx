import { memo, type ReactElement } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/Text';
import { callAge, date, label, schedule } from '@/lib/format';
import { brandOf, modelOf, productTypeOf } from '@/components/JobDetails';
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
  if (job.needs_resume_approval) tags.push(<Tag key="resume" icon="hourglass-outline" text={job.resume_requested_at ? 'Asked office to resume' : 'Needs office approval'} tone={colors.amber} bg={colors.amberSoft} />);
  // Only known when the job came with the customer's coordinates.
  if (job.customer?.lat === null && !['completed', 'cancelled'].includes(job.status)) tags.push(<Tag key="loc" icon="location-outline" text="Location missing" tone={colors.amber} bg={colors.amberSoft} />);
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

/** Google Maps link: the customer's pin when known, otherwise a search on their address. */
export function jobMapUrl(job: Job): string | null {
  const c = job.customer;
  if (c?.lat != null && c?.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  const addr = [c?.address, job.service_location?.name ?? c?.city, c?.pincode].filter(Boolean).join(', ');
  return addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : null;
}

function ActionPill({ icon, text, color, bg, onPress }: { icon: IconName; text: string; color: string; bg: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={15} color={color} />
      <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{text}</Text>
    </Pressable>
  );
}

/** Call / WhatsApp / Directions quick actions. The pills handle their own taps, so the card doesn't open. */
export function JobActions({ job }: { job: Job }) {
  const phone = job.customer?.phone?.trim();
  const map = jobMapUrl(job);
  if (!phone && !map) return null;
  const wa = phone ? (phone.replace(/\D/g, '').length === 10 ? '91' + phone.replace(/\D/g, '') : phone.replace(/\D/g, '')) : '';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {phone && <ActionPill icon="call" text="Call" color={colors.green} bg={colors.greenSoft} onPress={() => Linking.openURL(`tel:${phone}`).catch(() => undefined)} />}
      {phone && <ActionPill icon="logo-whatsapp" text="WhatsApp" color={colors.whatsapp} bg={colors.greenSoft} onPress={() => Linking.openURL(`https://wa.me/${wa}`).catch(() => undefined)} />}
      {map && <ActionPill icon="navigate" text="Directions" color={colors.brand} bg={colors.brandSoft} onPress={() => Linking.openURL(map).catch(() => undefined)} />}
    </View>
  );
}

/** Memoised: a list redraws only the cards whose job changed, not all of them on every refresh. */
export const JobCard = memo(function JobCard({ job: j }: { job: Job }) {
  const p = j.customer_product;
  const c = j.customer;
  // Brand · product type · model, as the office's job form names them.
  const product = [brandOf(p), productTypeOf(p) ?? j.product_category, modelOf(p)].filter(Boolean).join(' · ');
  const serial = p?.serial_no || p?.outdoor_serial_no;
  const phones = [c?.phone, c?.alt_phone].filter(Boolean).join(' · ');
  const old = (j.call_age_days ?? 0) >= 7 ? colors.red : (j.call_age_days ?? 0) >= 3 ? colors.amber : colors.muted;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.bg : colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 })}
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

      <View style={{ gap: 3 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
          {c?.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="construct-outline" size={14} color={colors.red} />
          <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
            {j.complaint_type?.name ?? 'Service'}
          </Text>
        </View>
        {product ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="cube-outline" size={14} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>{product}</Text>
          </View>
        ) : null}
        {serial ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="barcode-outline" size={14} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>{serial}</Text>
          </View>
        ) : null}
      </View>

      <JobAddress job={j} />

      {phones ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="call-outline" size={14} color={colors.muted} />
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{phones}</Text>
        </View>
      ) : null}

      <JobTags job={j} />

      <JobActions job={j} />
    </Pressable>
  );
});
