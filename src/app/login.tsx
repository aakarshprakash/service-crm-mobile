import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Field, Icon, Input, Muted } from '@/components/ui';
import { colors } from '@/components/theme';

/** Sign in with email or mobile number + password (Sanctum token for the app). */
export default function Login() {
  const { login, server, changeServer } = useAuth();
  const [form, setForm] = useState({ login: '', password: '', company: '' });
  const [showCompany, setShowCompany] = useState(false);
  const [editingServer, setEditingServer] = useState(false);
  const [serverValue, setServerValue] = useState(server);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [secure, setSecure] = useState(true);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editingServer && serverValue !== server) await changeServer(serverValue);
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Image source={require('../../assets/splash-icon.png')} style={{ width: 88, height: 88 }} accessibilityLabel="Servon" />
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>Servon</Text>
            <Muted>Technician app · sign in to see your jobs</Muted>
          </View>

          <View style={{ gap: 14, backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.border }}>
            <Field label="Email or mobile number" error={error?.field('login')}>
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
            {error && !Object.keys(error.errors).length && <Text style={{ color: colors.red }}>{error.message}</Text>}
            <Button title="Sign in" size="lg" loading={busy} disabled={!form.login || !form.password} onPress={submit} />
          </View>

          <View style={{ alignItems: 'center', gap: 8 }}>
            {editingServer ? (
              <View style={{ alignSelf: 'stretch', gap: 6 }}>
                <Field label="Server" hint="The address your office gave you, e.g. https://api.yourcompany.com">
                  <Input value={serverValue} onChangeText={setServerValue} autoCapitalize="none" keyboardType="url" />
                </Field>
              </View>
            ) : (
              <Pressable onPress={() => setEditingServer(true)} hitSlop={8}>
                <Muted>Server: {server.replace(/^https?:\/\//, '')} · Change</Muted>
              </Pressable>
            )}
            <Muted style={{ fontSize: 11 }}>v{Constants.expoConfig?.version}</Muted>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
