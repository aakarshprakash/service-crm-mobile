import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/Text';
import { openPdf } from '@/lib/api';
import { dateTime, label, METHOD_LABEL, money } from '@/lib/format';
import type { Invoice } from '@/lib/types';
import { toast } from '@/components/toast';
import { Badge, Button, Card, Muted, Row } from '@/components/ui';
import { colors } from '@/components/theme';

/** The job's bill: GST or non-GST, the tax split, what was collected, and the invoice itself. */
export function BillSummary({ invoice: inv, children }: { invoice: Invoice; children?: ReactNode }) {
  const [opening, setOpening] = useState(false);
  const view = async () => {
    setOpening(true);
    try {
      await openPdf(`/invoices/${inv.id}/pdf`, `invoice-${inv.invoice_number.replace(/[^\w-]/g, '_')}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpening(false);
    }
  };
  return (
    <Card title="Bill" right={<Badge text={inv.is_gst ? 'GST bill' : 'Non-GST bill'} tone={inv.is_gst ? 'verified' : 'cancelled'} />}>
      <Row k="Invoice" v={inv.invoice_number} />
      {!!inv.is_gst && (
        <>
          <Row k="Taxable value" v={money(inv.taxable_amount)} />
          {!!inv.cgst_amount && <Row k="CGST" v={money(inv.cgst_amount)} />}
          {!!inv.sgst_amount && <Row k="SGST" v={money(inv.sgst_amount)} />}
          {!!inv.igst_amount && <Row k="IGST" v={money(inv.igst_amount)} />}
        </>
      )}
      <Row k="Total" v={money(inv.total_amount)} strong />
      <Row k="Paid" v={money(inv.paid_amount)} />
      <Row k="Balance" v={money(inv.balance_amount)} strong vStyle={inv.balance_amount > 0 ? { color: colors.red } : undefined} />
      {!!inv.payments?.length && (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}>
          <Text style={{ fontWeight: '700', color: colors.text, fontSize: 13 }}>Collected on this job</Text>
          {inv.payments.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Muted style={{ flex: 1 }}>
                {METHOD_LABEL[p.method] ?? label(p.method)}
                {p.receipt_number ? ` · ${p.receipt_number}` : ''}
                {p.paid_at ? ` · ${dateTime(p.paid_at)}` : ''}
              </Muted>
              <Text style={{ fontWeight: '600', color: colors.text }}>{money(p.amount)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ gap: 8, marginTop: 12 }}>
        <Button title="View / share invoice" variant="secondary" size="sm" icon="document-text-outline" loading={opening} onPress={view} />
        {children}
      </View>
    </Card>
  );
}
