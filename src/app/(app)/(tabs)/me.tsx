import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { api, openPdf, type Envelope } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getPushStatus, registerForPush, type PushStatus } from '@/lib/push';
import { useUploads } from '@/lib/uploads';
import { fieldError, useApiMutation, useLookups } from '@/lib/hooks';
import { date, hours, money, monthName, num, today } from '@/lib/format';
import type { AttendanceDay, LeaveBalance, LeaveRequest, Payslip } from '@/lib/types';
import { toast } from '@/components/toast';
import { Badge, Button, Card, Field, Icon, Input, Loading, Muted, Screen, Segmented, Sheet } from '@/components/ui';
import { colors, dayTone } from '@/components/theme';

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Self service: attendance calendar, leave, payslips and account. */
export default function Me() {
  const { user, logout, server } = useAuth();
  const uploads = useUploads();
  const confirmLogout = () =>
    Alert.alert(
      'Sign out?',
      uploads.length
        ? `${uploads.length} photo${uploads.length > 1 ? 's are' : ' is'} still waiting to upload. ${uploads.length > 1 ? 'They' : 'It'} will upload after you sign in again.`
        : 'You will need your password to sign in again.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: logout }],
    );
  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 18 }}>
              {user?.name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join('')}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{user?.name}</Text>
            <Muted>
              {user?.role_label} · {user?.tenant?.name}
            </Muted>
          </View>
        </View>
      </Card>
      <Attendance />
      <Leave />
      <Payslips />
      <PushCard />
      <Card>
        <Muted>Server: {server.replace(/^https?:\/\//, '')}</Muted>
        <Muted>App version {Constants.expoConfig?.version}</Muted>
        <Button
          title="Sign out"
          variant="secondary"
          icon="log-out-outline"
          style={{ marginTop: 12 }}
          onPress={confirmLogout}
        />
      </Card>
    </Screen>
  );
}

const PUSH_TEXT: Record<PushStatus, string> = {
  registered: 'On. You get a notification when a job is assigned or rescheduled.',
  denied: 'Off. Allow notifications for Servon in the phone settings.',
  unavailable: 'Not available in this build of the app. Ask your administrator.',
  error: 'Couldn’t register this phone. Check the connection and tap Retry.',
};

function PushCard() {
  const [status, setStatus] = useState<PushStatus | null>(getPushStatus());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!status) registerForPush().then(setStatus);
  }, [status]);
  const test = useApiMutation(() => api.post<Envelope<{ driver: string }>>('/auth/device/test'), {});
  const retry = async () => {
    setBusy(true);
    setStatus(await registerForPush());
    setBusy(false);
  };
  return (
    <Card title="Notifications" right={status ? <Badge text={status === 'registered' ? 'on' : 'off'} tone={status === 'registered' ? 'completed' : 'pending'} /> : undefined}>
      <Muted>{status ? PUSH_TEXT[status] : 'Checking…'}</Muted>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {status === 'registered' ? (
          <Button title="Send test notification" size="sm" variant="secondary" icon="notifications-outline" style={{ flex: 1 }} loading={test.isPending} onPress={() => test.mutate(undefined)} />
        ) : status === 'denied' ? (
          <Button title="Open settings" size="sm" variant="secondary" icon="settings-outline" style={{ flex: 1 }} onPress={() => Linking.openSettings()} />
        ) : (
          <Button title="Retry" size="sm" variant="secondary" icon="refresh" style={{ flex: 1 }} loading={busy} onPress={retry} />
        )}
      </View>
    </Card>
  );
}

function Attendance() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const q = useQuery({
    queryKey: ['my-attendance', month],
    queryFn: () => api.get<Envelope<{ days: AttendanceDay[]; summary: { present: number; paid_leave: number; unpaid_leave: number; absent: number; minutes: number } }>>('/my/attendance', { month }).then((r) => r.data),
  });
  const d = q.data;
  const first = d?.days[0] ? new Date(d.days[0].date + 'T00:00:00').getDay() : 0;
  const offset = (first + 6) % 7;
  const [selected, setSelected] = useState<AttendanceDay | null>(null);

  return (
    <Card
      title="Attendance"
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={10} accessibilityLabel="Previous month">
            <Icon name="chevron-back" size={18} color={colors.muted} />
          </Pressable>
          <Text style={{ fontWeight: '600', color: colors.text, minWidth: 110, textAlign: 'center' }}>{monthName(month)}</Text>
          <Pressable onPress={() => month < today().slice(0, 7) && setMonth(shiftMonth(month, 1))} hitSlop={10} accessibilityLabel="Next month">
            <Icon name="chevron-forward" size={18} color={month < today().slice(0, 7) ? colors.muted : colors.border} />
          </Pressable>
        </View>
      }
    >
      {!d ? (
        <Loading />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
              <Text key={i} style={{ width: `${100 / 7}%`, textAlign: 'center', color: colors.faint, fontSize: 11, marginBottom: 4 }}>
                {w}
              </Text>
            ))}
            {Array.from({ length: offset }).map((_, i) => (
              <View key={`b${i}`} style={{ width: `${100 / 7}%` }} />
            ))}
            {d.days.map((day) => {
              const t = dayTone[day.status] ?? dayTone.future!;
              return (
                <Pressable key={day.date} onPress={() => setSelected(day)} style={{ width: `${100 / 7}%`, padding: 2 }}>
                  <View style={{ aspectRatio: 1, borderRadius: 8, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', borderWidth: day.date === today() ? 2 : 0, borderColor: colors.brand }}>
                    <Text style={{ color: t.fg, fontWeight: '700', fontSize: 13 }}>{Number(day.date.slice(8))}</Text>
                    <Text style={{ color: t.fg, fontSize: 9 }}>{day.code}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
            {(
              [
                ['Present', num(d.summary.present)],
                ['Leave', num(d.summary.paid_leave)],
                ['Absent', num(d.summary.absent + d.summary.unpaid_leave)],
                ['Hours', hours(d.summary.minutes)],
              ] as const
            ).map(([k, v]) => (
              <View key={k} style={{ alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{v}</Text>
                <Muted style={{ fontSize: 12 }}>{k}</Muted>
              </View>
            ))}
          </View>
          {selected && (
            <View style={{ marginTop: 12, backgroundColor: colors.bg, borderRadius: 10, padding: 12 }}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{date(selected.date)}</Text>
              <Muted>
                {selected.status.replace('_', ' ')}
                {selected.in ? ` · in ${selected.in}` : ''}
                {selected.out ? ` · out ${selected.out}` : ''}
                {selected.minutes ? ` · ${hours(selected.minutes)}` : ''}
                {selected.leave_type ? ` · ${selected.leave_type}` : ''}
                {selected.holiday ? ` · ${selected.holiday}` : ''}
              </Muted>
            </View>
          )}
        </>
      )}
    </Card>
  );
}

function Leave() {
  const q = useQuery({ queryKey: ['my-leaves'], queryFn: () => api.get<Envelope<{ balances: LeaveBalance[]; requests: LeaveRequest[] }>>('/my/leaves').then((r) => r.data) });
  const [applying, setApplying] = useState(false);
  const cancel = useApiMutation((id: number) => api.post(`/my/leaves/${id}/cancel`), { invalidate: [['my-leaves'], ['my-attendance']] });
  const d = q.data;
  return (
    <Card title="Leave" right={<Button title="Apply" size="sm" icon="add" onPress={() => setApplying(true)} />}>
      {!d ? (
        <Loading />
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {d.balances.map((b) => (
              <View key={b.leave_type.id} style={{ flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
                <Muted style={{ fontSize: 12 }}>{b.leave_type.name}</Muted>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{b.remaining === null ? num(b.used) : num(b.remaining)}</Text>
                <Muted style={{ fontSize: 11 }}>
                  {b.remaining === null ? 'days taken' : `left of ${num(b.quota)}`}
                  {b.pending > 0 ? ` · ${num(b.pending)} pending` : ''}
                </Muted>
              </View>
            ))}
          </View>
          {d.requests.slice(0, 6).map((l) => {
            const canCancel = l.status === 'pending' || (l.status === 'approved' && l.from_date > today());
            return (
              <View key={l.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>
                    {l.type?.name} · {num(l.days)}d
                  </Text>
                  <Muted>
                    {date(l.from_date)}
                    {l.to_date !== l.from_date ? ` → ${date(l.to_date)}` : ''}
                  </Muted>
                  {l.decision_note && <Muted style={{ fontSize: 12 }}>“{l.decision_note}”</Muted>}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge text={l.status} />
                  {canCancel && (
                    <Pressable onPress={() => cancel.mutate(l.id)} hitSlop={8}>
                      <Text style={{ color: colors.red, fontSize: 12 }}>Cancel</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
      {applying && <ApplyLeave onClose={() => setApplying(false)} />}
    </Card>
  );
}

function ApplyLeave({ onClose }: { onClose: () => void }) {
  const { data: lookups } = useLookups();
  const [form, setForm] = useState({ leave_type_id: 0, from_date: today(), to_date: today(), half_day: false, reason: '' });
  const m = useApiMutation(() => api.post('/my/leaves', { ...form, to_date: form.half_day ? form.from_date : form.to_date, reason: form.reason || null }), {
    invalidate: [['my-leaves']],
    toastValidation: false,
    onSuccess: onClose,
  });
  const e = (n: string) => fieldError(m.error, n);
  const valid = /^\d{4}-\d{2}-\d{2}$/;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Apply for leave"
      footer={
        <>
          <Button title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
          <Button title="Send request" style={{ flex: 1 }} loading={m.isPending} disabled={!form.leave_type_id} onPress={() => m.mutate(undefined)} />
        </>
      }
    >
      <Field label="Leave type" required error={e('leave_type_id')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {lookups?.leave_types?.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setForm({ ...form, leave_type_id: t.id })}
              style={{ borderWidth: 1, borderColor: form.leave_type_id === t.id ? colors.brand : colors.border, backgroundColor: form.leave_type_id === t.id ? colors.brandSoft : '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: form.leave_type_id === t.id ? colors.brand : colors.text, fontWeight: '600' }}>
                {t.name}
                {!t.is_paid ? ' (unpaid)' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Length">
        <Segmented value={form.half_day ? 'half' : 'full'} onChange={(v) => setForm({ ...form, half_day: v === 'half' })} options={[{ value: 'full', label: 'Full days' }, { value: 'half', label: 'Half day' }]} />
      </Field>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label={form.half_day ? 'Date' : 'From'} error={e('from_date')} hint="YYYY-MM-DD">
            <Input value={form.from_date} keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={(v) => setForm({ ...form, from_date: v, to_date: valid.test(v) && v > form.to_date ? v : form.to_date })} />
          </Field>
        </View>
        {!form.half_day && (
          <View style={{ flex: 1 }}>
            <Field label="To" error={e('to_date')} hint="YYYY-MM-DD">
              <Input value={form.to_date} keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={(v) => setForm({ ...form, to_date: v })} />
            </Field>
          </View>
        )}
      </View>
      {e('half_day') && <Text style={{ color: colors.red, fontSize: 12 }}>{e('half_day')}</Text>}
      <Field label="Reason" error={e('reason')}>
        <Input multiline value={form.reason} onChangeText={(v) => setForm({ ...form, reason: v })} />
      </Field>
      <Muted>Weekly offs and holidays inside these dates are not counted. Your manager is notified.</Muted>
    </Sheet>
  );
}

function Payslips() {
  const q = useQuery({ queryKey: ['my-payslips'], queryFn: () => api.get<Envelope<Payslip[]>>('/my/payslips').then((r) => r.data) });
  const [opening, setOpening] = useState<number | null>(null);
  const open = async (p: Payslip) => {
    setOpening(p.id);
    try {
      await openPdf(`/my/payslips/${p.id}/pdf`, `payslip-${p.run?.month}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpening(null);
    }
  };
  return (
    <Card title="Payslips" padded={false}>
      {!q.data ? (
        <Loading />
      ) : !q.data.length ? (
        <Muted style={{ padding: 16 }}>Payslips appear here once payroll for a month is finalized.</Muted>
      ) : (
        q.data.map((p, i) => (
          <Pressable key={p.id} onPress={() => open(p)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, backgroundColor: pressed ? colors.bg : '#fff' })}>
            <Icon name="document-text-outline" color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{p.run && monthName(p.run.month)}</Text>
              <Muted style={{ fontSize: 12 }}>
                {num(p.present_days)} days present{p.lop_days ? ` · ${num(p.lop_days)} LOP` : ''} · {p.run?.status === 'paid' ? 'Paid' : 'Processing'}
              </Muted>
            </View>
            <Text style={{ fontWeight: '700', color: colors.text }}>{money(p.net_pay)}</Text>
            {opening === p.id ? <Loading /> : <Icon name="download-outline" size={18} color={colors.muted} />}
          </Pressable>
        ))
      )}
    </Card>
  );
}
