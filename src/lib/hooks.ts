import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, ApiError, type Envelope } from './api';
import { toast } from '@/components/toast';
import type { Lookups, MyPart, MyPartMove } from './types';

/** Dropdown data (complaint types, action taken, UPI accounts, leave types), cached 10 minutes. */
export function useLookups() {
  return useQuery({
    queryKey: ['lookups'],
    queryFn: () => api.get<Envelope<Lookups>>('/master/lookups').then((r) => r.data),
    staleTime: 10 * 60_000,
  });
}

/** The parts allocated to this technician, and what happened to them. */
export function useMyParts() {
  return useQuery({ queryKey: ['my-parts'], queryFn: () => api.get<Envelope<{ stock: MyPart[]; moves: MyPartMove[] }>>('/my/parts').then((r) => r.data) });
}

/** Mutation with a success toast and an error toast (field errors are shown inline instead). */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult, v: TVars) => void; toastValidation?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      const msg = typeof opts.success === 'function' ? opts.success(result) : opts.success ?? (result as { message?: string })?.message;
      if (msg) toast.success(msg);
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(result, vars);
    },
    onError: (e) => {
      const hasFieldErrors = e instanceof ApiError && Object.keys(e.errors).length > 0;
      if (!hasFieldErrors || opts.toastValidation !== false) toast.error(e instanceof Error ? e.message : 'Something went wrong.');
    },
  });
}

/**
 * The server says this record is gone or no longer this technician's (e.g. the job was reassigned), so what's on
 * screen shouldn't stay. Any other failed refresh keeps the data, and whatever is being typed into a form.
 */
export function isGone(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

export function fieldError(error: unknown, name: string): string | undefined {
  return error instanceof ApiError ? error.field(name) : undefined;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
