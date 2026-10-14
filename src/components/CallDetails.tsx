import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { useLookups } from '@/lib/hooks';
import type { Job } from '@/lib/types';
import { toast } from '@/components/toast';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Field, Icon, Input, Segmented, Sheet } from '@/components/ui';
import { colors, radius } from '@/components/theme';

export type CallForm = ReturnType<typeof initialCallForm>;

/** The job, customer and product fields a technician can correct, filled from the job. */
export function initialCallForm(job: Job) {
  const c = job.customer;
  return {
    complaint_type_id: String(job.complaint_type_id ?? ''),
    complaint_details: job.complaint_details ?? '',
    priority: job.priority as string,
    address: c?.address ?? '',
    city: c?.city ?? '',
    pincode: c?.pincode ?? '',
    alt_phone: c?.alt_phone ?? '',
    serial_no: job.customer_product?.serial_no ?? '',
    outdoor_serial_no: job.customer_product?.outdoor_serial_no ?? '',
  };
}

export function callPayload(form: CallForm) {
  return { ...form, complaint_type_id: form.complaint_type_id || null, alt_phone: form.alt_phone || null };
}

/**
 * Complaint, address, alternate phone and serial numbers (typed or scanned).
 * Used on "Check details" before a visit starts and on the visit's Call tab.
 */
export function CallDetailsFields({
  form, set, error, hasProduct, scanHint = 'Scanned.',
}: { form: CallForm; set: (k: keyof CallForm, v: string) => void; error: (field: string) => string | undefined; hasProduct: boolean; scanHint?: string }) {
  const { data: lookups } = useLookups();
  const [pickType, setPickType] = useState(false);
  const [scanFor, setScanFor] = useState<'serial_no' | 'outdoor_serial_no' | null>(null);
  const typeName = lookups?.complaint_types.find((t) => String(t.id) === form.complaint_type_id)?.name;

  return (
    <>
      <Field label="Complaint type">
        <Pressable onPress={() => setPickType(true)} style={{ borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.sm + 2, height: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card }}>
          <Text style={{ color: typeName ? colors.text : colors.faint, fontSize: 16 }}>{typeName ?? 'Select…'}</Text>
          <Icon name="chevron-down" size={18} color={colors.faint} />
        </Pressable>
      </Field>
      <Field label="Complaint details" error={error('complaint_details')}>
        <Input multiline value={form.complaint_details} onChangeText={(v) => set('complaint_details', v)} placeholder="What does the customer report?" />
      </Field>
      <Field label="Priority">
        <Segmented value={form.priority} onChange={(v) => set('priority', v)} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
      </Field>
      <Field label="Address" error={error('address')}>
        <Input multiline value={form.address} onChangeText={(v) => set('address', v)} />
      </Field>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="City / area">
            <Input value={form.city} onChangeText={(v) => set('city', v)} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="PIN code" error={error('pincode')}>
            <Input value={form.pincode} keyboardType="number-pad" onChangeText={(v) => set('pincode', v)} />
          </Field>
        </View>
      </View>
      <Field label="Alternate phone" error={error('alt_phone')}>
        <Input value={form.alt_phone} keyboardType="phone-pad" onChangeText={(v) => set('alt_phone', v)} />
      </Field>
      {hasProduct ? (
        ([['serial_no', 'Serial no.'], ['outdoor_serial_no', 'Outdoor unit serial']] as const).map(([key, title]) => (
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
        ))
      ) : (
        <Text style={{ color: colors.muted, fontSize: 13 }}>No product on this job, so there is no serial number to record. Ask the office to add the product.</Text>
      )}

      <BarcodeScanner
        open={!!scanFor}
        title={scanFor === 'outdoor_serial_no' ? 'Scan outdoor serial' : 'Scan serial number'}
        onClose={() => setScanFor(null)}
        onScanned={(value) => {
          if (scanFor) set(scanFor, value);
          toast.info(scanHint);
        }}
      />
      <Sheet open={pickType} onClose={() => setPickType(false)} title="Complaint type">
        {lookups?.complaint_types.map((t) => (
          <Pressable key={t.id} onPress={() => { set('complaint_type_id', String(t.id)); setPickType(false); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 16, color: String(t.id) === form.complaint_type_id ? colors.brand : colors.text }}>{t.name}</Text>
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}
