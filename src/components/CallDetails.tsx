import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { useLookups } from '@/lib/hooks';
import { label } from '@/lib/format';
import type { Job } from '@/lib/types';
import { toast } from '@/components/toast';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Button, Card, Field, Icon, Input, Segmented, Sheet } from '@/components/ui';
import { colors, radius } from '@/components/theme';

export type CallForm = ReturnType<typeof initialCallForm>;

const WARRANTY = ['in_warranty', 'extended', 'amc', 'out_of_warranty'].map((id) => ({ id, name: id === 'amc' ? 'AMC' : label(id) }));

/** The job and product fields a technician can correct, filled from the job. */
export function initialCallForm(job: Job) {
  const p = job.customer_product;
  return {
    complaint_type_id: String(job.complaint_type_id ?? ''),
    complaint_details: job.complaint_details ?? '',
    priority: job.priority as string,
    model_no: p?.model_no ?? p?.product?.model_name ?? '',
    category_id: String(p?.category?.id ?? p?.product?.category?.id ?? ''),
    brand_id: String(p?.brand?.id ?? p?.product?.brand?.id ?? ''),
    dealer_id: String(p?.dealer?.id ?? ''),
    serial_no: p?.serial_no ?? '',
    outdoor_serial_no: p?.outdoor_serial_no ?? '',
    purchase_date: p?.purchase_date ?? '',
    warranty_type: p?.warranty_type ?? '',
    warranty_expiry: p?.warranty_expiry ?? '',
    customer_satisfaction_code: job.customer_satisfaction_code ?? '',
  };
}

export function callPayload(form: CallForm) {
  return {
    ...form,
    complaint_type_id: form.complaint_type_id || null,
    model_no: form.model_no.trim() || null,
    category_id: form.category_id || null,
    brand_id: form.brand_id || null,
    dealer_id: form.dealer_id || null,
    purchase_date: form.purchase_date || null,
    warranty_type: form.warranty_type || null,
    warranty_expiry: form.warranty_expiry || null,
    customer_satisfaction_code: form.customer_satisfaction_code.trim() || null,
  };
}

function ModelInput({ value, onChange, brandId, error }: { value: string; onChange: (v: string) => void; brandId?: string; error?: string }) {
  const { data: lookups } = useLookups();
  const typed = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    const all = lookups?.model_suggestions ?? [];
    const sameBrand = all.filter((m) => brandId && String(m.brand_id) === brandId);
    return [...new Set([...sameBrand, ...all].map((m) => m.model_no))]
      .filter((m) => m.toLowerCase() !== typed && m.toLowerCase().includes(typed))
      .slice(0, 5);
  }, [lookups, brandId, typed]);
  return (
    <Field label="Model" error={error} hint="Type it as shown on the unit.">
      <Input value={value} autoCapitalize="characters" autoCorrect={false} maxLength={150} onChangeText={onChange} placeholder="e.g. GLS18I5FWBEV" />
      {suggestions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {suggestions.map((m) => (
            <Pressable key={m} onPress={() => onChange(m)} accessibilityRole="button" accessibilityLabel={`Use model ${m}`} style={{ backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{m}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Field>
  );
}

function PickerField({ title, value, options, onChange, error, clearable, placeholder = 'Select…' }: { title: string; value: string; options: { id: number | string; name: string }[] | undefined; onChange: (id: string) => void; error?: string; clearable?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const name = options?.find((o) => String(o.id) === value)?.name;
  return (
    <Field label={title} error={error}>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={title} style={{ borderWidth: 1, borderColor: error ? colors.red : colors.inputBorder, borderRadius: radius.sm + 2, height: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card }}>
        <Text style={{ color: name ? colors.text : colors.faint, fontSize: 16 }}>{name ?? placeholder}</Text>
        <Icon name="chevron-down" size={18} color={colors.faint} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        {clearable && value !== '' && (
          <Pressable onPress={() => { onChange(''); setOpen(false); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 16, color: colors.muted }}>Clear</Text>
          </Pressable>
        )}
        {options?.map((o) => (
          <Pressable key={o.id} onPress={() => { onChange(String(o.id)); setOpen(false); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 16, color: String(o.id) === value ? colors.brand : colors.text }}>{o.name}</Text>
          </Pressable>
        ))}
      </Sheet>
    </Field>
  );
}


/** YYYY-MM-DD typed as digits, the same way as the leave form's dates. */
function DateInput({ title, value, onChange, error }: { title: string; value: string; onChange: (v: string) => void; error?: string }) {
  const change = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 8);
    onChange([d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join('-'));
  };
  return (
    <Field label={title} error={error}>
      <Input value={value} keyboardType="number-pad" maxLength={10} placeholder="YYYY-MM-DD" onChangeText={change} />
    </Field>
  );
}

/** Complaint type, the job's summary and priority. */
export function ComplaintFields({ form, set, error }: { form: CallForm; set: (k: keyof CallForm, v: string) => void; error: (field: string) => string | undefined }) {
  const { data: lookups } = useLookups();
  return (
    <Card title="Complaint">
      <View style={{ gap: 14 }}>
        <PickerField title="Complaint type" value={form.complaint_type_id} options={lookups?.complaint_types} onChange={(v) => set('complaint_type_id', v)} error={error('complaint_type_id')} />
        <Field label="Job summary" error={error('complaint_details')}>
          <Input multiline value={form.complaint_details} onChangeText={(v) => set('complaint_details', v)} placeholder="What does the customer report?" />
        </Field>
        <Field label="Priority">
          <Segmented value={form.priority} onChange={(v) => set('priority', v)} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
        </Field>
      </View>
    </Card>
  );
}

/** The unit being serviced. No product on the job yet: the technician adds what's in front of them. */
export function ProductFields({ job, form, set, error, scanHint = 'Scanned.' }: { job: Job; form: CallForm; set: (k: keyof CallForm, v: string) => void; error: (field: string) => string | undefined; scanHint?: string }) {
  const { data: lookups } = useLookups();
  const [adding, setAdding] = useState(false);
  const [scanFor, setScanFor] = useState<'serial_no' | 'outdoor_serial_no' | null>(null);

  if (!job.customer_product && !adding) {
    return (
      <Card title="Product">
        <Text style={{ color: colors.muted, marginBottom: 10 }}>No product on this job yet.</Text>
        <Button title="Add product details" variant="secondary" icon="add" size="sm" onPress={() => setAdding(true)} />
      </Card>
    );
  }

  return (
    <Card title="Product">
      <View style={{ gap: 14 }}>
        {/* The office may have typed a category that isn't on the list: show it until the technician picks one. */}
        <PickerField title="Category" value={form.category_id} options={lookups?.categories} onChange={(v) => set('category_id', v)} error={error('category_id')} placeholder={job.product_category ?? 'Select…'} />
        <PickerField title="Brand" value={form.brand_id} options={lookups?.brands} onChange={(v) => set('brand_id', v)} error={error('brand_id')} />
        <ModelInput value={form.model_no} onChange={(v) => set('model_no', v)} brandId={form.brand_id} error={error('model_no')} />
        {([['serial_no', 'Serial no.'], ['outdoor_serial_no', 'Outdoor unit serial']] as const).map(([key, title]) => (
          <Field key={key} label={title} error={error(key)}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Input value={form[key]} autoCapitalize="characters" onChangeText={(v) => set(key, v)} style={{ flex: 1 }} placeholder="Type or scan" />
              <Pressable
                onPress={() => setScanFor(key)}
                accessibilityRole="button"
                accessibilityLabel={`Scan ${title}`}
                style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 12, backgroundColor: pressed ? colors.brandDark : colors.brand, alignItems: 'center', justifyContent: 'center' })}
              >
                <Icon name="barcode-outline" size={24} color={colors.onBrand} />
              </Pressable>
            </View>
          </Field>
        ))}
        <DateInput title="Purchase date" value={form.purchase_date} onChange={(v) => set('purchase_date', v)} error={error('purchase_date')} />
        <PickerField title="Warranty" value={form.warranty_type} options={WARRANTY} onChange={(v) => set('warranty_type', v)} error={error('warranty_type')} clearable />
        <DateInput title="Warranty expiry" value={form.warranty_expiry} onChange={(v) => set('warranty_expiry', v)} error={error('warranty_expiry')} />
        <PickerField title="Dealer" value={form.dealer_id} options={lookups?.dealers} onChange={(v) => set('dealer_id', v)} error={error('dealer_id')} clearable />
      </View>
      <BarcodeScanner
        open={!!scanFor}
        title={scanFor === 'outdoor_serial_no' ? 'Scan outdoor serial' : 'Scan serial number'}
        onClose={() => setScanFor(null)}
        onScanned={(value) => {
          if (scanFor) set(scanFor, value);
          toast.info(scanHint);
        }}
      />
    </Card>
  );
}
