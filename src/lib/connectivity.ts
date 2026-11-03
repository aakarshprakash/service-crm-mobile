import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { pingServer, setReachabilityReporter } from './api';

/**
 * Whether the app can really talk to the server. Android's flags alone say "no internet" on working
 * connections (Private DNS, VPNs, some carriers, a moment during a handover), and they can go stale while
 * the app is in the background, so they only prompt a check: "offline" is shown once the server can't be reached.
 */
export interface Connectivity {
  offline: boolean;
  /** The phone has no network at all, rather than the server being out of reach. */
  noNetwork: boolean;
}

const RECHECK_MS = 15_000;
const CONFIRM_MS = 3_000;

let state: Connectivity = { offline: false, noNetwork: false };
const listeners = new Set<() => void>();
let checking: Promise<void> | null = null;
let recheck: ReturnType<typeof setTimeout> | null = null;

function publish(next: Connectivity) {
  if (next.offline === state.offline && next.noNetwork === state.noNetwork) return;
  state = next;
  listeners.forEach((fn) => fn());
}

function check(): Promise<void> {
  checking ??= (async () => {
    let ok = await pingServer();
    // A single dropped request isn't "offline", especially while switching between Wi-Fi and mobile data.
    if (!ok && !state.offline) {
      await new Promise((r) => setTimeout(r, CONFIRM_MS));
      ok = await pingServer();
    }
    const net = ok ? null : await Network.getNetworkStateAsync().catch(() => null);
    publish({ offline: !ok, noNetwork: net?.isConnected === false });
    if (recheck) clearTimeout(recheck);
    recheck = !ok && AppState.currentState === 'active' ? setTimeout(() => void check(), RECHECK_MS) : null;
  })().finally(() => {
    checking = null;
  });
  return checking;
}

let started = false;

export function initConnectivity() {
  if (started) return;
  started = true;
  setReachabilityReporter((reached) => {
    if (reached) {
      if (recheck) clearTimeout(recheck);
      recheck = null;
      publish({ offline: false, noNetwork: false });
    } else void check();
  });
  Network.addNetworkStateListener((s) => {
    if (state.offline || s.isConnected === false || s.isInternetReachable === false) void check();
  });
  // Network events can be missed while in the background: look again on the way back.
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void check();
  });
  void check();
}

export function subscribeConnectivity(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getConnectivity = () => state;

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(subscribeConnectivity, getConnectivity);
}
