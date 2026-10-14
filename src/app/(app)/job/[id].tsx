import { useState } from 'react';
import { Linking, Pressable, Share, View } from 'react-native';
import { Text } from '@/components/Text';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { callAge, date, dateTime, label, money, schedule } from '@/lib/format';
import { useTechDashboard } from '@/lib/punch';
import type { Job } from '@/lib/types';
import { toast } from '@/components/toast';
import { Badge, Button, Card, ErrorView, Icon, Loading, Muted, Row, Screen, type IconName } from '@/components/ui';
import { CollectPayment } from '@/components/CollectPayment';
import { JobAddress, JobTags, ScheduleChip } from '@/components/JobCard';
import { PunchFirst } from '@/components/PunchFirst';
import { colors } from '@/components/theme';

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['tech-job', id], queryFn: () => api.get<Envelope<Job>>(`/jobs/${id}`).then((r) => r.data) });
  const { user } = useAuth();
  const dash = useTechDashboard().data;
  const [punchFirst, setPunchFirst] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const job = q.data;

  if (q.isLoading) return <Loading />;
  if (q.error || !job) return <ErrorView error={q.error} onRetry={q.refetch} />;

  const active = job.visits?.find((v) => v.status === 'in_progress');
  const c = job.customer;
  const p = job.customer_product;
  const address = [c?.address, c?.city, c?.pincode].filter(Boolean).join(', ');
  const history = (job.visits ?? []).filter((v) => v.status !== 'in_progress');
  const phone = (c?.phone ?? '').replace(/\D/g, '');
  const finished = ['completed', 'cancelled'].includes(job.status);

  // Punch-in check first (the server checks again), then "Check details" before the visit starts.
  const startService = () => {
    const onDuty = (dash?.punch_status ?? user?.punch_status) === 'in';
    if (dash?.attendance?.require_punch_in !== false && !onDuty) setPunchFirst(true);
    else router.push({ pathname: '/start/[id]', params: { id: job.id } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: job.crm_call_id,
          headerRight: () => (
            <Pressable onPress={() => shareJob(job)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Share job details">
              <Icon name="share-social-outline" size={22} color={colors.heading} />
            </Pressable>
          ),
        }}
      />
      <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Badge text={job.status} />
          <Badge text={job.priority} />
          {!finished && job.call_age_days != null && <Badge text={callAge(job.call_age_days)} tone={(job.call_age_days ?? 0) >= 3 ? 'pending' : 'none'} />}
        </View>
        <ScheduleChip job={job} size="lg" />

        <Card>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{c?.name}</Text>
          <Muted>
            {c?.phone}
            {c?.alt_phone ? ` · ${c.alt_phone}` : ''}
            {c?.crm_id ? ` · CRM ID ${c.crm_id}` : ''}
          </Muted>
          <View style={{ marginTop: 10 }}>
            <JobAddress job={job} lines={4} />
          </View>
          {c?.lat != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, alignSelf: 'flex-start', backgroundColor: c.location_source === 'customer' ? colors.accentSoft : colors.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Icon name="navigate-circle-outline" size={14} color={c.location_source === 'customer' ? colors.green : colors.brand} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: c.location_source === 'customer' ? colors.green : colors.brand }}>
                {c.location_source === 'customer' ? 'Customer shared exact location' : c.location_source === 'technician' ? 'Location saved on site' : 'Exact location available'}
                {c.location_updated_at ? ` · ${dateTime(c.location_updated_at)}` : ''}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Action icon="call" label="Call" color={colors.green} onPress={() => Linking.openURL(`tel:${c?.phone}`)} />
            <Action icon="logo-whatsapp" label="WhatsApp" color={colors.whatsapp} onPress={() => Linking.openURL(`https://wa.me/${phone.length === 10 ? '91' + phone : phone}`)} />
            <Action icon="navigate" label="Directions" color={colors.brand} onPress={() => Linking.openURL(mapsLink(job, true) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)} />
            <Action icon="share-social-outline" label="Share" color={colors.violet} onPress={() => shareJob(job)} />
          </View>
        </Card>

        <Card title="Complaint & product">
          <View style={{ marginBottom: 8 }}>
            <JobTags job={job} />
          </View>
          <Row k="Complaint" v={job.complaint_type?.name ?? '—'} />
          <Row k="Summary" v={job.complaint_summary?.name ?? '—'} />
          <Row k="Product" v={[p?.product?.brand?.name, p?.product?.model_name].filter(Boolean).join(' ') || '—'} />
          <Row k="Serial no." v={p?.serial_no ?? '—'} />
          {p?.outdoor_serial_no && <Row k="Outdoor serial" v={p.outdoor_serial_no} />}
          <Row k="Warranty" v={p ? `${label(p.warranty_type)}${p.under_warranty === undefined ? '' : p.under_warranty ? ' · covered' : ' · expired'}` : '—'} />
          <Row k="Purchased" v={date(p?.purchase_date)} />
          <Row k="Logged" v={dateTime(job.created_at)} />
          {job.complaint_details && (
            <View style={{ marginTop: 10, backgroundColor: colors.bg, borderRadius: 10, padding: 12 }}>
              <Text style={{ color: colors.text }}>{job.complaint_details}</Text>
            </View>
          )}
        </Card>

        {!!job.previous_services?.length && (
          <Card title="Previous service" padded={false}>
            {job.previous_services.map((s, i) => (
              <View key={`${s.job_id}-${i}`} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>
                    {date(s.date)} · {s.crm_call_id}
                  </Text>
                  <Badge text={s.status} />
                </View>
                <Muted>
                  {[s.complaint, s.action_taken, s.technician].filter(Boolean).join(' · ')}
                  {s.total_charge ? ` · ${money(s.total_charge)}` : ''}
                </Muted>
                {s.summary && <Text style={{ color: colors.text, fontSize: 13 }}>{s.summary}</Text>}
              </View>
            ))}
          </Card>
        )}

        {job.invoice && (
          <Card title="Bill">
            <Row k="Invoice" v={job.invoice.invoice_number} />
            <Row k="Total" v={money(job.invoice.total_amount)} />
            <Row k="Paid" v={money(job.invoice.paid_amount)} />
            <Row k="Balance" v={money(job.invoice.balance_amount)} strong vStyle={job.invoice.balance_amount > 0 ? { color: colors.red } : undefined} />
          </Card>
        )}

        {!!history.length && (
          <Card title="Visits on this job" padded={false}>
            {history.map((v, i) => (
              <View key={v.id} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{date(v.start_time)}</Text>
                  <Badge text={v.status} />
                </View>
                <Muted>
                  {v.technician?.name} · {label(v.service_type)} · {money(v.total_charge)}
                </Muted>
                {v.service_summary && <Text style={{ color: colors.text, fontSize: 13 }}>{v.service_summary}</Text>}
              </View>
            ))}
          </Card>
        )}

        {active ? (
          <Button title="Continue service" size="lg" icon="play" onPress={() => router.push({ pathname: '/visit/[id]', params: { id: active.id, job: job.id } })} />
        ) : (
          ['open', 'pending'].includes(job.status) && <Button title="Start service" size="lg" icon="construct" onPress={startService} />
        )}
        {job.invoice && job.invoice.balance_amount > 0 && !active && (
          <Button title={`Collect balance ${money(job.invoice.balance_amount)}`} variant="secondary" icon="cash-outline" onPress={() => setCollecting(true)} />
        )}
      </Screen>
      <PunchFirst
        open={punchFirst}
        onClose={() => setPunchFirst(false)}
        onPunched={() => {
          setPunchFirst(false);
          router.push({ pathname: '/start/[id]', params: { id: job.id } });
        }}
      />
      {collecting && job.invoice && (
        <CollectPayment
          invoiceId={job.invoice.id}
          due={job.invoice.balance_amount}
          note={`Job ${job.crm_call_id}`}
          branchId={job.branch_id}
          onClose={() => setCollecting(false)}
          onDone={() => {
            setCollecting(false);
            q.refetch();
          }}
        />
      )}
    </>
  );
}

function Action({ icon, label: text, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: pressed ? colors.pressed : colors.bg })}>
      <Icon name={icon} color={color} size={22} />
      <Text style={{ fontSize: 12, fontWeight: '600', color }}>{text}</Text>
    </Pressable>
  );
}

function mapsLink(job: Job, directions = false): string | null {
  const c = job.customer;
  if (c?.lat == null || c.lng == null) return null;
  return directions ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` : `https://maps.google.com/?q=${c.lat},${c.lng}`;
}

/** The job card as plain text, for WhatsApp or any other app (e.g. to a colleague or the office). */
async function shareJob(job: Job) {
  const c = job.customer;
  const p = job.customer_product;
  const product = [p?.product?.brand?.name, p?.product?.model_name].filter(Boolean).join(' ');
  const last = job.previous_services?.[0];
  const lines = [
    `Job ${job.crm_call_id} · ${label(job.status)} · ${label(job.priority)} priority`,
    `Visit: ${schedule(job.scheduled_at).text}`,
    `Customer: ${c?.name ?? '—'}, ${c?.phone ?? ''}${c?.alt_phone ? ` / ${c.alt_phone}` : ''}`,
    `Address: ${[c?.address, c?.city, c?.pincode].filter(Boolean).join(', ') || '—'}`,
    mapsLink(job) && `Map: ${mapsLink(job)}`,
    `Complaint: ${job.complaint_type?.name ?? 'Service'}${job.complaint_details ? ` – ${job.complaint_details}` : ''}`,
    product && `Product: ${product}${p?.serial_no ? ` · SN ${p.serial_no}` : ''}`,
    p && `Warranty: ${p.under_warranty ? `covered${p.warranty_expiry ? ` till ${date(p.warranty_expiry)}` : ''}` : p.warranty_type || p.warranty_expiry ? 'out of warranty' : 'not recorded'}${p.purchase_date ? ` · bought ${date(p.purchase_date)}` : ''}`,
    `Call type: ${label(job.call_type)}${job.call_age_days != null ? ` · ${callAge(job.call_age_days).toLowerCase()}` : ''}`,
    last && `Last service: ${date(last.date)}${last.action_taken ? ` · ${last.action_taken}` : ''}${last.summary ? ` – ${last.summary}` : ''}`,
  ].filter(Boolean);
  try {
    await Share.share({ message: lines.join('\n'), title: `Job ${job.crm_call_id}` });
  } catch (e) {
    toast.error((e as Error).message);
  }
}
