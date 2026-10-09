import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { relative } from '@/lib/format';
import { routeForNotification } from '@/lib/push';
import type { NotificationItem } from '@/lib/types';
import { Button, Empty, Loading, Muted } from '@/components/ui';
import { colors } from '@/components/theme';

export default function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Paginated<NotificationItem> & { meta: { unread: number } }>('/notifications', { per_page: 30 }),
  });
  const read = async (ids?: number[]) => {
    await api.post('/notifications/read', ids ? { ids } : {}).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  if (q.isLoading) return <Loading />;
  return (
    <FlatList
      data={q.data?.data ?? []}
      keyExtractor={(n) => String(n.id)}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} colors={[colors.brand]} />}
      ListHeaderComponent={(q.data?.meta.unread as number) > 0 ? <Button title="Mark all as read" variant="ghost" size="sm" onPress={() => read()} /> : null}
      ListEmptyComponent={<Empty icon="notifications-off-outline" title="You’re all caught up" />}
      renderItem={({ item: n }) => (
        <Pressable
          onPress={() => {
            read([n.id]);
            const to = routeForNotification(n.data);
            if (to && to !== '/notifications') router.push(to as never);
          }}
          style={{ flexDirection: 'row', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: n.read_at ? '#fff' : colors.brandSoft }}
        >
          {!n.read_at && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 }} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '600', color: colors.text }}>{n.title}</Text>
            <Text style={{ color: '#334155' }}>{n.message}</Text>
            <Muted style={{ fontSize: 12 }}>{relative(n.created_at)}</Muted>
          </View>
        </Pressable>
      )}
    />
  );
}
