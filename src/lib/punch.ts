import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api, type Envelope } from './api';
import { getPosition } from './location';
import type { Job, PunchRules, Visit } from './types';

export interface TechDashboard {
  counts: { open: number; in_progress: number; pending: number; completed: number };
  today: Job[];
  punch_status: 'in' | 'out';
  punched_at: string | null;
  /** Missing on servers older than 2.2. */
  attendance?: PunchRules;
  cash_in_hand: number;
  collected_today: number;
  active_visit: (Visit & { job: { id: number; crm_call_id: string } }) | null;
}

export const DASHBOARD_KEY = ['tech-dashboard'];

export function useTechDashboard() {
  return useQuery({ queryKey: DASHBOARD_KEY, queryFn: () => api.get<Envelope<TechDashboard>>('/dashboard/technician').then((r) => r.data), refetchInterval: 60_000 });
}

/**
 * Punch in or out with the phone's location. The server decides whether the punch is inside the
 * branch geofence, and refuses it when the company blocks punches from outside.
 * Returns the server's message ("Punched in.", or how far from the office it was).
 */
export async function punch(type: 'in' | 'out', qc: QueryClient, refreshUser: () => Promise<unknown>): Promise<{ message: string; outside: boolean }> {
  // Sent when available; required by the server only when the company asks for it.
  const pos = await getPosition(6000).catch(() => null);
  const res = await api.post<Envelope<{ within_fence: boolean | null }> & { message?: string }>('/punch', { type, source: 'mobile', ...(pos ?? {}) });
  // Wait only for the user's on-duty status; the lists refresh in the background.
  qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
  qc.invalidateQueries({ queryKey: ['my-attendance'] });
  await refreshUser();
  const outside = res.data.within_fence === false;
  return { message: res.message ?? (outside ? 'Punch recorded outside the office area.' : type === 'in' ? 'Punched in.' : 'Punched out.'), outside };
}

/** One sentence telling the technician where they can punch in. */
export function punchRuleText(rules: PunchRules | undefined): string {
  if (!rules || rules.geofence === 'off' || !rules.branch) return 'You can punch in from anywhere. Your location is saved with the punch.';
  const where = `within ${rules.branch.radius} m of ${rules.branch.name}`;
  return rules.geofence === 'enforce'
    ? `Punch in ${where}. Punches from anywhere else are refused.`
    : `Punch in ${where}. Punches from elsewhere still count but are flagged to the office.`;
}
