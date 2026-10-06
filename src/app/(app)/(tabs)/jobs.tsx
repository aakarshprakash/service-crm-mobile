import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { Job, JobStatus } from '@/lib/types';
import { Badge, Empty, ErrorView, Icon, Input, Loading, Muted, Segmented } from '@/components/ui';
import { colors } from '@/components/theme';

const STATUSES: { value: JobStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Done' },
];

export default function Jobs() {
  const params = useLocalSearchParams<{ status?: JobStatus }>();
  const [status, setStatus] = useState<JobStatus>(params.status ?? 'open');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    if (params.status) setStatus(params.status);
  }, [params.status]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const counts = useQuery({ queryKey: ['tech-job-counts'], queryFn: () => api.get<Envelope<Record<JobStatus, number>>>('/jobs/counts').then((r) => r.data) });
  // A search looks across every status.
  const q = useInfiniteQuery({
    queryKey: ['tech-jobs', debounced ? 'all' : status, debounced],
    queryFn: ({ pageParam }) => api.get<Paginated<Job>>('/jobs', { status: debounced ? undefined : status, search: debounced, sort: 'scheduled', page: pageParam, per_page: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
  });
  const jobs = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 6, gap: 10 }}>
        <View>
          <Input value={search} onChangeText={setSearch} placeholder="Search call ID, customer, phone, serial" style={{ paddingLeft: 40 }} returnKeyType="search" />
          <View style={{ position: 'absolute', left: 12, top: 13 }}>
            <Icon name="search" size={18} color={colors.faint} />
          </View>
        </View>
        {!debounced && <Segmented value={status} onChange={setStatus} options={STATUSES.map((s) => ({ ...s, count: counts.data?.[s.value] }))} />}
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorView error={q.error} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => String(j.id)}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); counts.refetch(); }} colors={[colors.brand]} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<Empty icon="clipboard-outline" title={debounced ? `Nothing matches “${debounced}”` : 'No jobs here'} message={debounced ? undefined : 'New jobs assigned to you show up here.'} />}
          ListFooterComponent={q.isFetchingNextPage ? <Loading /> : null}
          renderItem={({ item: j }) => (
            <Pressable onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })} style={({ pressed }) => ({ backgroundColor: pressed ? colors.bg : '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{j.crm_call_id}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {j.priority === 'high' && <Badge text="high" />}
                  <Badge text={j.status} />
                </View>
              </View>
              <Text style={{ color: colors.text, fontWeight: '500' }} numberOfLines={1}>
                {j.customer?.name} · {j.complaint_type?.name ?? 'Service'}
              </Text>
              <Muted>{[j.customer?.address, j.customer?.city].filter(Boolean).join(', ') || '—'}</Muted>
              <Muted style={{ fontSize: 12 }}>Scheduled {dateTime(j.scheduled_at)}</Muted>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
