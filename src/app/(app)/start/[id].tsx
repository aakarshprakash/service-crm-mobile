import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text } from '@/components/Text';
import { api, ApiError, type Envelope } from '@/lib/api';
import { isGone } from '@/lib/hooks';
import { getPosition, tryPosition } from '@/lib/location';
import { DASHBOARD_KEY } from '@/lib/punch';
import type { Job, Visit } from '@/lib/types';
import { toast } from '@/components/toast';
import { ComplaintFields, ProductFields, callPayload, initialCallForm, type CallForm } from '@/components/CallDetails';
import { CustomerLocationCard } from '@/components/CustomerLocation';
import { PunchFirst } from '@/components/PunchFirst';
import { Banner, BottomBar, Button, Card, Empty, ErrorView, FlowSteps, Loading, Muted, Screen, Segmented } from '@/components/ui';
import { colors } from '@/components/theme';

type ServiceType = 'on_site' | 'tele_call' | 'office';

/**
 * Step 2 of a job: check the complaint and product details, fix what's wrong or missing,
 * pick how the call is being served, then start (timer and location).
 */
export default function StartService() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['tech-job', id], queryFn: () => api.get<Envelope<Job>>(`/jobs/${id}`).then((r) => r.data) });
  if (q.isPending) return <Loading />;
  if (!q.data || isGone(q.error)) return <ErrorView error={q.error} onRetry={q.refetch} />;
  if (!['open', 'pending', 'part_pending'].includes(q.data.status)) {
    return (
      <Screen>
        <Empty icon="information-circle-outline" title="This job can’t be started" message={`It is ${q.data.status.replace(/_/g, ' ')}.`} />
        <Button title="Back to job" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  return <StartForm job={q.data} />;
}

function StartForm({ job }: { job: Job }) {
  const qc = useQueryClient();
  const [initial, setInitial] = useState(() => initialCallForm(job));
  const [form, setForm] = useState(initial);
  const set = (k: keyof CallForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [type, setType] = useState<ServiceType>('on_site');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ApiError | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [punchFirst, setPunchFirst] = useState(false);
  const c = job.customer;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const start = async () => {
    setBusy(true);
    setErrors(null);
    setLocError(null);
    try {
      // 1. Save what the technician corrected.
      if (dirty) {
        await api.patch(`/jobs/${job.id}/details`, callPayload(form));
        setInitial(form);
        qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
      }
      // 2. Location: required on site, best effort otherwise.
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
      // 3. Start: the response is the new visit, open it straight away.
      const res = await api.post<Envelope<Visit>>(`/jobs/${job.id}/visits/start`, { service_type: type, ...(pos ?? {}) });
      toast.success('Service started. Timer is running.');
      qc.setQueryData(['visit', String(res.data.id)], { images: [], voice_notes: [], inventory_usage: [], ...res.data });
      qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: ['tech-jobs'] });
      router.replace({ pathname: '/visit/[id]', params: { id: res.data.id, job: job.id } });
    } catch (e) {
      if (e instanceof ApiError && e.field('punch')) setPunchFirst(true);
      else if (e instanceof ApiError && e.field('location')) setLocError(e.field('location')!);
      else if (e instanceof ApiError && e.status === 422) {
        setErrors(e);
        toast.error(e.message);
      } else toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: `Check ${job.crm_call_id}` }} />
      <Screen>
        <FlowSteps current="check" />

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{c?.name}</Text>
              <Muted>{c?.phone}{c?.alt_phone ? ` · ${c.alt_phone}` : ''}</Muted>
              {!!c?.address && <Muted>{[c.address, c.city, c.pincode].filter(Boolean).join(', ')}</Muted>}
            </View>
            <Button title="Call" size="sm" variant="secondary" icon="call" onPress={() => Linking.openURL(`tel:${c?.phone}`)} />
          </View>
          <Muted style={{ fontSize: 12, marginTop: 8 }}>Customer details wrong? Ask the office to correct them.</Muted>
        </Card>

        <CustomerLocationCard job={job} />

        <Muted>Correct what’s wrong and add what’s missing, such as the serial number. It’s saved when you start.</Muted>
        <ComplaintFields form={form} set={set} error={(f) => errors?.field(f)} />
        <ProductFields job={job} form={form} set={set} error={(f) => errors?.field(f)} scanHint="Scanned. It’s saved when you start the service." />

        <Card title="How are you serving this call?">
          <Segmented
            value={type}
            onChange={(v) => { setType(v); setLocError(null); }}
            options={[
              { value: 'on_site', label: 'On site', icon: 'location-outline' },
              { value: 'tele_call', label: 'Tele call', icon: 'call-outline' },
              { value: 'office', label: 'Office', icon: 'business-outline' },
            ]}
          />
          <Muted style={{ fontSize: 12 }}>{type === 'on_site' ? 'Your location is recorded when the visit starts.' : 'No site visit: location is optional.'}</Muted>
        </Card>

        {locError && <Banner tone="danger" icon="location-outline" title="Location needed for on-site visits" message={locError} />}
      </Screen>
      <BottomBar>
        <Button title={dirty ? 'Save & start service' : 'Start service'} size="lg" icon="play" loading={busy} style={{ flex: 1 }} onPress={start} />
      </BottomBar>
      <PunchFirst
        open={punchFirst}
        onClose={() => setPunchFirst(false)}
        onPunched={() => {
          setPunchFirst(false);
          start();
        }}
      />
    </>
  );
}
