import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { useLookups } from '@/lib/hooks';
import { label } from '@/lib/format';
import type { Job } from '@/lib/types';
import { toast } from '@/components/toast';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Detail, LockedTag, brandOf, modelOf, productTypeOf } from '@/components/JobDetails';
import { Button, Card, Field, Icon, Input, Sheet } from '@/components/ui';
import { colors, radius } from '@/components/theme';

export type CallForm = ReturnType<typeof initialCallForm>;

const WARRANTY = ['in_warranty', 'extended', 'amc', 'out_of_warranty'].map((id) => ({ id, name: id === 'amc' ? 'AMC' : label(id) }));

/** The product fields a technician fills in, from the job. The complaint is the office's and isn't sent. */
export function initialCallForm(job: Job) {
  const p = job.customer_product;
  return {
    model_no: modelOf(p) ?? '',
    category_id: String(p?.category?.id ?? p?.product?.category?.id ?? ''),
    brand_id: String(p?.brand?.id ?? p?.product?.brand?.id ?? ''),
    dealer_id: String(p?.dealer?.id ?? ''),
    serial_no: p?.serial_no ?? '',
    outdoor_serial_no: p?.outdoor_serial_no ?? '',
    purchase_date: p?.purchase_date ?? '',
    warranty_type: p?.warranty_type ?? '',
    warranty_expiry: p?.warranty_expiry ?? '',
  };
}

export function callPayload(form: CallForm) {
  return {
    ...form,
    model_no: form.model_no.trim() || null,
    category_id: form.category_id || null,
    brand_id: form.brand_id || null,
    dealer_id: form.dealer_id || null,
    purchase_date: form.purchase_date || null,
    warranty_type: form.warranty_type || null,
    warranty_expiry: form.warranty_expiry || null,
  };
}

/** Checked on the phone first, so the technician sees it before anything is sent. The server checks the same. */
export function checkCallForm(form: CallForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.warranty_type === 'in_warranty' && !form.purchase_date) errors.purchase_date = 'Enter the purchase date: the unit is marked in warranty.';
  if (form.purchase_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.purchase_date)) errors.purchase_date = 'Use the format YYYY-MM-DD.';
  if (form.warranty_expiry && !/^\d{4}-\d{2}-\d{2}$/.test(form.warranty_expiry)) errors.warranty_expiry = 'Use the format YYYY-MM-DD.';
  return errors;
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

function PickerField({ title, value, options, onChange, error, clearable, placeholder = 'Select…', required }: { title: string; value: string; options: { id: number | string; name: string }[] | undefined; onChange: (id: string) => void; error?: string; clearable?: boolean; placeholder?: string; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const name = options?.find((o) => String(o.id) === value)?.name;
  return (
    <Field label={title} error={error} required={required}>
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
function DateInput({ title, value, onChange, error, required, hint }: { title: string; value: string; onChange: (v: string) => void; error?: string; required?: boolean; hint?: string }) {
  const change = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 8);
    onChange([d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join('-'));
  };
  return (
    <Field label={title} error={error} required={required} hint={hint}>
      <Input value={value} keyboardType="number-pad" maxLength={10} placeholder="YYYY-MM-DD" invalid={!!error} onChangeText={change} />
    </Field>
  );
}

/**
 * The unit being serviced. Brand, product type and product category are locked once the office has
 * entered them; anything missing the technician fills in. The model (read off the unit), serials, warranty,
 * purchase date and dealer stay editable.
 */
export function ProductFields({ job, form, set, error, scanHint = 'Scanned.' }: { job: Job; form: CallForm; set: (k: keyof CallForm, v: string) => void; error: (field: string) => string | undefined; scanHint?: string }) {
  const { data: lookups } = useLookups();
  const [adding, setAdding] = useState(false);
  const [scanFor, setScanFor] = useState<'serial_no' | 'outdoor_serial_no' | null>(null);
  const p = job.customer_product;
  // Locked by what's saved on the job, not what's typed: filling a gap doesn't lock it until it's saved.
  const locked = { brand: brandOf(p), type: productTypeOf(p), category: job.product_category ?? null };
  const anyLocked = Object.values(locked).some(Boolean);

  if (!p && !adding) {
    return (
      <Card title="Product">
        {!!locked.category && (
          <View style={{ marginBottom: 12 }}>
            <Detail k="Product category" v={locked.category} locked />
          </View>
        )}
        <Text style={{ color: colors.muted, marginBottom: 10 }}>No product on this job yet.</Text>
        <Button title="Add product details" variant="secondary" icon="add" size="sm" onPress={() => setAdding(true)} />
      </Card>
    );
  }

  return (
    <Card title="Product" right={anyLocked ? <LockedTag text="Locked fields set by office" /> : undefined}>
      <View style={{ gap: 14 }}>
        {anyLocked && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 14, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 12 }}>
            {!!locked.brand && <Detail k="Brand" v={locked.brand} locked />}
            {!!locked.type && <Detail k="Product type" v={locked.type} locked />}
            {!!locked.category && <Detail k="Product category" v={locked.category} locked />}
          </View>
        )}
        {!locked.brand && <PickerField title="Brand" value={form.brand_id} options={lookups?.brands} onChange={(v) => set('brand_id', v)} error={error('brand_id')} />}
        {!locked.type && <PickerField title="Product type" value={form.category_id} options={lookups?.categories} onChange={(v) => set('category_id', v)} error={error('category_id')} />}
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
        <PickerField title="Warranty" value={form.warranty_type} options={WARRANTY} onChange={(v) => set('warranty_type', v)} error={error('warranty_type')} clearable />
        <DateInput
          title="Purchase date"
          value={form.purchase_date}
          onChange={(v) => set('purchase_date', v)}
          error={error('purchase_date')}
          required={form.warranty_type === 'in_warranty'}
          hint={form.warranty_type === 'in_warranty' ? 'Needed for a unit in warranty. See the bill or warranty card.' : undefined}
        />
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
