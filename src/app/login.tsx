import { useState, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Pressable, ScrollView, View, type TextInputProps } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/toast';
import { Button, Field, Icon, Input, Muted, Sheet, type IconName } from '@/components/ui';
import { colors } from '@/components/theme';

/** Sign in with email + password (Sanctum token for the app). */
export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ login: '', password: '', company: '' });
  const [showCompany, setShowCompany] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [secure, setSecure] = useState(true);
  const [forgot, setForgot] = useState(false);
  const insets = useSafeAreaInsets();
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

  const email = form.login.trim();
  const canSubmit = email.includes('@') && !!form.password;

  return (
    <View style={{ flex: 1, backgroundColor: colors.navy }}>
      {/* The navy header runs under the status bar, so its icons are light while this screen is open. */}
      <StatusBar style="light" />
      {/* Android draws edge to edge, so the window no longer shrinks for the keyboard: pad on both platforms. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={{ paddingTop: insets.top + 44, paddingBottom: 64, paddingHorizontal: 28, gap: 18 }}>
            <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Image source={require('../../assets/logo-mark.png')} style={{ width: 40, height: 40 }} resizeMode="contain" accessibilityLabel="Servon" />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: colors.onBrand, letterSpacing: 2 }}>SERVON</Text>
              <Text style={{ fontSize: 16, color: colors.onBrand, opacity: 0.75 }}>Technician app</Text>
            </View>
          </View>

          <View style={{ flex: 1, marginTop: -28, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 30, paddingBottom: insets.bottom + 20, gap: 18 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.heading }}>Sign in</Text>
              <Muted style={{ fontSize: 14 }}>Use the email and password your office gave you.</Muted>
            </View>

            <Field label="Email" error={loginError}>
              <IconInput
                icon="mail-outline"
                invalid={!!loginError}
                value={form.login}
                onChangeText={(v) => setForm({ ...form, login: v })}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                returnKeyType="next"
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Password" error={error?.field('password')}>
              <IconInput
                icon="lock-closed-outline"
                invalid={!!error?.field('password')}
                value={form.password}
                onChangeText={(v) => setForm({ ...form, password: v })}
                secureTextEntry={secure}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => canSubmit && submit()}
                placeholder="Your password"
                right={
                  <Pressable onPress={() => setSecure((s) => !s)} hitSlop={12} accessibilityRole="button" accessibilityLabel={secure ? 'Show password' : 'Hide password'}>
                    <Icon name={secure ? 'eye-outline' : 'eye-off-outline'} color={colors.muted} />
                  </Pressable>
                }
              />
            </Field>
            {showCompany && (
              <Field label="Company code" error={error?.field('company')} hint="Ask your office: it’s the name in your company’s portal link.">
                <IconInput icon="business-outline" value={form.company} onChangeText={(v) => setForm({ ...form, company: v })} autoCapitalize="none" autoCorrect={false} />
              </Field>
            )}
            {error && !loginError && !error.field('password') && !error.field('company') && (
              <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.redSoft, borderRadius: 12, padding: 12 }}>
                <Icon name="alert-circle" size={18} color={colors.red} />
                <Text style={{ color: colors.red, flex: 1 }}>{error.message}</Text>
              </View>
            )}

            <View style={{ gap: 6, marginTop: 4 }}>
              <Button title="Sign in" size="lg" loading={busy} disabled={!canSubmit} onPress={submit} />
              <Button title="Forgot password?" variant="ghost" size="sm" onPress={() => setForgot(true)} />
            </View>

            <View style={{ flex: 1 }} />
            <Muted style={{ fontSize: 11, textAlign: 'center' }}>
              v{Constants.expoConfig?.version} · Powered by <Text style={{ fontWeight: '700', letterSpacing: 1.5, fontSize: 11 }}>SYSNAC</Text>
            </Muted>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {forgot && <ForgotPassword onClose={() => setForgot(false)} initialEmail={email.includes('@') ? email : ''} />}
    </View>
  );
}

/** A text box with an icon at its start, and optionally a control at its end (show password). */
function IconInput({ icon, right, invalid, style, ...props }: TextInputProps & { icon: IconName; right?: ReactNode; invalid?: boolean }) {
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input {...props} invalid={invalid} style={[{ height: 52, paddingLeft: 46, paddingRight: right ? 48 : 14, backgroundColor: colors.card }, style]} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 14 }}>
        <Icon name={icon} size={20} color={invalid ? colors.red : colors.faint} />
      </View>
      {right && <View style={{ position: 'absolute', right: 14 }}>{right}</View>}
    </View>
  );
}

/** Most technicians get a temporary password from the office; a reset email only helps with a real mailbox. */
function ForgotPassword({ onClose, initialEmail }: { onClose: () => void; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      toast.success('If that email is on an account, a reset link is on its way.');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Forgot password?">
      <Text style={{ fontWeight: '700', color: colors.text }}>Ask your office</Text>
      <Muted>They can reset it and give you a temporary password. Sign in with that, and the app asks you to set a new one straight away.</Muted>
      <Text style={{ fontWeight: '700', color: colors.text, marginTop: 8 }}>Or get a link by email</Text>
      <Field label="Your email">
        <Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      </Field>
      <Button title="Send reset link" variant="secondary" loading={busy} disabled={!email.includes('@')} onPress={send} />
    </Sheet>
  );
}
