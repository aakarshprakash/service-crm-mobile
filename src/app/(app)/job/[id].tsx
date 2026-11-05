import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Share, View } from 'react-native';
import { Text } from '@/components/Text';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Envelope } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { callAge, date, dateTime, label, money, qty, schedule } from '@/lib/format';
import { fieldError, isGone, useApiMutation } from '@/lib/hooks';
import { DASHBOARD_KEY, useTechDashboard } from '@/lib/punch';
import type { Job } from '@/lib/types';
import { toast } from '@/components/toast';
import { Badge, Banner, BottomBar, Button, Card, ErrorView, Field, FlowSteps, Icon, Input, Loading, Muted, Screen, Sheet, type IconName } from '@/components/ui';
import { BillSummary } from '@/components/BillSummary';
import { CollectPayment } from '@/components/CollectPayment';
import { CustomerLocationCard, useCollectLocation } from '@/components/CustomerLocation';
import { JobAddress, JobTags, ScheduleChip } from '@/components/JobCard';
import { ComplaintCard, EarlierPhotos, ProductCard, VisitInfoCard, brandOf, modelOf, productTypeOf } from '@/components/JobDetails';
import { JobTimeline } from '@/components/JobTimeline';
import { PunchFirst } from '@/components/PunchFirst';
import { colors, radius } from '@/components/theme';

/** Jobs already warned about a missing location in this run of the app: once is enough. */
const warnedAboutLocation = new Set<number>();

const STARTABLE = ['open', 'pending', 'part_pending'];

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['tech-job', id], queryFn: () => api.get<Envelope<Job>>(`/jobs/${id}`).then((r) => r.data) });
  if (q.isPending) return <Loading />;
  if (!q.data || isGone(q.error)) return <ErrorView error={q.error} onRetry={q.refetch} />;
  return <JobView job={q.data} refreshing={q.isRefetching} refetch={q.refetch} />;
}

function JobView({ job, refreshing, refetch }: { job: Job; refreshing: boolean; refetch: () => void }) {
  const { user } = useAuth();
  const dash = useTechDashboard().data;
  const [punchFirst, setPunchFirst] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const { collect, locating } = useCollectLocation(job);

  const active = job.visits?.find((v) => v.status === 'in_progress');
  const c = job.customer;
  const p = job.customer_product;
  const address = [c?.address, c?.city, c?.pincode].filter(Boolean).join(', ');
  const history = (job.visits ?? []).filter((v) => v.status !== 'in_progress');
  const parts = (job.visits ?? []).flatMap((v) => v.inventory_usage ?? []);
  const phone = (c?.phone ?? '').replace(/\D/g, '');
  const finished = ['completed', 'cancelled'].includes(job.status);
  const canStart = STARTABLE.includes(job.status);
  const missingLocation = c?.lat == null && !finished && job.status !== 'cancel_requested';

  // Ask as soon as the job opens: the technician may well be standing at the customer's place.
  useEffect(() => {
    if (!missingLocation || warnedAboutLocation.has(job.id)) return;
    warnedAboutLocation.add(job.id);
    Alert.alert('Customer location is missing', 'Collect it when you reach the customer’s place. If you’re there now, save it from here.', [
      { text: 'Later', style: 'cancel' },
      { text: 'I’m there: save it', onPress: collect },
    ]);
  }, [missingLocation, job.id, collect]);

  // Punch-in check first (the server checks again), then "Check details" before the visit starts.
  const startService = () => {
    const onDuty = (dash?.punch_status ?? user?.punch_status) === 'in';
    if (dash?.attendance?.require_punch_in !== false && !onDuty) setPunchFirst(true);
    else router.push({ pathname: '/start/[id]', params: { id: job.id } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: job.crm_call_id,
          headerRight: () => (
            <Pressable onPress={() => shareJob(job)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Share job details">
              <Icon name="share-social-outline" size={22} color={colors.heading} />
            </Pressable>
          ),
        }}
      />
      <Screen refreshing={refreshing} onRefresh={refetch}>
        {!finished && job.status !== 'cancel_requested' && <FlowSteps current={active ? 'service' : 'job'} />}

        <View style={{ backgroundColor: colors.navy, borderRadius: radius.lg, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge text={job.status} />
            <Badge text={job.priority} />
            {!finished && job.call_age_days != null && <Badge text={callAge(job.call_age_days)} tone={(job.call_age_days ?? 0) >= 3 ? 'pending' : 'none'} />}
          </View>
          <View>
            <Text style={{ color: colors.onBrand, fontSize: 20, fontWeight: '800' }}>{job.complaint_type?.name ?? 'Service'}</Text>
            {!!(brandOf(p) || modelOf(p) || productTypeOf(p) || job.product_category) && (
              <Text style={{ color: colors.onBrand, opacity: 0.85 }}>{[brandOf(p), productTypeOf(p) ?? job.product_category, modelOf(p)].filter(Boolean).join(' · ')}</Text>
            )}
          </View>
          <ScheduleChip job={job} size="lg" />
        </View>

        {job.status === 'part_pending' && job.part_pending_note && <Banner tone="danger" icon="cube-outline" title="Waiting for a part" message={job.part_pending_note} />}
        {job.needs_resume_approval && (
          <Banner
            tone="warn"
            icon="hourglass-outline"
            title="Waiting for the office to approve the next visit"
            message={
              job.resume_requested_at
                ? `You asked on ${dateTime(job.resume_requested_at)}${job.resume_request_note ? `: “${job.resume_request_note}”` : ''}. You’ll get a notification when it’s approved.`
                : `You left this job ${label(job.status).toLowerCase()}. It stays with you; ask the office when you’re ready to go back.`
            }
          />
        )}
        {job.status === 'cancel_requested' && <Banner tone="danger" icon="hourglass-outline" title="Waiting for the office to approve the cancellation" message={job.cancel_reason ? `Your reason: ${job.cancel_reason}` : null} />}

        <Card>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{c?.name}</Text>
          <Muted>
            {c?.phone}
            {c?.alt_phone ? ` · ${c.alt_phone}` : ''}
            {c?.crm_id ? ` · CRM ID ${c.crm_id}` : ''}
          </Muted>
          <View style={{ marginTop: 10 }}>
            <JobAddress job={job} lines={4} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Action icon="call" label="Call" color={colors.green} onPress={() => Linking.openURL(`tel:${c?.phone}`)} />
            <Action icon="logo-whatsapp" label="WhatsApp" color={colors.whatsapp} onPress={() => Linking.openURL(`https://wa.me/${phone.length === 10 ? '91' + phone : phone}`)} />
            <Action icon="navigate" label="Directions" color={colors.brand} onPress={() => Linking.openURL(mapsLink(job, true) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)} />
          </View>
        </Card>

        {!finished && job.status !== 'cancel_requested' && <CustomerLocationCard job={job} />}
        {locating && <Muted style={{ textAlign: 'center' }}>Getting your location…</Muted>}

        {/* The same fields, in the same order, as the office's job form: what to read before starting. */}
        <View style={{ marginTop: 2 }}>
          <JobTags job={job} />
        </View>
        <ComplaintCard job={job} title="Job summary" />
        <ProductCard job={job} />
        <VisitInfoCard job={job} />
        <EarlierPhotos job={job} exceptVisitId={active?.id} title="Photos on this job" />

        <JobTimeline job={job} />

        {!!parts.length && (
          <Card title="Parts used on this job" padded={false}>
            {parts.map((u, i) => (
              <View key={u.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{u.item?.name}</Text>
                  <Muted>
                    {qty(u.quantity)} {u.item?.unit_of_measure} × {money(u.unit_price)}
                    {u.from_technician_stock ? ' · from your parts' : ''}
                  </Muted>
                </View>
                <Text style={{ fontWeight: '600', color: colors.text }}>{money(u.total_price)}</Text>
              </View>
            ))}
          </Card>
        )}

        {job.invoice && (
          <BillSummary invoice={job.invoice}>
            {job.invoice.balance_amount > 0 && !active && <Button title={`Collect balance ${money(job.invoice.balance_amount)}`} size="sm" icon="cash-outline" onPress={() => setCollecting(true)} />}
          </BillSummary>
        )}

        {!!history.length && (
          <Card title="Visits on this job" padded={false}>
            {history.map((v, i) => (
              <View key={v.id} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{date(v.start_time)}</Text>
                  <Badge text={v.status} />
                </View>
                <Muted>
                  {v.technician?.name} · {label(v.service_type)} · {money(v.total_charge)}
                </Muted>
                {v.service_summary && <Text style={{ color: colors.text, fontSize: 13 }}>{v.service_summary}</Text>}
              </View>
            ))}
          </Card>
        )}

        {!!job.previous_services?.length && (
          <Card title="Previous service" padded={false}>
            {job.previous_services.map((s, i) => (
              <View key={`${s.job_id}-${i}`} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>
                    {date(s.date)} · {s.crm_call_id}
                  </Text>
                  <Badge text={s.status} />
                </View>
                <Muted>
                  {[s.complaint, s.action_taken, s.technician].filter(Boolean).join(' · ')}
                  {s.total_charge ? ` · ${money(s.total_charge)}` : ''}
                </Muted>
                {s.summary && <Text style={{ color: colors.text, fontSize: 13 }}>{s.summary}</Text>}
              </View>
            ))}
          </Card>
        )}

        {canStart && !active && <Button title="Ask the office to cancel this job" variant="ghost" size="sm" icon="close-circle-outline" onPress={() => setCancelling(true)} />}
      </Screen>
      {active ? (
        <BottomBar>
          <Button title="Continue service" size="lg" icon="play" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/visit/[id]', params: { id: active.id, job: job.id } })} />
        </BottomBar>
      ) : job.needs_resume_approval ? (
        <BottomBar>
          {job.resume_requested_at ? (
            <Button title="Asked: waiting for approval" size="lg" icon="hourglass-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setResuming(true)} />
          ) : (
            <Button title="Ask the office to resume" size="lg" icon="send" style={{ flex: 1 }} onPress={() => setResuming(true)} />
          )}
        </BottomBar>
      ) : (
        canStart && (
          <BottomBar>
            <Button title="Check details & start" size="lg" icon="arrow-forward" style={{ flex: 1 }} onPress={startService} />
          </BottomBar>
        )
      )}
      <PunchFirst
        open={punchFirst}
        onClose={() => setPunchFirst(false)}
        onPunched={() => {
          setPunchFirst(false);
          router.push({ pathname: '/start/[id]', params: { id: job.id } });
        }}
      />
      {collecting && job.invoice && (
        <CollectPayment
          invoiceId={job.invoice.id}
          due={job.invoice.balance_amount}
          note={`Job ${job.crm_call_id}`}
          branchId={job.branch_id}
          onClose={() => setCollecting(false)}
          onDone={() => {
            setCollecting(false);
            refetch();
          }}
        />
      )}
      <CancelRequest job={job} open={cancelling} onClose={() => setCancelling(false)} />
      <ResumeRequest job={job} open={resuming} onClose={() => setResuming(false)} />
    </>
  );
}

/** The technician can only ask: the job stays with them until the office approves or rejects it. */
function CancelRequest({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const m = useApiMutation(() => api.post(`/jobs/${job.id}/cancel-request`, { reason: reason.trim() }), {
    toastValidation: false,
    success: 'Sent to the office for approval',
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
      qc.invalidateQueries({ queryKey: ['tech-jobs'] });
      onClose();
    },
  });
  const short = reason.trim().length < 10;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ask to cancel this job"
      footer={
        <>
          <Button title="Go back" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
          <Button title="Send for approval" variant="danger" style={{ flex: 1 }} loading={m.isPending} disabled={short} onPress={() => m.mutate(undefined)} />
        </>
      }
    >
      <Muted>The office decides. Until then the job shows as waiting, and if they reject it, it comes back to you.</Muted>
      <Field label="Reason" required error={fieldError(m.error, 'reason') ?? fieldError(m.error, 'job')} hint="At least 10 characters, so the office can decide.">
        <Input multiline maxLength={500} value={reason} onChangeText={setReason} placeholder="Why should this job be cancelled?" />
      </Field>
    </Sheet>
  );
}

/** The job stays with the technician; the office decides when the next visit can go ahead. */
function ResumeRequest({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const m = useApiMutation(() => api.post(`/jobs/${job.id}/resume-request`, { note: note.trim() || null }), {
    toastValidation: false,
    success: 'Sent to the office for approval',
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
      setNote('');
      onClose();
    },
  });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={job.resume_requested_at ? 'Ask again?' : 'Ask to resume this job'}
      footer={
        <>
          <Button title="Go back" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
          <Button title={job.resume_requested_at ? 'Send again' : 'Send to office'} style={{ flex: 1 }} loading={m.isPending} onPress={() => m.mutate(undefined)} />
        </>
      }
    >
      <Muted>The job stays with you. Once the office approves, you can start the next visit. You’ll get a notification.</Muted>
      <Field label="Note for the office (optional)" error={fieldError(m.error, 'note') ?? fieldError(m.error, 'job')}>
        <Input multiline maxLength={500} value={note} onChangeText={setNote} placeholder="e.g. Part collected, customer free tomorrow morning" />
      </Field>
    </Sheet>
  );
}

function Action({ icon, label: text, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: pressed ? colors.pressed : colors.bg })}>
      <Icon name={icon} color={color} size={22} />
      <Text style={{ fontSize: 12, fontWeight: '600', color }}>{text}</Text>
    </Pressable>
  );
}

function mapsLink(job: Job, directions = false): string | null {
  const c = job.customer;
  if (c?.lat == null || c.lng == null) return null;
  return directions ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` : `https://maps.google.com/?q=${c.lat},${c.lng}`;
}

/** The job card as plain text, for WhatsApp or any other app (e.g. to a colleague or the office). */
async function shareJob(job: Job) {
  const c = job.customer;
  const p = job.customer_product;
  const last = job.previous_services?.[0];
  const lines = [
    `Job ${job.crm_call_id} · ${label(job.status)} · ${label(job.priority)} priority`,
    `Visit: ${schedule(job.scheduled_at).text}`,
    `Customer: ${c?.name ?? '—'}, ${c?.phone ?? ''}${c?.alt_phone ? ` / ${c.alt_phone}` : ''}`,
    `Address: ${[c?.address, c?.city, c?.pincode].filter(Boolean).join(', ') || '—'}`,
    mapsLink(job) && `Map: ${mapsLink(job)}`,
    `Complaint: ${job.complaint_type?.name ?? 'Service'}${job.complaint_details ? ` – ${job.complaint_details}` : ''}`,
    (brandOf(p) || productTypeOf(p) || modelOf(p)) && `Unit: ${[brandOf(p) && `Brand ${brandOf(p)}`, productTypeOf(p) ?? job.product_category, modelOf(p) && `Model ${modelOf(p)}`].filter(Boolean).join(' · ')}${p?.serial_no ? ` · SN ${p.serial_no}` : ''}`,
    p && `Warranty: ${p.under_warranty ? `covered${p.warranty_expiry ? ` till ${date(p.warranty_expiry)}` : ''}` : p.warranty_type || p.warranty_expiry ? 'out of warranty' : 'not recorded'}${p.purchase_date ? ` · bought ${date(p.purchase_date)}` : ''}`,
    `Call type: ${label(job.call_type)}${job.call_age_days != null ? ` · ${callAge(job.call_age_days).toLowerCase()}` : ''}`,
    last && `Last service: ${date(last.date)}${last.action_taken ? ` · ${last.action_taken}` : ''}${last.summary ? ` – ${last.summary}` : ''}`,
  ].filter(Boolean);
  try {
    await Share.share({ message: lines.join('\n'), title: `Job ${job.crm_call_id}` });
  } catch (e) {
    toast.error((e as Error).message);
  }
}
