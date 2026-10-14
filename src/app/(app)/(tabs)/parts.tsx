import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { useQuery } from '@tanstack/react-query';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, qty } from '@/lib/format';
import type { InventoryItem } from '@/lib/types';
import { Empty, Icon, Input, Loading, Muted, Segmented } from '@/components/ui';
import { colors } from '@/components/theme';

/** Search spares / consumables and check stock at every branch before promising a part. */
export default function Parts() {
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
      <View style={{ padding: 16, paddingBottom: 6, gap: 10 }}>
        <Input value={search} onChangeText={setSearch} placeholder="Search code or name" />
        <Segmented value={type} onChange={setType} options={[{ value: '', label: 'All' }, { value: 'spare', label: 'Spares' }, { value: 'consumable', label: 'Consumables' }]} />
      </View>
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data?.data ?? []}
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
      {q.isLoading ? (
        <Muted>Checking other branches…</Muted>
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
