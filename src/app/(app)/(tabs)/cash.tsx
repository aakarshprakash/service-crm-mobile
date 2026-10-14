import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/Text';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { date, METHOD_LABEL, money, time, toMajor, toMinor, today } from '@/lib/format';
import type { CashSummary } from '@/lib/types';
import { Badge, Button, Card, ErrorView, Field, Input, ListRow, Loading, Muted, Row, Screen } from '@/components/ui';
import { colors } from '@/components/theme';

interface CashCloseRow { id: number; close_date: string; expected_in_hand: number; amount_confirmed: number; status: string }

/** End-of-day cash close: what you should be holding, and confirm what you hand over. */
export default function Cash() {
  const [day, setDay] = useState(today());
  const q = useQuery({ queryKey: ['my-cash', day], queryFn: () => api.get<Envelope<CashSummary>>('/accounts/cash-summary', { date: day }).then((r) => r.data) });
  const history = useQuery({ queryKey: ['my-closes'], queryFn: () => api.get<Paginated<CashCloseRow>>('/accounts/cash-close', { per_page: 10 }) });
  const [declared, setDeclared] = useState('');
  const [remarks, setRemarks] = useState('');
  const s = q.data;
  useEffect(() => setDeclared(s ? toMajor(s.expected_in_hand) || '0' : ''), [s?.expected_in_hand, s?.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = useApiMutation(() => api.post('/accounts/cash-close', { date: day, amount_confirmed: toMinor(declared), remarks: remarks || null }), {
    invalidate: [['my-cash'], ['my-closes'], ['tech-dashboard']],
    toastValidation: false,
  });
  const differs = s && toMinor(declared) !== s.expected_in_hand;

  if (q.isLoading) return <Loading />;
  if (q.error || !s) return <ErrorView error={q.error} onRetry={q.refetch} />;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => { q.refetch(); history.refetch(); }}>
      {s.pending_dates.length > 0 && s.pending_dates[0] !== day && (
        <Card style={{ backgroundColor: colors.amberSoft, borderColor: colors.amberBorder }}>
          <Text style={{ color: colors.amber, fontWeight: '600' }}>Earlier days are still open: {s.pending_dates.map(date).join(', ')}.</Text>
          <Button title={`Close ${date(s.pending_dates[0])} first`} variant="secondary" size="sm" style={{ marginTop: 10 }} onPress={() => setDay(s.pending_dates[0]!)} />
        </Card>
      )}
      <Card title={`Cash for ${date(day)}`}>
        <Row k="Carried from earlier" v={money(s.opening_balance)} />
        <Row k="Cash collected" v={money(s.cash)} />
        <Row k="Cheques collected" v={money(s.cheque)} />
        <Row k="UPI / bank (no hand-over)" v={money(s.digital)} vStyle={{ color: colors.muted }} />
        {!!s.expenses && <Row k="Expenses paid from cash" v={`− ${money(s.expenses)}`} vStyle={{ color: colors.red }} />}
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />
        <Row k="You should be holding" v={money(s.expected_in_hand)} strong />
      </Card>

      {s.close ? (
        <Card>
          <Row k="Submitted" v={money(s.close.amount_confirmed)} />
          <Badge text={s.close.status} />
        </Card>
      ) : (
        <Card title="Close this day">
          <View style={{ gap: 12 }}>
            <Field label="Amount you are handing over" error={fieldError(submit.error, 'amount_confirmed')}>
              <Input value={declared} keyboardType="decimal-pad" onChangeText={(v) => setDeclared(v.replace(/[^\d.]/g, ''))} />
            </Field>
            {differs && (
              <Field label="Why is it different?" required error={fieldError(submit.error, 'remarks')}>
                <Input multiline value={remarks} onChangeText={setRemarks} />
              </Field>
            )}
            {fieldError(submit.error, 'date') && <Text style={{ color: colors.red }}>{fieldError(submit.error, 'date')}</Text>}
            <Button title="Submit cash close" loading={submit.isPending} onPress={() => submit.mutate(undefined)} />
          </View>
        </Card>
      )}

      <Card padded={false}>
        <ListRow
          first
          icon="receipt-outline"
          tone={colors.amber}
          title="My expenses"
          detail={s.expense_claims?.length ? `${s.expense_claims.length} paid from cash in this close` : 'Fuel, parking, parts bought locally'}
          onPress={() => router.push('/expenses')}
        />
        <ListRow icon="add-circle-outline" title="Add an expense" onPress={() => router.push('/expenses?new=1')} />
      </Card>

      {!!s.expense_claims?.length && (
        <Card title="Expenses paid from cash" padded={false}>
          {s.expense_claims.map((c, i) => (
            <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{c.category ?? 'Expense'}{c.call_id ? ` · ${c.call_id}` : ''}</Text>
                <Muted>
                  {date(c.claim_date)}
                  {c.description ? ` · ${c.description}` : ''}
                </Muted>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontWeight: '600', color: colors.text }}>{money(c.amount)}</Text>
                <Badge text={c.status} />
              </View>
            </View>
          ))}
        </Card>
      )}

      {s.payments.length > 0 && (
        <Card title="Today’s collections" padded={false}>
          {s.payments.map((p, i) => (
            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{p.customer ?? '—'}</Text>
                <Muted>
                  {p.receipt_number} · {METHOD_LABEL[p.method] ?? p.method} · {time(p.paid_at)}
                </Muted>
              </View>
              <Text style={{ fontWeight: '600', color: colors.text }}>{money(p.amount)}</Text>
            </View>
          ))}
        </Card>
      )}

      {!!history.data?.data.length && (
        <Card title="Recent closes" padded={false}>
          {history.data.data.map((c, i) => (
            <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <View>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{date(c.close_date)}</Text>
                <Muted>Declared {money(c.amount_confirmed)}</Muted>
              </View>
              <Badge text={c.status} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
