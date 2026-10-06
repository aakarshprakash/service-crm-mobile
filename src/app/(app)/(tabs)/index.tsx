import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, dateTime, money, time } from '@/lib/format';
import { getPosition } from '@/lib/location';
import type { Job, Visit } from '@/lib/types';
import { toast } from '@/components/toast';
import { Badge, Button, Card, ErrorView, Icon, Loading, Muted, Screen, StatTile } from '@/components/ui';
import { colors } from '@/components/theme';

interface TechDashboard {
  counts: { open: number; in_progress: number; pending: number; completed: number };
  today: Job[];
  punch_status: 'in' | 'out';
  punched_at: string | null;
  cash_in_hand: number;
  collected_today: number;
  active_visit: (Visit & { job: { id: number; crm_call_id: string } }) | null;
}

interface MyAsset { id: number; asset_code: string; name: string; serial_no: string | null; current_assignment: { issued_at: string } | null }

export default function Home() {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tech-dashboard'], queryFn: () => api.get<Envelope<TechDashboard>>('/dashboard/technician').then((r) => r.data), refetchInterval: 60_000 });
  const assets = useQuery({ queryKey: ['my-assets'], queryFn: () => api.get<Envelope<MyAsset[]>>('/my/assets').then((r) => r.data) });
  const [punching, setPunching] = useState(false);
  const d = q.data;

  const punch = async () => {
    if (!d) return;
    setPunching(true);
    try {
      // Location is required when the company uses a geofence; otherwise it's sent if available.
      const pos = await getPosition(10000).catch((e: Error) => {
        toast.info(e.message);
        return null;
      });
      const res = await api.post<Envelope<{ within_fence: boolean | null }> & { message?: string }>('/punch', { type: d.punch_status === 'in' ? 'out' : 'in', source: 'mobile', ...(pos ?? {}) });
      if (res.data.within_fence === false) toast.info(res.message ?? 'Punch recorded outside the office area.');
      else toast.success(res.message ?? 'Done.');
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['tech-dashboard'] }), qc.invalidateQueries({ queryKey: ['my-attendance'] })]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPunching(false);
    }
  };

  if (q.isLoading) return <Loading />;
  if (q.error || !d) return <ErrorView error={q.error} onRetry={q.refetch} />;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => { q.refetch(); assets.refetch(); }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Muted>Hello,</Muted>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }} numberOfLines={1}>
            {user?.name}
          </Text>
          <Muted>{d.punch_status === 'in' ? `On duty since ${time(d.punched_at)}` : 'You are off duty'}</Muted>
        </View>
        <Button title={d.punch_status === 'in' ? 'Punch out' : 'Punch in'} icon={d.punch_status === 'in' ? 'log-out-outline' : 'log-in-outline'} variant={d.punch_status === 'in' ? 'secondary' : 'success'} loading={punching} onPress={punch} />
      </View>

      {d.active_visit && (
        <Pressable onPress={() => router.push({ pathname: '/visit/[id]', params: { id: d.active_visit!.id, job: d.active_visit!.job_id } })} style={{ backgroundColor: colors.violet, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="play-circle" size={34} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Service in progress · {d.active_visit.job.crm_call_id}</Text>
            <Text style={{ color: '#EDE9FE', fontSize: 13 }}>Started {dateTime(d.active_visit.start_time)} — tap to continue</Text>
          </View>
          <Icon name="chevron-forward" color="#fff" />
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile label="Open" value={d.counts.open} tone={colors.sky} onPress={() => router.push({ pathname: '/jobs', params: { status: 'open' } })} />
        <StatTile label="In progress" value={d.counts.in_progress} tone={colors.violet} onPress={() => router.push({ pathname: '/jobs', params: { status: 'in_progress' } })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile label="Pending" value={d.counts.pending} tone={colors.amber} onPress={() => router.push({ pathname: '/jobs', params: { status: 'pending' } })} />
        <StatTile label="Completed" value={d.counts.completed} tone={colors.green} onPress={() => router.push({ pathname: '/jobs', params: { status: 'completed' } })} />
      </View>

      <Card>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Muted>Collected today</Muted>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{money(d.collected_today)}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => router.push('/cash')}>
            <Muted>Cash in hand</Muted>
            <Text style={{ fontSize: 18, fontWeight: '700', color: d.cash_in_hand > 0 ? colors.amber : colors.text }}>{money(d.cash_in_hand)}</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="Today & overdue" padded={false}>
        {!d.today.length ? (
          <Muted style={{ padding: 16 }}>No visits scheduled for today.</Muted>
        ) : (
          d.today.map((j, i) => (
            <Pressable key={j.id} onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })} style={({ pressed }) => ({ padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, backgroundColor: pressed ? colors.bg : '#fff', gap: 4 })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{j.crm_call_id}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Badge text={j.priority} />
                  <Badge text={j.status} />
                </View>
              </View>
              <Text style={{ color: colors.text }} numberOfLines={1}>
                {j.customer?.name} · {j.complaint_type?.name ?? 'Service'}
              </Text>
              <Muted>
                {time(j.scheduled_at)} · {[j.customer?.address, j.customer?.city].filter(Boolean).join(', ')}
              </Muted>
            </Pressable>
          ))
        )}
      </Card>

      {!!assets.data?.length && (
        <Card title={`My assets (${assets.data.length})`} padded={false}>
          {assets.data.map((a, i) => (
            <View key={a.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <Icon name="hammer-outline" color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.text }}>{a.name}</Text>
                <Muted>
                  {a.asset_code}
                  {a.serial_no ? ` · SN ${a.serial_no}` : ''}
                  {a.current_assignment ? ` · since ${date(a.current_assignment.issued_at)}` : ''}
                </Muted>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
