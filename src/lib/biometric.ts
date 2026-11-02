import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const ENABLED_KEY = 'servon.biometric.user';
const ASKED_KEY = 'servon.biometric.asked';

/** Signed in with the password in this run of the app, so the first unlock isn't needed. */
let signedInThisRun = false;
export const markPasswordSignIn = () => {
  signedInThisRun = true;
};
export const wasPasswordSignIn = () => signedInThisRun;

/** Survives the app redrawing itself, e.g. when the theme changes, so that doesn't ask for the fingerprint again. */
let unlockedThisRun = false;
export const setUnlocked = (unlocked: boolean) => {
  unlockedThisRun = unlocked;
};
export const isUnlocked = () => unlockedThisRun;

/** The phone has a fingerprint or face unlock set up. */
export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** Tied to the user, so someone else signing in on this phone doesn't inherit it. */
export async function biometricEnabledFor(userId: number): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENABLED_KEY)) === String(userId);
}

export async function setBiometricFor(userId: number | null): Promise<void> {
  if (userId) await SecureStore.setItemAsync(ENABLED_KEY, String(userId));
  else await SecureStore.deleteItemAsync(ENABLED_KEY);
}

export async function wasAskedAboutBiometric(userId: number): Promise<boolean> {
  return (await SecureStore.getItemAsync(ASKED_KEY)) === String(userId);
}

export async function rememberAskedAboutBiometric(userId: number): Promise<void> {
  await SecureStore.setItemAsync(ASKED_KEY, String(userId));
}

/** Fingerprint or face, with the phone's PIN as the fallback. */
export async function authenticate(promptMessage = 'Unlock Servon'): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' });
    return r.success;
  } catch {
    return false;
  }
}
