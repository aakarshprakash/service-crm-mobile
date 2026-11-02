import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Modal, View } from 'react-native';
import { Text } from '@/components/Text';
import { useAuth } from '@/lib/auth';
import { authenticate, biometricAvailable, biometricEnabledFor, isUnlocked, rememberAskedAboutBiometric, setBiometricFor, setUnlocked, wasAskedAboutBiometric, wasPasswordSignIn } from '@/lib/biometric';
import { Button } from '@/components/ui';
import { colors } from '@/components/theme';

/** Away this long and the app asks for the fingerprint again. Short trips to the camera or dialler don't count. */
const RELOCK_AFTER_MS = 5 * 60_000;

/**
 * Fingerprint / face sign-in. Over the app rather than instead of it, so a half-filled visit form survives.
 * The saved session does the signing in: a reset password or a sign-out by the office ends it, and the
 * next sign-in needs the password again.
 */
export function AppLock() {
  const { user, logout } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<'checking' | 'locked' | 'open'>(() => (isUnlocked() ? 'open' : 'checking'));
  const [busy, setBusy] = useState(false);
  const leftAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    setBusy(true);
    const ok = await authenticate();
    setBusy(false);
    if (ok) {
      setUnlocked(true);
      setState('open');
    }
  }, []);

  useEffect(() => {
    if (!userId || state !== 'checking') return;
    biometricEnabledFor(userId).then((on) => {
      setUnlocked(!on);
      setState(on ? 'locked' : 'open');
    });
  }, [userId, state]);

  useEffect(() => {
    if (state === 'locked') void unlock();
  }, [state, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        leftAt.current = Date.now();
      } else if (next === 'active' && leftAt.current && userId) {
        const away = Date.now() - leftAt.current;
        leftAt.current = null;
        if (away >= RELOCK_AFTER_MS) {
          biometricEnabledFor(userId).then((on) => {
            if (!on) return;
            setUnlocked(false);
            setState('locked');
          });
        }
      }
    });
    return () => sub.remove();
  }, [userId]);

  // Once per person, after they're in: offer it instead of hiding it in a settings screen.
  useEffect(() => {
    if (!userId || state !== 'open' || !wasPasswordSignIn()) return;
    (async () => {
      if ((await wasAskedAboutBiometric(userId)) || (await biometricEnabledFor(userId)) || !(await biometricAvailable())) return;
      await rememberAskedAboutBiometric(userId);
      Alert.alert('Sign in with your fingerprint?', 'Open the app with your fingerprint or face instead of typing your password. You can change this under Me → Security.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Turn on', onPress: async () => { if (await authenticate('Confirm it’s you')) await setBiometricFor(userId); } },
      ]);
    })();
  }, [userId, state]);

  if (state === 'open') return null;
  return (
    <Modal visible transparent={false} animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => undefined}>
      {/* A modal window can't set dark status bar icons, so this stays on the dark brand colour in both themes. */}
      <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        {state === 'locked' && (
          <>
            <Image source={require('../../assets/logo-mark.png')} style={{ width: 64, height: 64 }} resizeMode="contain" accessibilityLabel="Servon" />
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.onBrand }}>Hi {user?.name?.split(/\s+/)[0]}</Text>
            <Text style={{ color: colors.onBrand, opacity: 0.8, textAlign: 'center' }}>Use your fingerprint or face to open the app.</Text>
            <Button title="Unlock" size="lg" icon="finger-print" loading={busy} style={{ alignSelf: 'stretch', marginTop: 12 }} onPress={unlock} />
            <Button title="Use my password instead" variant="secondary" style={{ alignSelf: 'stretch' }} onPress={logout} />
          </>
        )}
      </View>
    </Modal>
  );
}
