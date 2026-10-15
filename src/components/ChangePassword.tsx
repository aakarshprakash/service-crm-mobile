import { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Text } from '@/components/Text';
import { toast } from '@/components/toast';
import { Button, Card, Field, Icon, Input, Muted, Screen } from '@/components/ui';
import { colors } from '@/components/theme';

/** Current + new password. Other phones and browsers are signed out by the server. */
export function ChangePasswordForm({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const { refresh } = useAuth();
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put('/auth/password', pw);
      await refresh();
      toast.success(forced ? 'Password changed. Welcome!' : 'Password changed. Your other devices were signed out.');
      setPw({ current_password: '', password: '', password_confirmation: '' });
      onDone();
    } catch (e) {
      if (e instanceof ApiError) setError(e);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Field label={forced ? 'Temporary password' : 'Current password'} error={error?.field('current_password')}>
        <Input secureTextEntry autoComplete="current-password" value={pw.current_password} onChangeText={(v) => setPw({ ...pw, current_password: v })} />
      </Field>
      <Field label="New password" error={error?.field('password')} hint="8+ characters with upper and lower case letters and a number.">
        <Input secureTextEntry autoComplete="new-password" value={pw.password} onChangeText={(v) => setPw({ ...pw, password: v })} />
      </Field>
      <Field label="Confirm new password">
        <Input secureTextEntry autoComplete="new-password" value={pw.password_confirmation} onChangeText={(v) => setPw({ ...pw, password_confirmation: v })} />
      </Field>
      <Button title={forced ? 'Save and continue' : 'Change password'} icon="key-outline" loading={busy} disabled={!pw.current_password || !pw.password} onPress={save} />
    </View>
  );
}

/** Shown instead of the app after signing in with a temporary password from the office. */
export function ForcePasswordChange() {
  const { user, logout } = useAuth();
  return (
    <Screen headerless>
      <View style={{ alignItems: 'center', gap: 10, marginTop: 24 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="key" size={30} color={colors.brand} />
        </View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.heading, textAlign: 'center' }}>Choose your own password</Text>
        <Muted style={{ textAlign: 'center' }}>Hi {user?.name}. The office gave you a temporary password. Replace it to start using the app.</Muted>
      </View>
      <Card>
        <ChangePasswordForm forced onDone={() => undefined} />
      </Card>
      <Button title="Sign out" variant="ghost" onPress={logout} />
    </Screen>
  );
}
