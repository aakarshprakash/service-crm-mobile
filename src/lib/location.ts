import * as Location from 'expo-location';

export type Position = { lat: number; lng: number; accuracy: number };

/**
 * Current GPS position, asking for "while using the app" permission the first time.
 * Rejects with a message a technician can act on.
 */
export async function getPosition(timeoutMs = 12000): Promise<Position> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is off. Allow location for Servon in your phone settings.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Location (GPS) is switched off. Turn it on from the quick settings and try again.');
  }
  const fix = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  const pos = fix ?? (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }));
  if (!pos) throw new Error('Couldn’t get your location. Move to an open area and try again.');
  return {
    lat: +pos.coords.latitude.toFixed(7),
    lng: +pos.coords.longitude.toFixed(7),
    accuracy: Math.round(pos.coords.accuracy ?? 0),
  };
}

/** Best effort: a position if one is available quickly, otherwise null. */
export async function tryPosition(timeoutMs = 6000): Promise<Position | null> {
  return getPosition(timeoutMs).catch(() => null);
}
