import { useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { useLookups } from '@/lib/hooks';
import { date, dateTime, label, schedule } from '@/lib/format';
import type { CustomerProduct, Job, JobImage } from '@/lib/types';
import { Card, Icon, Muted } from '@/components/ui';
import { colors, radius } from '@/components/theme';

const CALL_TYPE: Record<string, string> = { crm_call: 'CRM call', walk_in: 'Walk-in', referral: 'Referral', portal: 'Customer portal' };
const WARRANTY: Record<string, string> = { in_warranty: 'In warranty', extended: 'Extended warranty', amc: 'AMC', out_of_warranty: 'Out of warranty' };

/** The unit's fields as the office's job form names them: brand, product type, model. */
export const brandOf = (p?: CustomerProduct | null) => p?.brand?.name ?? p?.product?.brand?.name ?? null;
export const productTypeOf = (p?: CustomerProduct | null) => p?.category?.name ?? p?.product?.category?.name ?? null;
export const modelOf = (p?: CustomerProduct | null) => p?.model_no || p?.product?.model_name || null;
export const warrantyText = (p?: CustomerProduct | null) => {
  if (!p?.warranty_type) return null;
  const covered = p.under_warranty === undefined || p.warranty_type === 'out_of_warranty' ? '' : p.under_warranty ? ' · covered' : ' · expired';
  return `${WARRANTY[p.warranty_type] ?? label(p.warranty_type)}${covered}`;
};

/** A label and its value, stacked: reads well for long values on a phone. Missing values say so instead of a dash. */
export function Detail({ k, v, locked, wide, children }: { k: string; v?: string | null; locked?: boolean; wide?: boolean; children?: ReactNode }) {
  return (
    <View style={{ flexBasis: wide ? '100%' : '47%', flexGrow: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>{k}</Text>
        {locked && <Icon name="lock-closed" size={11} color={colors.faint} />}
      </View>
      {children ?? <Text style={{ color: v ? colors.text : colors.faint, fontSize: 15, fontWeight: v ? '600' : '400' }}>{v || 'Not recorded'}</Text>}
    </View>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 14 }}>{children}</View>;
}

/** What the customer reported, as the office logged it. Read-only for the technician. */
export function ComplaintCard({ job, title = 'Complaint', note }: { job: Job; title?: string; note?: string }) {
  return (
    <Card title={title} right={<LockedTag />}>
      <View style={{ gap: 14 }}>
        <Grid>
          <Detail k="Service type" v={job.complaint_type?.name} locked />
          <Detail k="Breakdown / complaint" v={job.complaint_summary?.name} locked />
        </Grid>
        <Detail k="Job summary" locked wide>
          <View style={{ backgroundColor: colors.bg, borderRadius: radius.sm, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.brand }}>
            <Text style={{ color: job.complaint_details ? colors.text : colors.faint, fontSize: 15, lineHeight: 21 }}>{job.complaint_details || 'No summary written.'}</Text>
          </View>
        </Detail>
        {note && <Muted style={{ fontSize: 12 }}>{note}</Muted>}
      </View>
    </Card>
  );
}

/** Brand, product type, model, product category, serials, warranty, purchase, dealer: the web job form's product step. */
export function ProductCard({ job }: { job: Job }) {
  const p = job.customer_product;
  if (!p && !job.product_category) {
    return (
      <Card title="Product">
        <Muted>No product on this job yet. Add it on the Check step.</Muted>
      </Card>
    );
  }
  return (
    <Card title="Product">
      <Grid>
        <Detail k="Brand" v={brandOf(p)} />
        <Detail k="Product type" v={productTypeOf(p)} />
        <Detail k="Model" v={modelOf(p)} />
        <Detail k="Product category" v={job.product_category} />
        <Detail k="Serial no." v={p?.serial_no} />
        {!!p?.outdoor_serial_no && <Detail k="Outdoor serial" v={p.outdoor_serial_no} />}
        <Detail k="Warranty" v={warrantyText(p)} />
        <Detail k="Warranty expiry" v={p?.warranty_expiry ? date(p.warranty_expiry) : null} />
        <Detail k="Purchase date" v={p?.purchase_date ? date(p.purchase_date) : null} />
        <Detail k="Dealer" v={p?.dealer?.name} />
      </Grid>
    </Card>
  );
}

/** When, how urgent, how it came in and where: the web job form's visit step. */
export function VisitInfoCard({ job }: { job: Job }) {
  return (
    <Card title="Visit">
      <Grid>
        <Detail k="Visit date & time" v={schedule(job.scheduled_at).text} />
        <Detail k="Priority" v={label(job.priority)} />
        <Detail k="Call type" v={CALL_TYPE[job.call_type] ?? label(job.call_type)} />
        <Detail k="Service location" v={job.service_location?.name} />
        {!!job.branch?.name && <Detail k="Branch" v={job.branch.name} />}
        <Detail k="Job / CRM call ID" v={job.crm_call_id} />
        <Detail k="Logged" v={dateTime(job.created_at)} />
        {!!job.customer_satisfaction_code && <Detail k="Satisfaction code" v={job.customer_satisfaction_code} />}
      </Grid>
    </Card>
  );
}

export function LockedTag({ text = 'Set by office' }: { text?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Icon name="lock-closed" size={11} color={colors.muted} />
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export const thumb = { width: 84, height: 84, borderRadius: 8, backgroundColor: colors.border };

/** A photo that opens full screen when tapped. */
export function PhotoThumb({ image, size = 84, onLongPress, faded }: { image: Pick<JobImage, 'url'>; size?: number; onLongPress?: () => void; faded?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} onLongPress={onLongPress} accessibilityRole="imagebutton" accessibilityLabel="Open photo">
        <Image source={{ uri: image.url }} style={[thumb, { width: size, height: size }, faded && { opacity: 0.85 }]} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Close photo">
          <Image source={{ uri: image.url }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          <Text style={{ color: '#fff', marginTop: 12 }}>Tap to close</Text>
        </Pressable>
      </Modal>
    </>
  );
}

/** Photos from earlier visits on this job, by section: kept, so a return visit starts from what was found. */
export function EarlierPhotos({ job, exceptVisitId, title = 'Photos from earlier visits' }: { job: Job; exceptVisitId?: number; title?: string }) {
  const { data: lookups } = useLookups();
  const photos = (job.images ?? []).filter((i) => i.type !== 'signature' && i.job_visit_id !== exceptVisitId);
  if (!photos.length) return null;
  const name = (t: string) => lookups?.photo_types?.find((s) => s.key === t)?.label ?? lookups?.photo_labels?.[t] ?? label(t);
  const groups = [...new Set(photos.map((p) => p.type))];
  return (
    <Card title={title} right={<Muted>{photos.length}</Muted>}>
      <View style={{ gap: 12 }}>
        {groups.map((g) => (
          <View key={g} style={{ gap: 6 }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>{name(g)}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {photos.filter((p) => p.type === g).map((p) => (
                <PhotoThumb key={p.id} image={p} size={72} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}
