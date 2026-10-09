import { useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { api, type Envelope, type Paginated } from '@/lib/api';
import { fieldError, useApiMutation, useLookups } from '@/lib/hooks';
import { date, money, toMinor, today } from '@/lib/format';
import { preparePhoto } from '@/lib/photos';
import { enqueueReceipt, useUploads } from '@/lib/uploads';
import type { ExpenseClaim, Job } from '@/lib/types';
import { Text } from '@/components/Text';
import { toast } from '@/components/toast';
import { Badge, Button, Card, Empty, ErrorView, Field, Icon, Input, Loading, Muted, Screen, Segmented, Sheet } from '@/components/ui';
import { colors } from '@/components/theme';

type ClaimsPage = Paginated<ExpenseClaim> & { meta: { pending_amount: number; month_amount: number } };

/** Field expenses: fuel, parking, a part bought locally… sent to the office for approval. */
export default function Expenses() {
  const params = useLocalSearchParams<{ new?: string }>();
  const q = useQuery({ queryKey: ['my-expenses'], queryFn: () => api.get<ClaimsPage>('/my/expenses', { per_page: 50 }) });
  const [adding, setAdding] = useState(params.new === '1');
  const uploads = useUploads().filter((u) => u.kind === 'receipt');
  const qc = useQueryClient();
  const withdraw = useApiMutation((id: number) => api.delete(`/my/expenses/${id}`), {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-expenses'] });
      qc.invalidateQueries({ queryKey: ['my-cash'] });
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const claims = q.data.data;

  const confirmWithdraw = (c: ExpenseClaim) =>
    Alert.alert('Withdraw this expense?', `${c.category?.name} · ${money(c.amount)}`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => withdraw.mutate(c.id) },
    ]);

  return (
    <>
      <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Card style={{ flex: 1 }}>
            <Muted>Waiting for approval</Muted>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.amber }}>{money(q.data.meta.pending_amount)}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Muted>This month</Muted>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.navy }}>{money(q.data.meta.month_amount)}</Text>
          </Card>
        </View>
        <Button title="Add an expense" icon="add-circle-outline" size="lg" onPress={() => setAdding(true)} />

        <Card title="My expenses" padded={false}>
          {!claims.length ? (
            <Empty icon="receipt-outline" title="No expenses yet" message="Add fuel, parking or parts you paid for. The office approves them." />
          ) : (
            claims.map((c, i) => {
              const uploading = uploads.some((u) => u.claimId === c.id);
              const canWithdraw = c.status === 'pending' && !c.cash_close_id;
              return (
                <Pressable
                  key={c.id}
                  onLongPress={canWithdraw ? () => confirmWithdraw(c) : undefined}
                  style={{ flexDirection: 'row', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, alignItems: 'center' }}
                >
                  {c.receipt_url ? (
                    <Image source={{ uri: c.receipt_url }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.border }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={uploading ? 'cloud-upload-outline' : 'receipt-outline'} color={colors.amber} />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontWeight: '600', color: colors.text }}>
                      {c.category?.name}
                      {c.job ? <Text style={{ color: colors.muted, fontWeight: '400' }}> · {c.job.crm_call_id}</Text> : null}
                    </Text>
                    <Muted>
                      {date(c.claim_date)} · {c.paid_from === 'cash_in_hand' ? 'From collected cash' : 'Own money'}
                      {uploading ? ' · receipt uploading' : ''}
                    </Muted>
                    {c.status === 'rejected' && c.decision_note ? <Text style={{ color: colors.red, fontSize: 12 }}>Rejected: {c.decision_note}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{money(c.amount)}</Text>
                    <Badge text={c.status} />
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
        {claims.some((c) => c.status === 'pending' && !c.cash_close_id) && <Muted style={{ textAlign: 'center' }}>Long-press a pending expense to withdraw it.</Muted>}
      </Screen>
      {adding && <AddExpense onClose={() => setAdding(false)} />}
    </>
  );
}

function AddExpense({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: lookups } = useLookups();
  const jobs = useQuery({ queryKey: ['tech-jobs-recent'], queryFn: () => api.get<Paginated<Job>>('/jobs', { per_page: 15 }).then((r) => r.data) });
  const [form, setForm] = useState({ expense_category_id: 0, amount: '', claim_date: today(), paid_from: 'cash_in_hand' as 'cash_in_hand' | 'own_money', job_id: 0, description: '' });
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pickJob, setPickJob] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const yesterday = (() => {
    const d = new Date(today() + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const job = jobs.data?.find((j) => j.id === form.job_id);

  const m = useApiMutation(
    async () => {
      const res = await api.post<Envelope<ExpenseClaim>>('/my/expenses', {
        ...form,
        amount: toMinor(form.amount),
        job_id: form.job_id || null,
        description: form.description.trim() || null,
      });
      // The receipt goes through the upload queue: it survives bad signal and app restarts.
      if (receipt) await enqueueReceipt(res.data.id, receipt);
      return res;
    },
    {
      toastValidation: false,
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['my-expenses'] });
        qc.invalidateQueries({ queryKey: ['my-cash'] });
        qc.invalidateQueries({ queryKey: ['tech-dashboard'] });
        onClose();
      },
    },
  );
  const e = (n: string) => fieldError(m.error, n);

  const takeReceipt = async (fromLibrary: boolean) => {
    const perm = fromLibrary ? await ImagePicker.requestMediaLibraryPermissionsAsync() : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return toast.error('Allow camera / photo access in settings to attach the receipt.');
    try {
      const r = fromLibrary ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 }) : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!r.canceled && r.assets?.[0]) setReceipt(await preparePhoto(r.assets[0]));
    } catch {
      toast.error('Couldn’t open the camera.');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add an expense"
      footer={
        <>
          <Button title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
          <Button title="Send for approval" style={{ flex: 2 }} loading={m.isPending} disabled={!toMinor(form.amount) || !form.expense_category_id} onPress={() => m.mutate(undefined)} />
        </>
      }
    >
      <Field label="What for?" required error={e('expense_category_id')} hint={form.expense_category_id ? undefined : 'Choose a category'}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {lookups?.expense_categories?.map((c) => {
            const on = c.id === form.expense_category_id;
            return (
              <Pressable key={c.id} onPress={() => set('expense_category_id', c.id)} style={{ borderWidth: 1, borderColor: on ? colors.brand : colors.border, backgroundColor: on ? colors.brandSoft : '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: on ? colors.brand : colors.text, fontWeight: '600' }}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <Field label="Amount" required error={e('amount')}>
        <Input value={form.amount} keyboardType="decimal-pad" placeholder="0" onChangeText={(v) => set('amount', v.replace(/[^\d.]/g, ''))} />
      </Field>
      <Field label="Paid from" error={e('paid_from')}>
        <Segmented value={form.paid_from} onChange={(v) => set('paid_from', v)} options={[{ value: 'cash_in_hand', label: 'Collected cash', icon: 'wallet-outline' }, { value: 'own_money', label: 'My own money', icon: 'person-outline' }]} />
        <Muted style={{ fontSize: 12 }}>
          {form.paid_from === 'cash_in_hand' ? 'Deducted from the cash you hand over at the daily cash close.' : 'The office reimburses you after approval.'}
        </Muted>
      </Field>
      <Field label="Date" error={e('claim_date')}>
        <Segmented
          value={form.claim_date === today() ? 'today' : form.claim_date === yesterday ? 'yesterday' : 'other'}
          onChange={(v) => v !== 'other' && set('claim_date', v === 'today' ? today() : yesterday)}
          options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'other', label: 'Other' }]}
        />
        {form.claim_date !== today() && form.claim_date !== yesterday && (
          <Input value={form.claim_date} keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={(v) => set('claim_date', v)} placeholder="YYYY-MM-DD" />
        )}
      </Field>
      <Field label="For a job (optional)" error={e('job_id')}>
        <Pressable onPress={() => setPickJob(true)} style={{ borderWidth: 1, borderColor: '#D5DBE5', borderRadius: 12, minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: '#fff' }}>
          <Text style={{ color: job ? colors.text : colors.faint, fontSize: 16 }}>{job ? `${job.crm_call_id} · ${job.customer?.name ?? ''}` : 'Not linked to a job'}</Text>
        </Pressable>
      </Field>
      <Field label="Note" error={e('description')}>
        <Input value={form.description} onChangeText={(v) => set('description', v)} placeholder="e.g. Petrol for Whitefield visits" maxLength={500} />
      </Field>
      <Field label="Receipt photo">
        {receipt ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source={{ uri: receipt }} style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: colors.border }} />
            <Button title="Remove" variant="ghost" size="sm" icon="trash-outline" onPress={() => setReceipt(null)} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Camera" icon="camera-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => takeReceipt(false)} />
            <Button title="Gallery" icon="images-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => takeReceipt(true)} />
          </View>
        )}
      </Field>
      {pickJob && (
        <Sheet open onClose={() => setPickJob(false)} title="Link to a job">
          <Pressable onPress={() => { set('job_id', 0); setPickJob(false); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 16, color: !form.job_id ? colors.brand : colors.text }}>Not linked to a job</Text>
          </Pressable>
          {jobs.data?.map((j) => (
            <Pressable key={j.id} onPress={() => { set('job_id', j.id); setPickJob(false); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 16, color: j.id === form.job_id ? colors.brand : colors.text }}>
                {j.crm_call_id} · {j.customer?.name}
              </Text>
              <Muted>{j.status.replace('_', ' ')}</Muted>
            </Pressable>
          ))}
        </Sheet>
      )}
    </Sheet>
  );
}
