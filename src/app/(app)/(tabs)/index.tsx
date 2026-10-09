import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, dateTime, money, time } from '@/lib/format';
import { getPosition } from '@/lib/location';
import type { Job, Visit } from '@/lib/types';
import { toast } from '@/components/toast';
import { Badge, Button, Card, ErrorView, Icon, ListRow, Loading, Muted, Screen, StatTile } from '@/components/ui';
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,';
  const onDuty = d.punch_status === 'in';

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => { q.refetch(); assets.refetch(); }}>
      <View style={{ gap: 2, marginTop: 2 }}>
        <Muted style={{ fontSize: 14 }}>{greeting}</Muted>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.navy }} numberOfLines={1}>
          {user?.name}
        </Text>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: onDuty ? colors.accent : colors.faint }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{onDuty ? 'On duty' : 'Off duty'}</Text>
            <Muted>{onDuty ? `Since ${time(d.punched_at)}` : 'Punch in to start your day'}</Muted>
          </View>
          <Button title={onDuty ? 'Punch out' : 'Punch in'} size="sm" icon={onDuty ? 'log-out-outline' : 'finger-print-outline'} variant={onDuty ? 'secondary' : 'success'} loading={punching} onPress={punch} />
        </View>
      </Card>

      {d.active_visit && (
        <Pressable onPress={() => router.push({ pathname: '/visit/[id]', params: { id: d.active_visit!.id, job: d.active_visit!.job_id } })} style={({ pressed }) => ({ backgroundColor: colors.navy, opacity: pressed ? 0.9 : 1, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="construct" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Service in progress · {d.active_visit.job.crm_call_id}</Text>
            <Text style={{ color: '#B6C4D9', fontSize: 13 }}>Started {dateTime(d.active_visit.start_time)} · tap to continue</Text>
          </View>
          <Icon name="chevron-forward" color="#fff" />
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile label="Open" icon="briefcase-outline" value={d.counts.open} tone={colors.brand} onPress={() => router.push({ pathname: '/jobs', params: { status: 'open' } })} />
        <StatTile label="In progress" icon="construct-outline" value={d.counts.in_progress} tone={colors.accent} onPress={() => router.push({ pathname: '/jobs', params: { status: 'in_progress' } })} />
        <StatTile label="Pending" icon="time-outline" value={d.counts.pending} tone={colors.red} onPress={() => router.push({ pathname: '/jobs', params: { status: 'pending' } })} />
      </View>

      <Card padded={false}>
        <ListRow first icon="clipboard-outline" title="My jobs" detail={`${d.counts.completed} completed`} onPress={() => router.push('/jobs')} />
        <ListRow icon="wallet-outline" title="Cash & expenses" detail={`Cash in hand ${money(d.cash_in_hand)} · collected today ${money(d.collected_today)}`} tone={colors.accent} onPress={() => router.push('/cash')} />
        <ListRow icon="receipt-outline" title="Add an expense" detail="Fuel, parking, a part bought locally…" tone={colors.amber} onPress={() => router.push('/expenses?new=1')} />
        <ListRow icon="cube-outline" title="Parts & stock" detail="Check stock at your branch" tone={colors.violet} onPress={() => router.push('/parts')} />
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
