import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, dateTime, money, time } from '@/lib/format';
import { punch as doPunch, punchRuleText, useTechDashboard } from '@/lib/punch';
import { toast } from '@/components/toast';
import { Button, Card, ErrorView, Icon, ListRow, Loading, Muted, Screen, StatTile } from '@/components/ui';
import { JobCard } from '@/components/JobCard';
import { colors } from '@/components/theme';

interface MyAsset { id: number; asset_code: string; name: string; serial_no: string | null; current_assignment: { issued_at: string } | null }

export default function Home() {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const q = useTechDashboard();
  const assets = useQuery({ queryKey: ['my-assets'], queryFn: () => api.get<Envelope<MyAsset[]>>('/my/assets').then((r) => r.data) });
  const [punching, setPunching] = useState(false);
  const d = q.data;

  const punch = async () => {
    if (!d) return;
    setPunching(true);
    try {
      const r = await doPunch(d.punch_status === 'in' ? 'out' : 'in', qc, refresh);
      (r.outside ? toast.info : toast.success)(r.message);
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
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.heading }} numberOfLines={1}>
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
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Icon name={d.attendance?.geofence && d.attendance.geofence !== 'off' ? 'locate-outline' : 'globe-outline'} size={16} color={colors.muted} />
          <Muted style={{ flex: 1, fontSize: 12 }}>
            {punchRuleText(d.attendance)}
            {!onDuty && d.attendance?.require_punch_in !== false ? ' You need to be punched in to start a service.' : ''}
          </Muted>
        </View>
      </Card>

      {d.active_visit && (
        <Pressable onPress={() => router.push({ pathname: '/visit/[id]', params: { id: d.active_visit!.id, job: d.active_visit!.job_id } })} style={({ pressed }) => ({ backgroundColor: colors.navy, opacity: pressed ? 0.9 : 1, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="construct" size={22} color={colors.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onBrand, fontWeight: '700' }}>Service in progress · {d.active_visit.job.crm_call_id}</Text>
            <Text style={{ color: '#B6C4D9', fontSize: 13 }}>Started {dateTime(d.active_visit.start_time)} · tap to continue</Text>
          </View>
          <Icon name="chevron-forward" color={colors.onBrand} />
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

      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 }}>Today & overdue</Text>
        {!d.today.length ? <Muted>No visits scheduled for today.</Muted> : d.today.map((j) => <JobCard key={j.id} job={j} />)}
      </View>

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
