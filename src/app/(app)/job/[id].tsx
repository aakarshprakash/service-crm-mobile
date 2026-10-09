import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Envelope } from '@/lib/api';
import { date, dateTime, label, money } from '@/lib/format';
import { getPosition, tryPosition } from '@/lib/location';
import type { Job } from '@/lib/types';
import { toast } from '@/components/toast';
import { Badge, Button, Card, ErrorView, Icon, Loading, Muted, Row, Screen, Segmented, Sheet, type IconName } from '@/components/ui';
import { CollectPayment } from '@/components/CollectPayment';
import { colors } from '@/components/theme';

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['tech-job', id], queryFn: () => api.get<Envelope<Job>>(`/jobs/${id}`).then((r) => r.data) });
  const [starting, setStarting] = useState(false);
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

  return (
    <>
      <Stack.Screen options={{ title: job.crm_call_id }} />
      <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Badge text={job.status} />
          <Badge text={job.priority} />
          {job.service_location && <Badge text={job.service_location.name} tone="none" />}
        </View>

        <Card>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{c?.name}</Text>
          <Muted>{address || 'No address'}</Muted>
          {c?.crm_id && <Muted style={{ fontSize: 12 }}>CRM ID {c.crm_id}</Muted>}
          {c?.lat != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, alignSelf: 'flex-start', backgroundColor: c.location_source === 'customer' ? colors.accentSoft : colors.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Icon name="location" size={14} color={c.location_source === 'customer' ? colors.green : colors.brand} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: c.location_source === 'customer' ? colors.green : colors.brand }}>
                {c.location_source === 'customer' ? 'Customer shared exact location' : c.location_source === 'technician' ? 'Location saved on site' : 'Exact location available'}
                {c.location_updated_at ? ` · ${dateTime(c.location_updated_at)}` : ''}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Action icon="call" label="Call" color={colors.green} onPress={() => Linking.openURL(`tel:${c?.phone}`)} />
            <Action icon="logo-whatsapp" label="WhatsApp" color="#15803D" onPress={() => Linking.openURL(`https://wa.me/${phone.length === 10 ? '91' + phone : phone}`)} />
            <Action
              icon="navigate"
              label="Directions"
              color={colors.brand}
              onPress={() =>
                Linking.openURL(c?.lat ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
              }
            />
          </View>
        </Card>

        <Card title="Complaint & product">
          <Row k="Complaint" v={job.complaint_type?.name ?? '—'} />
          <Row k="Summary" v={job.complaint_summary?.name ?? '—'} />
          <Row k="Product" v={[p?.product?.brand?.name, p?.product?.model_name].filter(Boolean).join(' ') || '—'} />
          <Row k="Serial no." v={p?.serial_no ?? '—'} />
          {p?.outdoor_serial_no && <Row k="Outdoor serial" v={p.outdoor_serial_no} />}
          <Row k="Warranty" v={p ? `${label(p.warranty_type)}${p.under_warranty === undefined ? '' : p.under_warranty ? ' · covered' : ' · expired'}` : '—'} />
          <Row k="Purchased" v={date(p?.purchase_date)} />
          <Row k="Scheduled" v={dateTime(job.scheduled_at)} />
          <Row k="Call type" v={label(job.call_type)} />
          {job.complaint_details && (
            <View style={{ marginTop: 10, backgroundColor: colors.bg, borderRadius: 10, padding: 12 }}>
              <Text style={{ color: colors.text }}>{job.complaint_details}</Text>
            </View>
          )}
        </Card>

        {job.invoice && (
          <Card title="Bill">
            <Row k="Invoice" v={job.invoice.invoice_number} />
            <Row k="Total" v={money(job.invoice.total_amount)} />
            <Row k="Paid" v={money(job.invoice.paid_amount)} />
            <Row k="Balance" v={money(job.invoice.balance_amount)} strong vStyle={job.invoice.balance_amount > 0 ? { color: colors.red } : undefined} />
          </Card>
        )}

        {!!history.length && (
          <Card title="Visit history" padded={false}>
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
          ['open', 'pending'].includes(job.status) && <Button title="Start service" size="lg" icon="construct" onPress={() => setStarting(true)} />
        )}
        {job.invoice && job.invoice.balance_amount > 0 && !active && (
          <Button title={`Collect balance ${money(job.invoice.balance_amount)}`} variant="secondary" icon="cash-outline" onPress={() => setCollecting(true)} />
        )}
      </Screen>
      {starting && <StartService job={job} onClose={() => setStarting(false)} />}
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
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: pressed ? '#E2E8F0' : colors.bg })}>
      <Icon name={icon} color={color} size={22} />
      <Text style={{ fontSize: 12, fontWeight: '600', color }}>{text}</Text>
    </Pressable>
  );
}

/** "Ready to start the service?" — service type, product check, location for on-site visits. */
function StartService({ job, onClose }: { job: Job; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<'on_site' | 'tele_call' | 'office'>('on_site');
  const [busy, setBusy] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const p = job.customer_product;

  const start = async () => {
    setBusy(true);
    setLocError(null);
    try {
      let pos = null;
      if (type === 'on_site') {
        try {
          pos = await getPosition();
        } catch (e) {
          setLocError((e as Error).message);
          return;
        }
      } else {
        pos = await tryPosition();
      }
      await api.post(`/jobs/${job.id}/visits/start`, { service_type: type, ...(pos ?? {}) });
      toast.success('Service started. Timer is running.');
      await qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
      qc.invalidateQueries({ queryKey: ['tech-dashboard'] });
      const fresh = await api.get<Envelope<Job>>(`/jobs/${job.id}`);
      const active = fresh.data.visits?.find((v) => v.status === 'in_progress');
      onClose();
      if (active) router.push({ pathname: '/visit/[id]', params: { id: active.id, job: job.id } });
    } catch (e) {
      const err = e as ApiError;
      if (err instanceof ApiError && err.field('location')) setLocError(err.field('location')!);
      else toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Ready to start the service?"
      footer={
        <>
          <Button title="Not yet" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
          <Button title={locError ? 'Try again' : 'Start'} style={{ flex: 1 }} loading={busy} onPress={start} />
        </>
      }
    >
      <Segmented
        value={type}
        onChange={(v) => { setType(v); setLocError(null); }}
        options={[
          { value: 'on_site', label: 'On site', icon: 'location-outline' },
          { value: 'tele_call', label: 'Tele call', icon: 'call-outline' },
          { value: 'office', label: 'Office', icon: 'business-outline' },
        ]}
      />
      <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 12, gap: 2 }}>
        <Muted style={{ fontSize: 11, fontWeight: '700' }}>CONFIRM PRODUCT</Muted>
        <Text style={{ color: colors.text }}>{[p?.product?.brand?.name, p?.product?.model_name].filter(Boolean).join(' ') || 'Product not specified'}</Text>
        <Muted>SN {p?.serial_no ?? '—'}{p?.outdoor_serial_no ? ` · Outdoor ${p.outdoor_serial_no}` : ''}</Muted>
      </View>
      {locError && (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.redSoft, borderRadius: 10, padding: 12 }}>
          <Icon name="location-outline" color={colors.red} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.red, fontWeight: '700' }}>Location needed for on-site visits</Text>
            <Text style={{ color: colors.red }}>{locError}</Text>
          </View>
        </View>
      )}
    </Sheet>
  );
}
