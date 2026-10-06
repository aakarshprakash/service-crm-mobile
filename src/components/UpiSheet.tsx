import { useState } from 'react';
import { Linking, Pressable, Share, Text, View } from 'react-native';
import { useLookups } from '@/lib/hooks';
import { money } from '@/lib/format';
import { pickUpiAccount, upiLink } from '@/lib/upi';
import { QrCode } from './QrCode';
import { colors } from './theme';
import { Button, Loading, Muted, Sheet } from './ui';

/**
 * Full-screen-ish QR the customer scans with any UPI app. The technician then records
 * the payment as UPI with the transaction reference from the customer's app.
 */
export function UpiSheet({ open, onClose, amount, note, branchId }: { open: boolean; onClose: () => void; amount: number; note: string; branchId?: number | null }) {
  const { data, isLoading } = useLookups();
  const accounts = data?.upi_accounts ?? [];
  const [accountId, setAccountId] = useState<number | null>(null);
  const account = accounts.find((a) => a.id === accountId) ?? pickUpiAccount(accounts, branchId);
  const link = account ? upiLink(account, amount, note) : '';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Customer scans to pay"
      footer={
        account ? (
          <>
            <Button title="Share" variant="secondary" icon="share-social-outline" style={{ flex: 1 }} onPress={() => Share.share({ message: `Pay ${money(amount)} to ${account.payee_name} (${account.vpa}): ${link}` })} />
            <Button title="Done" style={{ flex: 1 }} onPress={onClose} />
          </>
        ) : undefined
      }
    >
      {isLoading ? (
        <Loading />
      ) : !account ? (
        <Muted>No UPI ID is set up. Ask the office to add one in Settings → Master data → UPI accounts.</Muted>
      ) : (
        <>
          {accounts.length > 1 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {accounts.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => setAccountId(a.id)}
                  style={{ borderWidth: 1, borderColor: a.id === account.id ? colors.brand : colors.border, backgroundColor: a.id === account.id ? colors.brandSoft : '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
                >
                  <Text style={{ color: a.id === account.id ? colors.brand : colors.muted, fontWeight: '600', fontSize: 13 }}>{a.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <QrCode value={link} size={260} />
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>{money(amount)}</Text>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{account.payee_name}</Text>
            <Text style={{ color: colors.muted, fontFamily: 'monospace' }}>{account.vpa}</Text>
          </View>
          <Muted style={{ textAlign: 'center' }}>Wait until the customer’s app shows “Payment successful”, then enter the UPI reference number.</Muted>
          <Button title="Pay from this phone" variant="ghost" size="sm" onPress={() => Linking.openURL(link).catch(() => undefined)} />
        </>
      )}
    </Sheet>
  );
}
