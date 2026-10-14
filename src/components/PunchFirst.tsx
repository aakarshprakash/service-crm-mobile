import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/components/Text';
import { useAuth } from '@/lib/auth';
import { punch, punchRuleText, useTechDashboard } from '@/lib/punch';
import { toast } from '@/components/toast';
import { Button, Icon, Muted, Sheet } from '@/components/ui';
import { colors } from '@/components/theme';

/** "Punch in first": shown when an off-duty technician tries to start a service. Carries on once punched in. */
export function PunchFirst({ open, onClose, onPunched }: { open: boolean; onClose: () => void; onPunched: () => void }) {
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const rules = useTechDashboard().data?.attendance;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await punch('in', qc, refresh);
      (r.outside ? toast.info : toast.success)(r.message);
      onPunched();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Punch in first"
      footer={
        <>
          <Button title="Not now" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
          <Button title={error ? 'Try again' : 'Punch in & continue'} variant="success" icon="finger-print-outline" style={{ flex: 1.4 }} loading={busy} onPress={go} />
        </>
      }
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="time-outline" size={24} color={colors.amber} />
        </View>
        <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>You’re off duty. Punch in to start this service; your day starts now.</Text>
      </View>
      <Muted>{punchRuleText(rules)}</Muted>
      {error && (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.redSoft, borderRadius: 10, padding: 12 }}>
          <Icon name="alert-circle-outline" color={colors.red} />
          <Text style={{ flex: 1, color: colors.red }}>{error}</Text>
        </View>
      )}
    </Sheet>
  );
}
