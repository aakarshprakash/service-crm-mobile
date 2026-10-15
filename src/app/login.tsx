import { useState } from 'react';
import { Image, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Field, Icon, Input, Muted } from '@/components/ui';
import { colors } from '@/components/theme';

/** Sign in with email or mobile number + password (Sanctum token for the app). */
export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ login: '', password: '', company: '' });
  const [showCompany, setShowCompany] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [secure, setSecure] = useState(true);
  // The API reports bad credentials on "email" (web form name) or "login".
  const loginError = error?.field('login') ?? error?.field('email');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(form.login, form.password, form.company);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, (e as Error).message);
      setError(err);
      if (err.field('company')) setShowCompany(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Android draws edge to edge, so the window no longer shrinks for the keyboard: pad on both platforms. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Image source={require('../../assets/logo-mark.png')} style={{ width: 64, height: 64 }} resizeMode="contain" accessibilityLabel="Servon" />
            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.heading, letterSpacing: 1 }}>SERVON</Text>
            <Muted>Technician app · sign in to see your jobs</Muted>
          </View>

          <View style={{ gap: 14, backgroundColor: colors.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.border }}>
            <Field label="Email or mobile number" error={loginError}>
              <Input value={form.login} onChangeText={(v) => setForm({ ...form, login: v })} autoCapitalize="none" autoComplete="username" keyboardType="email-address" textContentType="username" placeholder="ravi@company.com or 98765 43210" />
            </Field>
            <Field label="Password" error={error?.field('password')}>
              <View>
                <Input value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry={secure} autoComplete="password" textContentType="password" onSubmitEditing={submit} style={{ paddingRight: 48 }} />
                <Pressable onPress={() => setSecure((s) => !s)} hitSlop={10} style={{ position: 'absolute', right: 12, top: 12 }} accessibilityLabel={secure ? 'Show password' : 'Hide password'}>
                  <Icon name={secure ? 'eye-outline' : 'eye-off-outline'} color={colors.muted} />
                </Pressable>
              </View>
            </Field>
            {showCompany && (
              <Field label="Company code" error={error?.field('company')} hint="Ask your office – it’s the name in your company’s portal link.">
                <Input value={form.company} onChangeText={(v) => setForm({ ...form, company: v })} autoCapitalize="none" />
              </Field>
            )}
            {error && !loginError && !error.field('password') && !error.field('company') && <Text style={{ color: colors.red }}>{error.message}</Text>}
            <Button title="Sign in" size="lg" loading={busy} disabled={!form.login || !form.password} onPress={submit} />
          </View>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Muted style={{ fontSize: 12 }}>Service Business, Simplified.</Muted>
            <Muted style={{ fontSize: 11 }}>v{Constants.expoConfig?.version} · Powered by <Text style={{ fontWeight: '700', letterSpacing: 1.5 }}>SYSNAC</Text></Muted>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
