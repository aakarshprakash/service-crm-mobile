import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Image, Keyboard, Linking, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { api, ApiError, openPdf, type Envelope, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queuePhoto } from '@/lib/photos';
import { discardUpload, enqueueSignature, forgetCapture, rememberCapture, retryAll, retryUpload, useUploads, waitForVisit, type UploadItem } from '@/lib/uploads';
import { fieldError, isGone, useApiMutation, useLookups, useMyParts, useNow } from '@/lib/hooks';
import { label, METHOD_LABEL, money, qty, toMajor, toMinor } from '@/lib/format';
import { tryPosition } from '@/lib/location';
import type { InventoryItem, Invoice, Job, Payment, Visit } from '@/lib/types';
import { toast } from '@/components/toast';
import { Badge, Banner, BottomBar, Button, Card, Empty, ErrorView, Field, FlowSteps, Icon, Input, Loading, Muted, Row, Screen, Segmented, Sheet, Stepper, type IconName } from '@/components/ui';
import { UpiSheet } from '@/components/UpiSheet';
import { SignaturePad } from '@/components/SignaturePad';
import { ProductFields, callPayload, checkCallForm, initialCallForm, type CallForm } from '@/components/CallDetails';
import { ComplaintCard, EarlierPhotos, PhotoThumb, thumb } from '@/components/JobDetails';
import { CustomerLocationCard } from '@/components/CustomerLocation';
import { VoiceNotes } from '@/components/VoiceNotes';
import { colors, radius } from '@/components/theme';

type Tab = 'call' | 'photos' | 'parts' | 'complete';
type VisitResult = 'completed' | 'pending' | 'part_pending' | 'cancelled';
type Done = { invoice: Invoice | null; payment: Payment | null; status: VisitResult; method: string | null };

export default function VisitScreen() {
  const { id, job: jobId } = useLocalSearchParams<{ id: string; job: string }>();
  const job = useQuery({ queryKey: ['tech-job', jobId], queryFn: () => api.get<Envelope<Job>>(`/jobs/${jobId}`).then((r) => r.data) });
  const visit = useQuery({ queryKey: ['visit', id], queryFn: () => api.get<Envelope<Visit>>(`/visits/${id}`).then((r) => r.data) });
  const [tab, setTab] = useState<Tab>('call');
  const [done, setDone] = useState<Done | null>(null);
  const queuedPhotos = useUploads(Number(id)).filter((u) => u.kind === 'image').length;

  if (job.isPending || visit.isPending) return <Loading />;
  if (!job.data || !visit.data || isGone(job.error) || isGone(visit.error)) return <ErrorView error={job.error ?? visit.error} onRetry={() => { job.refetch(); visit.refetch(); }} />;
  if (done) return <Completed job={job.data} result={done} />;
  if (visit.data.status !== 'in_progress') {
    return (
      <Screen>
        <Empty icon="checkmark-circle-outline" title="This visit is already closed" message={visit.data.auto_closed ? 'It was still running at the end of the day, so it was closed automatically. Your photos and parts are kept.' : undefined} />
        <Button title="Back to job" onPress={() => router.back()} />
      </Screen>
    );
  }

  const v = visit.data;

  return (
    <>
      <Stack.Screen options={{ title: job.data.crm_call_id }} />
      <View style={{ backgroundColor: colors.navy, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.onBrand, fontWeight: '600' }}>
          <Icon name="timer-outline" size={16} color={colors.onBrand} /> {label(v.service_type)}
        </Text>
        <VisitTimer start={v.start_time} />
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'call', label: 'Call' },
            { value: 'photos', label: 'Photos', count: (v.images?.filter((i) => i.type !== 'signature').length ?? 0) + (v.voice_notes?.length ?? 0) + queuedPhotos || undefined },
            { value: 'parts', label: 'Parts', count: v.inventory_usage?.length || undefined },
            { value: 'complete', label: 'Complete' },
          ]}
        />
      </View>
      {/* All stay mounted, so moving between steps never loses what's been typed in another. */}
      <View style={{ flex: 1, display: tab === 'call' ? 'flex' : 'none' }}>
        <CallTab job={job.data} visit={v} onNext={() => setTab('photos')} />
      </View>
      <View style={{ flex: 1, display: tab === 'photos' ? 'flex' : 'none' }}>
        <PhotosTab job={job.data} visit={v} onNext={() => setTab('parts')} />
      </View>
      <View style={{ flex: 1, display: tab === 'parts' ? 'flex' : 'none' }}>
        <PartsTab visit={v} onNext={() => setTab('complete')} />
      </View>
      <View style={{ flex: 1, display: tab === 'complete' ? 'flex' : 'none' }}>
        <CompleteTab job={job.data} visit={v} onDone={setDone} goTo={setTab} />
      </View>
    </>
  );
}

/** Live visit timer. Only this small piece redraws every second, not the whole visit screen. */
function VisitTimer({ start }: { start: string }) {
  const now = useNow(1000);
  const elapsed = Math.max(0, Math.floor((now - new Date(start).getTime()) / 1000));
  const hh = (n: number) => String(n).padStart(2, '0');
  return (
    <Text style={{ color: colors.onBrand, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
      {hh(Math.floor(elapsed / 3600))}:{hh(Math.floor((elapsed % 3600) / 60))}:{hh(elapsed % 60)}
    </Text>
  );
}

/** The job summary as the office wrote it (read-only), and the unit: locked fields shown, the rest editable. */
function CallTab({ job, visit, onNext }: { job: Job; visit: Visit; onNext: () => void }) {
  const c = job.customer;
  const [form, setForm] = useState(() => initialCallForm(job));
  const [local, setLocal] = useState<Record<string, string>>({});
  const set = (k: keyof CallForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (Object.keys(local).length) setLocal({});
  };
  const m = useApiMutation(() => api.patch(`/visits/${visit.id}`, callPayload(form)), {
    invalidate: [['tech-job', String(job.id)]],
    toastValidation: false,
    success: 'Saved',
    onSuccess: onNext,
  });
  const e = (n: string) => local[n] ?? fieldError(m.error, n);
  const save = () => {
    const problems = checkCallForm(form);
    setLocal(problems);
    if (Object.keys(problems).length) toast.error(Object.values(problems)[0]!);
    else m.mutate(undefined);
  };

  return (
    <Screen>
      <FlowSteps current="service" />
      <Card>
        <Text style={{ fontWeight: '700', color: colors.text }}>{c?.name}</Text>
        <Muted>{c?.phone}</Muted>
        {!!c?.address && <Muted>{[c.address, c.city, c.pincode].filter(Boolean).join(', ')}</Muted>}
      </Card>
      <CustomerLocationCard job={job} />
      <ComplaintCard job={job} title="Job summary" note="Write what you found and did in the service summary when you complete the visit." />
      <ProductFields job={job} form={form} set={set} error={e} scanHint="Scanned. Tap “Save & continue” to keep it." />
      <Button title="Save & continue" icon="arrow-forward" loading={m.isPending} onPress={save} />
    </Screen>
  );
}

/** Until the company's own list has loaded, and on servers that don't send one. */
const DEFAULT_PHOTO_TYPES = [
  { key: 'bill', label: 'Bill' },
  { key: 'serial', label: 'Serial number' },
  { key: 'complaint_part', label: 'Faulty part' },
  { key: 'new_part', label: 'New part' },
  { key: 'other', label: 'Other' },
];

function PhotosTab({ job, visit, onNext }: { job: Job; visit: Visit; onNext: () => void }) {
  const qc = useQueryClient();
  const pending = useUploads(visit.id).filter((u) => u.kind === 'image');
  const [preparing, setPreparing] = useState<string | null>(null);
  const lookupsQuery = useLookups();
  const lookups = lookupsQuery.data;
  const configured = lookups?.photo_types?.length ? lookups.photo_types : DEFAULT_PHOTO_TYPES;
  // Photos in a section removed since they were taken stay visible, so they can still be retried or deleted.
  const orphans = [...new Set([...(visit.images ?? []).map((i) => i.type), ...pending.map((u) => u.type)])].filter((t) => t !== 'signature' && !configured.some((s) => s.key === t));
  const sections = [...configured.map((s) => ({ ...s, removed: false })), ...orphans.map((key) => ({ key, label: lookups?.photo_labels?.[key] ?? label(key), removed: true }))];

  const take = async (type: string, fromLibrary: boolean) => {
    const perm = fromLibrary ? await ImagePicker.requestMediaLibraryPermissionsAsync() : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.error(fromLibrary ? 'Allow photo access in settings to attach photos.' : 'Allow camera access in settings to take photos.');
      return;
    }
    // If Android closes the app while the camera is open, the photo is recovered on restart.
    if (!fromLibrary) rememberCapture(visit.id, visit.job_id, type);
    let result: ImagePicker.ImagePickerResult;
    try {
      result = fromLibrary
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: 10, orderedSelection: true })
        : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    } catch {
      toast.error(fromLibrary ? 'Couldn’t open the gallery.' : 'Couldn’t open the camera.');
      return;
    } finally {
      forgetCapture();
    }
    if (result.canceled || !result.assets?.length) return;
    setPreparing(type);
    try {
      for (const asset of result.assets) await queuePhoto(visit.id, type, asset);
    } catch {
      toast.error('Couldn’t save the photo on the phone. Free up some storage and try again.');
    } finally {
      setPreparing(null);
    }
  };

  const remove = (imageId: number) =>
    Alert.alert('Delete this photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          api
            .delete(`/visits/${visit.id}/images/${imageId}`)
            .then(() => qc.invalidateQueries({ queryKey: ['visit', String(visit.id)] }))
            .catch((e: Error) => toast.error(e.message)),
      },
    ]);

  return (
    <Screen refreshing={false} onRefresh={() => { retryAll(); lookupsQuery.refetch(); qc.invalidateQueries({ queryKey: ['visit', String(visit.id)] }); }}>
      {/* A return visit: what was photographed last time stays here to compare with. */}
      <EarlierPhotos job={job} exceptVisitId={visit.id} />
      <VoiceNotes visit={visit} />
      {sections.map((t) => {
        const photos = visit.images?.filter((i) => i.type === t.key) ?? [];
        const queued = pending.filter((u) => u.type === t.key);
        const count = photos.length + queued.length;
        return (
          <Card key={t.key} title={t.label} right={<Muted>{count || ''}</Muted>}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {photos.map((p) => (
                <PhotoThumb key={p.id} image={p} onLongPress={() => remove(p.id)} />
              ))}
              {queued.map((u) => (
                <PendingThumb key={u.id} item={u} />
              ))}
            </View>
            {!t.removed && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: count ? 10 : 0 }}>
                <Button title="Camera" icon="camera-outline" size="sm" style={{ flex: 1 }} loading={preparing === t.key} disabled={!!preparing} onPress={() => take(t.key, false)} />
                <Button title="Gallery" icon="images-outline" size="sm" variant="secondary" style={{ flex: 1 }} disabled={!!preparing} onPress={() => take(t.key, true)} />
              </View>
            )}
          </Card>
        );
      })}
      <Muted style={{ textAlign: 'center' }}>Photos upload in the background and are kept on the phone until they reach the office, even without signal. Tap a photo to see it, long-press to delete it.</Muted>
      <Button title="Next: Parts" icon="arrow-forward" onPress={onNext} />
    </Screen>
  );
}

/** A photo still on the phone: upload progress, waiting for network, or refused (retry / remove). */
function PendingThumb({ item }: { item: UploadItem }) {
  const failed = item.status === 'failed';
  const onPress = () =>
    Alert.alert(
      failed ? 'Photo not uploaded' : 'Photo waiting to upload',
      failed ? item.error ?? 'The server refused this photo.' : item.error ?? 'It will upload automatically when the connection is back.',
      [
        { text: 'Close', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => discardUpload(item.id) },
        { text: 'Retry now', onPress: () => retryUpload(item.id) },
      ],
    );
  return (
    <Pressable onPress={onPress} accessibilityLabel={failed ? 'Upload failed, tap for options' : 'Uploading photo'}>
      <Image source={{ uri: item.uri }} style={[thumb, { opacity: 0.55 }]} />
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        {failed ? (
          <Icon name="alert-circle" size={28} color={colors.red} />
        ) : item.status === 'uploading' ? (
          <Text style={{ fontWeight: '700', color: colors.text }}>{Math.round(item.progress * 100)}%</Text>
        ) : (
          <Icon name="cloud-upload-outline" size={24} color={colors.text} />
        )}
      </View>
      {item.status === 'uploading' && (
        <View style={{ position: 'absolute', left: 6, right: 6, bottom: 6, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)' }}>
          <View style={{ width: `${Math.max(4, item.progress * 100)}%`, height: 4, borderRadius: 2, backgroundColor: colors.brand }} />
        </View>
      )}
    </Pressable>
  );
}

function PartsTab({ visit, onNext }: { visit: Visit; onNext: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  // From the technician's own parts, or a search of the branch's stock.
  const [picked, setPicked] = useState<{ item: Pick<InventoryItem, 'id' | 'code' | 'name' | 'unit_of_measure' | 'unit_price'>; source: 'technician' | 'branch'; available: number } | null>(null);
  const [quantity, setQuantity] = useState('1');
  const mine = useMyParts();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const items = useQuery({
    queryKey: ['spare-search', debounced],
    queryFn: () => api.get<Paginated<InventoryItem>>('/inventory/items', { search: debounced, active: 1, per_page: 10 }),
    enabled: debounced.length >= 2,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['visit', String(visit.id)] });
    qc.invalidateQueries({ queryKey: ['my-parts'] });
  };
  const add = useApiMutation(() => api.post(`/visits/${visit.id}/spares`, { item_id: picked!.item.id, quantity: Number(quantity), source: picked!.source }), {
    toastValidation: true,
    onSuccess: () => {
      setPicked(null);
      setSearch('');
      setQuantity('1');
      refresh();
    },
  });
  const remove = useApiMutation((usageId: number) => api.delete(`/visits/${visit.id}/spares/${usageId}`), { onSuccess: refresh });
  const total = (visit.inventory_usage ?? []).reduce((a, u) => a + u.total_price, 0);

  return (
    <Screen>
      <Card title="Used on this visit" right={<Text style={{ fontWeight: '700', color: colors.text }}>{money(total)}</Text>} padded={false}>
        {!visit.inventory_usage?.length ? (
          <Muted style={{ padding: 16 }}>No parts added yet.</Muted>
        ) : (
          visit.inventory_usage.map((u, i) => (
            <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.text }}>{u.item?.name}</Text>
                <Muted>
                  {u.item?.code} · {qty(u.quantity)} {u.item?.unit_of_measure} × {money(u.unit_price)}
                  {u.from_technician_stock ? ' · your parts' : ''}
                </Muted>
              </View>
              <Text style={{ fontWeight: '600', color: colors.text }}>{money(u.total_price)}</Text>
              <Pressable onPress={() => remove.mutate(u.id)} hitSlop={10} accessibilityLabel="Remove part">
                <Icon name="trash-outline" color={colors.red} size={18} />
              </Pressable>
            </View>
          ))
        )}
      </Card>

      {!!mine.data?.stock.length && (
        <Card title="Your parts" padded={false}>
          {mine.data.stock.map((p, i) => (
            <Pressable key={p.id} onPress={() => { setSearch(''); setPicked({ item: p.item!, source: 'technician', available: p.quantity }); setQuantity('1'); }} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, backgroundColor: pressed ? colors.bg : 'transparent' })}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.text }}>{p.item?.name}</Text>
                <Muted>{p.item?.code} · {money(p.item?.unit_price)}</Muted>
              </View>
              <Text style={{ fontWeight: '700', color: colors.brand }}>{qty(p.quantity)} {p.item?.unit_of_measure}</Text>
            </Pressable>
          ))}
        </Card>
      )}

      <Field label="Or take from branch stock">
        <Input value={search} onChangeText={(v) => { setSearch(v); setPicked(null); }} placeholder="Search by code or name" />
      </Field>
      {picked ? (
        <Card>
          <Text style={{ fontWeight: '700', color: colors.text }}>{picked.item.name}</Text>
          <Muted>
            {picked.item.code} · {money(picked.item.unit_price)} · {qty(picked.available)} {picked.item.unit_of_measure} {picked.source === 'technician' ? 'with you' : 'at your branch'}
          </Muted>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Field label={`Quantity (${picked.item.unit_of_measure})`} error={fieldError(add.error, 'quantity')}>
              <Stepper
                value={quantity}
                onChange={setQuantity}
                step={picked.item.unit_of_measure === 'nos' ? 1 : 0.5}
                decimals={picked.item.unit_of_measure === 'nos' ? 0 : 3}
                max={Math.max(picked.available, picked.item.unit_of_measure === 'nos' ? 1 : 0.5)}
              />
            </Field>
            <Button title={`Add ${quantity || 0} ${picked.item.unit_of_measure}`} icon="add" loading={add.isPending} disabled={!Number(quantity)} onPress={() => add.mutate(undefined)} />
          </View>
        </Card>
      ) : (
        debounced.length >= 2 && (
          <Card padded={false}>
            {items.isPending ? (
              <Loading />
            ) : !items.data?.data.length ? (
              <Muted style={{ padding: 16 }}>No parts match “{debounced}”.</Muted>
            ) : (
              items.data.data.map((it, i) => {
                const stock = Number(it.stock_total ?? 0);
                return (
                  <Pressable key={it.id} disabled={stock <= 0} onPress={() => { Keyboard.dismiss(); setPicked({ item: it, source: 'branch', available: stock }); }} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, opacity: stock > 0 ? 1 : 0.5, flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: colors.text }}>{it.name}</Text>
                      <Muted>
                        {it.code} · {money(it.unit_price)}
                      </Muted>
                    </View>
                    <Text style={{ color: stock > 0 ? colors.muted : colors.red, fontSize: 13 }}>{stock > 0 ? `${qty(stock)} ${it.unit_of_measure}` : 'Out of stock'}</Text>
                  </Pressable>
                );
              })
            )}
          </Card>
        )
      )}
      <Button title="Next: Complete" icon="arrow-forward" onPress={onNext} />
    </Screen>
  );
}

const RESULT_LABEL: Record<VisitResult, string> = { completed: 'Completed', pending: 'Pending', part_pending: 'Part pending', cancelled: 'Cancel job' };

/**
 * Closing the visit in two steps: fill in the result, charges, payment and signature, then
 * "Review & complete" shows it all on one screen before the invoice is made.
 */
function CompleteTab({ job, visit, onDone, goTo }: { job: Job; visit: Visit; onDone: (r: Done) => void; goTo: (t: Tab) => void }) {
  const qc = useQueryClient();
  const { data: lookups } = useLookups();
  const usageTotal = (visit.inventory_usage ?? []).reduce((a, u) => a + u.total_price, 0);
  const previousBalance = job.invoice?.balance_amount ?? 0;
  const [form, setForm] = useState({
    status: 'completed' as VisitResult,
    action_taken_id: '',
    service_summary: visit.service_summary ?? '',
    customer_satisfaction_code: job.customer_satisfaction_code ?? '',
    labour_charge: '',
    spare_charge: toMajor(usageTotal),
    payment_method: 'cash',
    amount_collected: '',
    payment_reference: '',
  });
  const [reviewing, setReviewing] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const billing = lookups?.billing;
  const [isGst, setIsGst] = useState<boolean | null>(null);
  const gstBill = isGst ?? billing?.job_bills !== 'non_gst';
  // Chosen when the bill is first made. After that it may already be with the customer, so accounts change it.
  const chooseBillType = !!billing?.gst_registered && !job.invoice;
  const cancelling = form.status === 'cancelled';
  const partsOnVisit = visit.inventory_usage?.length ?? 0;
  // Parts added or removed on the Parts step update the charge; this form stays open between steps.
  useEffect(() => {
    setForm((f) => ({ ...f, spare_charge: toMajor(usageTotal), amount_collected: '' }));
  }, [usageTotal]);
  const [pickAction, setPickAction] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [signing, setSigning] = useState(false);
  const { user } = useAuth();
  const signatureRequired = !!user?.tenant?.require_signature;
  const uploads = useUploads(visit.id);
  const queuedSignature = uploads.find((u) => u.kind === 'signature');
  const savedSignature = visit.images?.find((i) => i.type === 'signature');
  const hasSignature = !!queuedSignature || !!savedSignature;
  const queuedPhotos = uploads.filter((u) => u.kind === 'image');
  const savedPhotos = visit.images?.filter((i) => i.type !== 'signature') ?? [];
  const [waitingUploads, setWaitingUploads] = useState(false);
  const total = cancelling ? 0 : toMinor(form.labour_charge) + toMinor(form.spare_charge);
  const due = cancelling ? 0 : total + previousBalance;
  const collects = ['cash', 'upi', 'cheque', 'bank_transfer'].includes(form.payment_method);
  const collected = form.amount_collected === '' ? due : toMinor(form.amount_collected);
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (local[k]) setLocal((l) => ({ ...l, [k]: '' }));
  };

  const m = useApiMutation(
    async () => {
      // Photos and the signature must reach the server before the visit closes.
      if (uploads.length) {
        setWaitingUploads(true);
        try {
          await waitForVisit(visit.id);
        } finally {
          setWaitingUploads(false);
        }
      }
      const pos = await tryPosition(5000);
      return api.post<Envelope<{ invoice: Invoice | null; payment: Payment | null }>>(`/visits/${visit.id}/complete`, {
        status: form.status,
        action_taken_id: !cancelling && form.action_taken_id ? Number(form.action_taken_id) : null,
        service_summary: form.service_summary,
        customer_satisfaction_code: cancelling ? null : form.customer_satisfaction_code.trim() || null,
        labour_charge: total === 0 ? 0 : toMinor(form.labour_charge),
        spare_charge: total === 0 ? 0 : toMinor(form.spare_charge),
        payment_method: !cancelling && (total > 0 || collected > 0) ? form.payment_method : null,
        amount_collected: !cancelling && collects ? collected : 0,
        payment_reference: cancelling ? null : form.payment_reference || null,
        is_gst: !cancelling && chooseBillType ? gstBill : null,
        ...(pos ?? {}),
      });
    },
    {
      toastValidation: true,
      onSuccess: (r) => {
        qc.invalidateQueries({ queryKey: ['visit', String(visit.id)] });
        qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
        qc.invalidateQueries({ queryKey: ['tech-dashboard'] });
        qc.invalidateQueries({ queryKey: ['tech-jobs'] });
        qc.invalidateQueries({ queryKey: ['my-cash'] });
        qc.invalidateQueries({ queryKey: ['my-parts'] });
        onDone({ invoice: r.data.invoice, payment: r.data.payment, status: form.status, method: !cancelling && (total > 0 || collected > 0) ? form.payment_method : null });
      },
    },
  );
  // A refusal from the server is about something on the form: go back to it, with the field marked.
  useEffect(() => {
    if (m.error instanceof ApiError && m.error.status === 422) setReviewing(false);
  }, [m.error]);
  const e = (n: string) => local[n] || fieldError(m.error, n);
  const actionName = lookups?.action_taken_options.find((a) => String(a.id) === form.action_taken_id)?.name;
  const methods = [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'bank_transfer', label: 'Bank' },
    { value: 'credit', label: 'Credit' },
  ];

  /** The same rules the server applies, checked before the review so it shows only a form that will go through. */
  const review = () => {
    const problems: Record<string, string> = {};
    const summary = form.service_summary.trim();
    if (form.status === 'completed' && !form.action_taken_id) problems.action_taken_id = 'Select the action taken.';
    if (!summary) problems.service_summary = cancelling ? 'Write why this job should be cancelled.' : 'Enter a short service summary.';
    else if (cancelling && summary.length < 10) problems.service_summary = 'Write a clear reason (at least 10 characters) so the office can decide.';
    if (cancelling && partsOnVisit > 0) problems.status = 'Remove the parts on the Parts tab first, so they go back to stock.';
    if (form.status === 'completed' && signatureRequired && !hasSignature) problems.signature = 'Take the customer’s signature before completing the visit.';
    if (due > 0 && collects && collected > 0 && ['cheque', 'bank_transfer'].includes(form.payment_method) && !form.payment_reference.trim()) {
      problems.payment_reference = form.payment_method === 'cheque' ? 'Enter the cheque number.' : 'Enter the UTR / reference.';
    }
    setLocal(problems);
    if (Object.keys(problems).length) {
      toast.error(Object.values(problems)[0]!);
      if (problems.signature) setSigning(true);
      return;
    }
    Keyboard.dismiss();
    m.reset();
    setReviewing(true);
  };

  const submitTitle = waitingUploads
    ? 'Finishing uploads…'
    : form.status === 'completed'
      ? total > 0 || previousBalance > 0 ? 'Generate invoice' : 'Complete visit'
      : form.status === 'pending' ? 'Save as pending' : form.status === 'part_pending' ? 'Save as part pending' : 'Send cancellation for approval';

  if (reviewing) {
    return (
      <>
        <Screen key="review">
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.heading }}>{cancelling ? 'Review cancellation' : 'Review & Complete'}</Text>
            <Muted>{form.status === 'completed' ? 'Please review the details before generating the invoice.' : 'Please review before saving. The visit can’t be edited afterwards.'}</Muted>
          </View>

          <ReviewCard icon="construct-outline" title="Service details" onEdit={() => setReviewing(false)}>
            <Row k="Visit result" v={RESULT_LABEL[form.status]} strong />
            {!cancelling && <Row k="Action taken" v={actionName ?? '—'} />}
            <View style={{ gap: 2, paddingVertical: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>{cancelling ? 'Reason' : 'Service summary'}</Text>
              <Text style={{ color: colors.text, fontSize: 14 }}>{form.service_summary.trim()}</Text>
            </View>
            {!cancelling && !!form.customer_satisfaction_code.trim() && <Row k="Satisfaction code" v={form.customer_satisfaction_code.trim()} />}
            {!cancelling && (
              <>
                <Row k="Labour charge" v={money(toMinor(form.labour_charge))} />
                <Row k="Spare charge" v={money(toMinor(form.spare_charge))} />
              </>
            )}
          </ReviewCard>

          <ReviewCard icon="cube-outline" title={`Parts used (${partsOnVisit})`} right={<Text style={{ fontWeight: '700', color: colors.text }}>{money(usageTotal)}</Text>} onPress={() => goTo('parts')} />

          <ReviewCard icon="camera-outline" title={`Photos (${savedPhotos.length + queuedPhotos.length})`} onPress={() => goTo('photos')}>
            {savedPhotos.length + queuedPhotos.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[...savedPhotos.map((p) => p.url), ...queuedPhotos.map((u) => u.uri)].slice(0, 3).map((uri) => (
                  <Image key={uri} source={{ uri }} style={{ flex: 1, height: 64, borderRadius: 8, backgroundColor: colors.border }} />
                ))}
              </View>
            ) : (
              <Muted>No photos on this visit.</Muted>
            )}
          </ReviewCard>

          {!cancelling && (
            <ReviewCard icon="wallet-outline" title="Payment" right={<Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>{money(due)}</Text>}>
              {previousBalance > 0 && <Row k="Includes earlier balance" v={money(previousBalance)} vStyle={{ color: colors.amber }} />}
              {due > 0 ? (
                <>
                  <Row k="Mode" v={METHOD_LABEL[form.payment_method] ?? label(form.payment_method)} />
                  <Row k="Collected now"v={money(collects ? collected : 0)} vStyle={{ color: colors.green, fontWeight: '700' }} />
                  {collects && collected < due && <Row k="Left on the customer’s account" v={money(due - collected)} vStyle={{ color: colors.amber }} />}
                  {!!form.payment_reference && <Row k="Reference" v={form.payment_reference} />}
                </>
              ) : (
                <Muted>Nothing to collect.</Muted>
              )}
              {(chooseBillType || job.invoice) && total > 0 && <Row k="Bill" v={(chooseBillType ? gstBill : !!job.invoice?.is_gst) ? 'GST bill' : 'Non-GST bill'} />}
            </ReviewCard>
          )}

          {!cancelling && (
            <ReviewCard
              icon="create-outline"
              title="Customer signature"
              right={<Text style={{ fontWeight: '700', color: hasSignature ? colors.green : signatureRequired && form.status === 'completed' ? colors.red : colors.muted }}>{hasSignature ? 'Added' : 'Not taken'}</Text>}
              onPress={() => setSigning(true)}
            />
          )}

          {uploads.length > 0 && (
            <Muted style={{ textAlign: 'center' }}>
              {uploads.some((u) => u.status === 'failed')
                ? 'An upload was refused by the server. Open the Photos tab to retry or remove it.'
                : `${uploads.length} upload${uploads.length > 1 ? 's' : ''} still going. ${form.status === 'completed' ? 'The invoice is made' : 'It’s saved'} as soon as ${uploads.length > 1 ? 'they finish' : 'it finishes'}.`}
            </Muted>
          )}
        </Screen>
        <BottomBar>
          <Button title="Edit" variant="secondary" icon="create-outline" style={{ flex: 1 }} disabled={m.isPending} onPress={() => setReviewing(false)} />
          <Button
            title={submitTitle}
            size="lg"
            variant={cancelling ? 'danger' : 'primary'}
            icon={form.status === 'completed' ? 'document-text-outline' : 'checkmark-circle'}
            loading={m.isPending}
            style={{ flex: 2.2 }}
            onPress={() => m.mutate(undefined)}
          />
        </BottomBar>
        <SignaturePad
          open={signing}
          defaultName={job.customer?.name}
          onClose={() => setSigning(false)}
          onSave={(png, name) => {
            enqueueSignature(visit.id, png, name);
            setSigning(false);
            toast.success('Signature saved');
          }}
        />
      </>
    );
  }

  return (
    <>
      <Screen key="form">
        <FlowSteps current="complete" />
        <Field label="Visit result" required error={e('status')}>
          <Segmented columns={2} value={form.status} onChange={(v) => set('status', v)} options={(['completed', 'pending', 'part_pending', 'cancelled'] as const).map((value) => ({ value, label: RESULT_LABEL[value] }))} />
        </Field>
        {cancelling && (
          <Banner tone="danger" icon="hourglass-outline" title="The office must approve this" message="The job stays open until they decide. Nothing is billed on this visit.">
            {partsOnVisit > 0 && <Text style={{ color: colors.red, fontWeight: '700' }}>Remove the {partsOnVisit > 1 ? `${partsOnVisit} parts` : 'part'} on the Parts tab first, so {partsOnVisit > 1 ? 'they go' : 'it goes'} back to stock.</Text>}
          </Banner>
        )}
        {(form.status === 'pending' || form.status === 'part_pending') && (
          <Banner tone="info" icon="information-circle-outline" title="The job stays with you" message="To go back for the next visit, ask the office to approve it from the job screen." />
        )}
        {!cancelling && (
          <Field label="Action taken" required={form.status === 'completed'} error={e('action_taken_id')}>
            <Pressable onPress={() => setPickAction(true)} style={{ borderWidth: 1, borderColor: e('action_taken_id') ? colors.red : colors.inputBorder, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.card }}>
              <Text style={{ color: actionName ? colors.text : colors.faint, fontSize: 16 }}>{actionName ?? 'Select what you did…'}</Text>
            </Pressable>
          </Field>
        )}
        <Field label={cancelling ? 'Reason for cancelling' : 'Service summary'} required error={e('service_summary')} hint={cancelling ? 'At least 10 characters, so the office can decide.' : form.status === 'part_pending' ? 'Write which part is needed, so the office can order it.' : undefined}>
          <Input
            multiline
            value={form.service_summary}
            invalid={!!e('service_summary')}
            onChangeText={(v) => set('service_summary', v)}
            placeholder={cancelling ? 'Why should this job be cancelled?' : 'What was checked / done, parts pending, advice given…'}
          />
        </Field>
        {!cancelling && (
          <>
            <Field label="Customer Satisfaction Code" error={e('customer_satisfaction_code')} hint="Ask the customer for this code.">
              <Input value={form.customer_satisfaction_code} autoCapitalize="characters" autoCorrect={false} maxLength={50} onChangeText={(v) => set('customer_satisfaction_code', v)} />
            </Field>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Labour charge" error={e('labour_charge')}>
                  <Input value={form.labour_charge} keyboardType="decimal-pad" placeholder="0" onChangeText={(v) => setForm((f) => ({ ...f, labour_charge: v.replace(/[^\d.]/g, ''), amount_collected: '' }))} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Spare charge" error={e('spare_charge')} hint={usageTotal ? `Parts: ${money(usageTotal)}` : undefined}>
                  <Input value={form.spare_charge} keyboardType="decimal-pad" placeholder="0" onChangeText={(v) => setForm((f) => ({ ...f, spare_charge: v.replace(/[^\d.]/g, ''), amount_collected: '' }))} />
                </Field>
              </View>
            </View>
            {chooseBillType && total > 0 && (
              <Field label="Bill type" error={e('is_gst')} hint={gstBill ? 'Prices include GST, so the customer pays the same. The invoice shows the tax split.' : 'A plain invoice with no tax shown.'}>
                <Segmented value={gstBill ? 'gst' : 'non_gst'} onChange={(v) => setIsGst(v === 'gst')} options={[{ value: 'gst', label: 'GST bill' }, { value: 'non_gst', label: 'Non-GST bill' }]} />
              </Field>
            )}
            {!!job.invoice && total > 0 && <Muted>This adds to {job.invoice.invoice_number}, a {job.invoice.is_gst ? 'GST' : 'non-GST'} bill.</Muted>}
            <Card>
              <Row k="This visit" v={money(total)} />
              {previousBalance > 0 && <Row k="Previous balance" v={money(previousBalance)} vStyle={{ color: colors.amber }} />}
              <Row k="Amount due" v={money(due)} strong />
            </Card>
          </>
        )}

        {due > 0 && (
          <>
            <Field label="Payment" error={e('payment_method')}>
              <Segmented value={form.payment_method} columns={3} onChange={(v) => setForm((f) => ({ ...f, payment_method: v, payment_reference: '' }))} options={methods} />
              <Muted style={{ fontSize: 12 }}>
                {form.payment_method === 'credit' ? 'Nothing collected now; the amount goes to the customer’s outstanding.' : 'Cash and cheques are handed over at your daily cash close.'}
              </Muted>
            </Field>
            {collects && (
              <>
                <Field label="Amount collected" error={e('amount_collected') ?? e('amount')} hint="Partial payment is allowed">
                  <Input value={form.amount_collected === '' ? toMajor(due) : form.amount_collected} keyboardType="decimal-pad" onChangeText={(v) => set('amount_collected', v.replace(/[^\d.]/g, ''))} />
                </Field>
                {form.payment_method === 'upi' && collected > 0 && <Button title="Show UPI QR to customer" variant="secondary" icon="qr-code-outline" onPress={() => setShowQr(true)} />}
                {form.payment_method !== 'cash' && (
                  <Field label={form.payment_method === 'cheque' ? 'Cheque number' : form.payment_method === 'upi' ? 'UPI reference (optional)' : 'UTR / reference'} required={form.payment_method !== 'upi'} error={e('payment_reference') || e('reference_no')}>
                    <Input value={form.payment_reference} autoCapitalize="characters" onChangeText={(v) => set('payment_reference', v)} />
                  </Field>
                )}
              </>
            )}
          </>
        )}

        {!cancelling && (
          <Card
            title="Customer signature"
            right={<Badge text={signatureRequired && form.status === 'completed' ? 'required' : 'optional'} tone={signatureRequired && form.status === 'completed' ? (hasSignature ? 'completed' : 'pending') : 'cancelled'} />}
          >
            {hasSignature ? (
              <View style={{ gap: 6 }}>
                <Image
                  source={{ uri: queuedSignature?.uri ?? savedSignature?.url }}
                  resizeMode="contain"
                  style={{ height: 96, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' }}
                />
                <Muted>
                  Signed by {queuedSignature?.signerName ?? visit.signer_name ?? 'customer'}
                  {queuedSignature ? (queuedSignature.status === 'failed' ? ' · not uploaded' : ' · uploading…') : ''}
                </Muted>
              </View>
            ) : (
              <Muted style={e('signature') ? { color: colors.red } : undefined}>{e('signature') ?? 'After the work is done, ask the customer to sign on the phone. It is printed on the invoice.'}</Muted>
            )}
            <Button title={hasSignature ? 'Sign again' : 'Take customer signature'} icon="create-outline" variant={hasSignature ? 'ghost' : 'secondary'} style={{ marginTop: 10 }} onPress={() => setSigning(true)} />
          </Card>
        )}

        <Button title={cancelling ? 'Review cancellation' : 'Review & complete'} size="lg" variant={cancelling ? 'danger' : 'primary'} icon="arrow-forward" onPress={review} />
      </Screen>

      <Sheet open={pickAction} onClose={() => setPickAction(false)} title="Action taken">
        {lookups?.action_taken_options.map((a) => (
          <Pressable key={a.id} onPress={() => { set('action_taken_id', String(a.id)); setPickAction(false); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 16, color: String(a.id) === form.action_taken_id ? colors.brand : colors.text }}>{a.name}</Text>
          </Pressable>
        ))}
      </Sheet>
      <UpiSheet open={showQr} onClose={() => setShowQr(false)} amount={collected} note={`Job ${job.crm_call_id}`} branchId={job.branch_id} />
      <SignaturePad
        open={signing}
        defaultName={job.customer?.name}
        onClose={() => setSigning(false)}
        onSave={(png, name) => {
          enqueueSignature(visit.id, png, name);
          setSigning(false);
          setLocal((l) => ({ ...l, signature: '' }));
          toast.success('Signature saved');
        }}
      />
    </>
  );
}

/** One block of the review: an icon, a title, and either details or a tap to go and change it. */
function ReviewCard({ icon, title, right, onEdit, onPress, children }: { icon: IconName; title: string; right?: ReactNode; onEdit?: () => void; onPress?: () => void; children?: ReactNode }) {
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={colors.brand} />
      </View>
      <Text style={{ flex: 1, fontWeight: '700', color: colors.text, fontSize: 15 }}>{title}</Text>
      {right}
      {onEdit && (
        <Pressable onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Edit ${title.toLowerCase()}`}>
          <Icon name="pencil" size={18} color={colors.brand} />
        </Pressable>
      )}
      {onPress && <Icon name="chevron-forward" size={18} color={colors.faint} />}
    </View>
  );
  const body = (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: children ? 10 : 0 }}>
      {head}
      {children && <View style={{ paddingLeft: 42 }}>{children}</View>}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** After closing the visit: what was billed and paid, the invoice, and a message for the customer. */
function Completed({ job, result }: { job: Job; result: Done }) {
  const { user } = useAuth();
  const [opening, setOpening] = useState(false);
  const inv = result.invoice;
  const finished = result.status === 'completed';
  const paid = inv?.paid_amount ?? 0;
  const balance = inv?.balance_amount ?? 0;
  const mode = result.payment ? METHOD_LABEL[result.payment.method] ?? label(result.payment.method) : result.method ? METHOD_LABEL[result.method] ?? label(result.method) : '—';
  const subtitle = !finished
    ? result.status === 'cancelled'
      ? 'The office decides. The job stays open until they do.'
      : 'The job stays with you. Ask the office to approve the next visit from the job screen.'
    : !inv
      ? 'Nothing to bill on this job.'
      : balance <= 0
        ? 'Payment received and the invoice has been generated.'
        : paid > 0
          ? `Invoice generated. ${money(balance)} is still due.`
          : 'Invoice generated. The amount is on the customer’s account.';

  const viewInvoice = async () => {
    if (!inv) return;
    setOpening(true);
    try {
      await openPdf(`/invoices/${inv.id}/pdf`, `invoice-${inv.invoice_number.replace(/[^\w-]/g, '_')}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpening(false);
    }
  };
  const whatsapp = () => {
    const c = job.customer;
    const digits = (c?.phone ?? '').replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    const lines = [
      `Dear ${c?.name ?? 'customer'},`,
      `Your service job ${job.crm_call_id} is complete.`,
      inv && `Invoice ${inv.invoice_number} · Total ${money(inv.total_amount)} · Paid ${money(paid)}${balance > 0 ? ` · Balance ${money(balance)}` : ''}`,
      `Thank you${user?.tenant?.name ? `, ${user.tenant.name}` : ''}.`,
    ].filter(Boolean);
    Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`).catch(() => toast.error('Couldn’t open WhatsApp.'));
  };

  const tone = finished ? { fg: colors.green, bg: colors.greenSoft, icon: 'checkmark' as const } : result.status === 'cancelled' ? { fg: colors.red, bg: colors.redSoft, icon: 'hourglass-outline' as const } : { fg: colors.amber, bg: colors.amberSoft, icon: 'time-outline' as const };

  return (
    <>
      <Stack.Screen options={{ title: job.crm_call_id, headerBackVisible: false, gestureEnabled: false }} />
      <Screen>
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tone.fg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={tone.icon} size={44} color={colors.onBrand} />
            </View>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.heading, textAlign: 'center' }}>
            {finished ? 'Job Completed!' : result.status === 'cancelled' ? 'Cancellation sent' : `Saved as ${label(result.status).toLowerCase()}`}
          </Text>
          <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 15, paddingHorizontal: 12 }}>{subtitle}</Text>
        </View>

        <Card>
          <Row k="Job number" v={job.crm_call_id} strong />
          <Row k="Customer" v={job.customer?.name ?? '—'} strong />
          {inv && (
            <>
              <Row k="Total amount" v={money(inv.total_amount)} strong />
              <Row k="Amount paid" v={money(paid)} strong vStyle={{ color: colors.green }} />
              {balance > 0 && <Row k="Balance due" v={money(balance)} strong vStyle={{ color: colors.amber }} />}
              <Row k="Payment mode" v={mode} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>Invoice number</Text>
                {/* Long-press to copy. */}
                <Text selectable style={{ color: colors.brand, fontWeight: '700', fontSize: 14 }}>
                  {inv.invoice_number}
                </Text>
              </View>
            </>
          )}
        </Card>

        {inv && <Button title="View invoice" size="lg" icon="eye-outline" loading={opening} onPress={viewInvoice} />}
        {finished && !!job.customer?.phone && <Button title="Share via WhatsApp" size="lg" variant="secondary" icon="logo-whatsapp" onPress={whatsapp} />}
        <Button title="Back to jobs" size="lg" variant="secondary" icon="home-outline" onPress={() => router.dismissTo('/jobs')} />
      </Screen>
    </>
  );
}
