import { useState } from 'react';
import { api } from '@/lib/api';
import { fieldError, useApiMutation } from '@/lib/hooks';
import { money, toMajor, toMinor } from '@/lib/format';
import { Button, Field, Input, Muted, Segmented, Sheet } from './ui';
import { UpiSheet } from './UpiSheet';

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank' },
] as const;

/** Technician collects (part of) an unpaid balance; cash and cheques go into the daily cash close. */
export function CollectPayment({ invoiceId, due, note, branchId, onClose, onDone }: { invoiceId: number; due: number; note: string; branchId?: number | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ amount: toMajor(due), method: 'cash' as string, reference_no: '' });
  const [showQr, setShowQr] = useState(false);
  const amount = toMinor(form.amount);
  const m = useApiMutation(() => api.post(`/invoices/${invoiceId}/collect`, { amount, method: form.method, reference_no: form.reference_no || null }), {
    invalidate: [['tech-dashboard'], ['my-cash']],
    toastValidation: false,
    onSuccess: onDone,
  });
  const e = (n: string) => fieldError(m.error, n);

  return (
    <>
      <Sheet
        open={!showQr}
        onClose={onClose}
        title="Collect payment"
        footer={
          <>
            <Button title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
            <Button title="Save payment" style={{ flex: 1 }} loading={m.isPending} disabled={!amount} onPress={() => m.mutate(undefined)} />
          </>
        }
      >
        <Muted>Balance due {money(due)}. A receipt number is created automatically.</Muted>
        <Field label="Amount" error={e('amount')}>
          <Input value={form.amount} keyboardType="decimal-pad" onChangeText={(v) => setForm({ ...form, amount: v.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Method" error={e('method')}>
          <Segmented value={form.method} onChange={(v) => setForm({ ...form, method: v, reference_no: '' })} options={METHODS.map((x) => ({ ...x }))} />
        </Field>
        {form.method === 'upi' && <Button title="Show UPI QR to customer" variant="secondary" icon="qr-code-outline" onPress={() => setShowQr(true)} disabled={!amount} />}
        {form.method !== 'cash' && (
          <Field label={form.method === 'cheque' ? 'Cheque number' : form.method === 'upi' ? 'UPI reference (optional)' : 'UTR / reference'} required={form.method !== 'upi'} error={e('reference_no')}>
            <Input value={form.reference_no} autoCapitalize="characters" onChangeText={(v) => setForm({ ...form, reference_no: v })} />
          </Field>
        )}
      </Sheet>
      <UpiSheet open={showQr} onClose={() => setShowQr(false)} amount={amount} note={note} branchId={branchId} />
    </>
  );
}
