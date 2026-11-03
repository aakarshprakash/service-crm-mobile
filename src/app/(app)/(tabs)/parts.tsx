import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { useQuery } from '@tanstack/react-query';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, money, qty } from '@/lib/format';
import { useMyParts } from '@/lib/hooks';
import type { InventoryItem, MyPartMove } from '@/lib/types';
import { Card, Empty, ErrorView, Icon, Input, Loading, Muted, Segmented } from '@/components/ui';
import { colors } from '@/components/theme';

const MOVE: Record<MyPartMove['type'], string> = { allocated: 'Allocated to you', returned: 'Returned to office', used: 'Used on job', usage_undone: 'Taken off job' };

/** The parts the office gave this technician, and the branch's stock to check before promising one. */
export default function Parts() {
  const [view, setView] = useState<'mine' | 'branch'>('mine');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Segmented value={view} onChange={setView} options={[{ value: 'mine', label: 'My parts', icon: 'cube-outline' }, { value: 'branch', label: 'Branch stock', icon: 'business-outline' }]} />
      </View>
      {view === 'mine' ? <MyParts /> : <BranchStock />}
    </View>
  );
}


function MyParts() {
  const q = useMyParts();
  if (q.isPending) return <Loading />;
  if (!q.data) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const stock = q.data.stock;
  const moves = q.data.moves;
  return (
    <FlatList
      data={stock}
      keyExtractor={(p) => String(p.id)}
      refreshing={q.isRefetching}
      onRefresh={q.refetch}
      contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
      ListEmptyComponent={<Empty icon="cube-outline" title="No parts with you" message="Parts the office allocates to you show here, ready to add to a job." />}
      renderItem={({ item: p }) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: colors.text }}>{p.item?.name}</Text>
            <Muted>{p.item?.code} · {money(p.item?.unit_price)}</Muted>
          </View>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.brand }}>{qty(p.quantity)} {p.item?.unit_of_measure}</Text>
        </View>
      )}
      ListFooterComponent={
        moves.length ? (
          <Card title="History" padded={false} style={{ marginTop: 12 }}>
            {moves.map((m, i) => (
              <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{m.item?.name}</Text>
                  <Muted>
                    {MOVE[m.type]}
                    {m.job ? ` ${m.job.crm_call_id}` : ''} · {dateTime(m.created_at)}
                  </Muted>
                </View>
                <Text style={{ fontWeight: '600', color: m.quantity < 0 ? colors.red : colors.green }}>
                  {m.quantity > 0 ? '+' : ''}
                  {qty(m.quantity)}
                </Text>
              </View>
            ))}
          </Card>
        ) : null
      }
    />
  );
}

function BranchStock() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState<'' | 'spare' | 'consumable'>('');
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const q = useQuery({
    queryKey: ['tech-parts', debounced, type],
    queryFn: () => api.get<Paginated<InventoryItem>>('/inventory/items', { search: debounced, type, active: 1, per_page: 40, branch_id: user?.branch_id ?? undefined }),
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingTop: 4, paddingBottom: 6, gap: 10 }}>
        <Input value={search} onChangeText={setSearch} placeholder="Search code or name" />
        <Segmented value={type} onChange={setType} options={[{ value: '', label: 'All' }, { value: 'spare', label: 'Spares' }, { value: 'consumable', label: 'Consumables' }]} />
      </View>
      {q.isPending ? (
        <Loading />
      ) : !q.data ? (
        <ErrorView error={q.error} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={q.data.data}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
          ListEmptyComponent={<Empty icon="cube-outline" title="No parts found" />}
          renderItem={({ item }) => {
            const stock = Number(item.stock_total ?? 0);
            return (
              <Pressable onPress={() => setOpen(open === item.id ? null : item.id)} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: colors.text }}>{item.name}</Text>
                    <Muted>
                      {item.code} · {money(item.unit_price)}
                    </Muted>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontWeight: '700', color: stock > 0 ? colors.green : colors.red }}>{stock > 0 ? `${qty(stock)} ${item.unit_of_measure}` : 'Out'}</Text>
                    <Muted style={{ fontSize: 11 }}>at your branch</Muted>
                  </View>
                </View>
                {open === item.id && <Availability code={item.code} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function Availability({ code }: { code: string }) {
  const q = useQuery({
    queryKey: ['availability', code],
    queryFn: () => api.get<Envelope<{ branches: { branch_id: number; branch: string; quantity: number }[] }>>(`/inventory/items/${encodeURIComponent(code)}/availability`).then((r) => r.data.branches),
  });
  return (
    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
      {q.isPending ? (
        <Muted>Checking other branches…</Muted>
      ) : q.isError && !q.data ? (
        <Muted>{q.error.message}</Muted>
      ) : !q.data?.length ? (
        <Muted>Not in stock at any branch.</Muted>
      ) : (
        q.data.map((b) => (
          <View key={b.branch_id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text }}>
              <Icon name="business-outline" size={14} color={colors.muted} /> {b.branch}
            </Text>
            <Text style={{ fontWeight: '600', color: b.quantity > 0 ? colors.text : colors.faint }}>{qty(b.quantity)}</Text>
          </View>
        ))
      )}
    </View>
  );
}
