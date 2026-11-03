import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/components/Text';
import { api } from '@/lib/api';
import { dateTime, label, METHOD_LABEL, money, qty } from '@/lib/format';
import { fieldError, useApiMutation } from '@/lib/hooks';
import type { Job } from '@/lib/types';
import { Button, Card, Field, Icon, Input, type IconName } from '@/components/ui';
import { colors } from '@/components/theme';

interface Entry { key: string; at: string; icon: IconName; tone: string; title: string; detail?: string | null }

/** Everything that happened on the job, newest first: updates, status changes, parts, bill and collections. */
function entries(job: Job): Entry[] {
  const out: Entry[] = [];
  for (const h of job.status_history ?? []) {
    const note = h.status === 'note';
    out.push({
      key: `h${h.id}`,
      at: h.changed_at,
      icon: note ? 'chatbubble-ellipses' : 'flag',
      tone: note ? colors.brand : colors.muted,
      title: h.remarks ?? label(h.status),
      detail: h.user?.name,
    });
  }
  for (const v of job.visits ?? []) {
    for (const u of v.inventory_usage ?? []) {
      if (!u.created_at) continue;
      out.push({ key: `u${u.id}`, at: u.created_at, icon: 'cube', tone: colors.violet, title: `Part used: ${u.item?.name ?? 'Part'} × ${qty(u.quantity)}`, detail: [money(u.total_price), v.technician?.name].filter(Boolean).join(' · ') });
    }
  }
  const inv = job.invoice;
  if (inv?.generated_at) out.push({ key: 'inv', at: inv.generated_at, icon: 'receipt', tone: colors.sky, title: `Invoice ${inv.invoice_number}`, detail: `${inv.is_gst ? 'GST bill' : 'Non-GST bill'} · ${money(inv.total_amount)}` });
  for (const p of inv?.payments ?? []) {
    if (!p.paid_at) continue;
    out.push({ key: `p${p.id}`, at: p.paid_at, icon: 'cash', tone: colors.green, title: `${money(p.amount)} collected by ${METHOD_LABEL[p.method] ?? label(p.method)}`, detail: [p.receipt_number && `Receipt ${p.receipt_number}`, p.collector?.name].filter(Boolean).join(' · ') });
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const FIRST_SHOWN = 6;

export function JobTimeline({ job }: { job: Job }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [all, setAll] = useState(false);
  const list = useMemo(() => entries(job), [job]);
  const m = useApiMutation(() => api.post(`/jobs/${job.id}/notes`, { note: note.trim() }), {
    toastValidation: false,
    success: 'Update added',
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
    },
  });
  const shown = all ? list : list.slice(0, FIRST_SHOWN);

  return (
    <Card title="Job updates & timeline">
      <View style={{ gap: 8 }}>
        <Field error={fieldError(m.error, 'note')}>
          <Input multiline style={{ minHeight: 64 }} maxLength={500} value={note} onChangeText={setNote} placeholder="What did you find? What did the customer say?" />
        </Field>
        <Button title="Add update" size="sm" variant="secondary" icon="add" loading={m.isPending} disabled={!note.trim()} onPress={() => m.mutate(undefined)} />
      </View>
      <View style={{ marginTop: 16 }}>
        {shown.map((e, i) => (
          <View key={e.key} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ alignItems: 'center', width: 26 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: e.tone + '1F', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={e.icon} size={14} color={e.tone} />
              </View>
              {i < shown.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 14 }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{e.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{[dateTime(e.at), e.detail].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
        ))}
      </View>
      {list.length > FIRST_SHOWN && <Button title={all ? 'Show less' : `Show all ${list.length}`} size="sm" variant="ghost" onPress={() => setAll((a) => !a)} />}
    </Card>
  );
}
