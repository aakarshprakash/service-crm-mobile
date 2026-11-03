import * as Location from 'expo-location';

export type Position = { lat: number; lng: number; accuracy: number };

const toPosition = (pos: Location.LocationObject): Position => ({
  lat: +pos.coords.latitude.toFixed(7),
  lng: +pos.coords.longitude.toFixed(7),
  accuracy: Math.round(pos.coords.accuracy ?? 0),
});

/** A recent fix the phone already has (no GPS wait), if it is fresh and accurate enough. */
async function recentFix(maxAgeMs: number, maxAccuracyM: number): Promise<Position | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: maxAgeMs, requiredAccuracy: maxAccuracyM });
    return last ? toPosition(last) : null;
  } catch {
    return null;
  }
}

/**
 * Current position, asking for "while using the app" permission the first time.
 * Uses the phone's recent fix when it is fresh (instant); otherwise waits for a new fix
 * at balanced accuracy (fast indoors) for up to `timeoutMs`. Rejects with a message a
 * technician can act on.
 */
export async function getPosition(timeoutMs = 8000, opts: { maxAgeMs?: number; maxAccuracyM?: number } = {}): Promise<Position> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is off. Allow location for Servon in your phone settings.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Location (GPS) is switched off. Turn it on from the quick settings and try again.');
  }
  const recent = await recentFix(opts.maxAgeMs ?? 2 * 60_000, opts.maxAccuracyM ?? 150);
  if (recent) return recent;

  const fix = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]).catch(() => null);
  if (fix) return toPosition(fix);

  // No fresh fix in time: fall back to anything from the last 10 minutes.
  const older = await recentFix(10 * 60_000, 2000);
  if (older) return older;
  throw new Error('Couldn’t get your location. Move to an open area and try again.');
}

/** Best effort and quick: a position if one is available, otherwise null (never blocks long). */
export async function tryPosition(timeoutMs = 3000): Promise<Position | null> {
  return getPosition(timeoutMs).catch(() => null);
}
