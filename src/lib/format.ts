/**
 * Money from the API is an integer in paise (minor units); timestamps are UTC and shown
 * in the company's timezone.
 */

let currency = 'INR';
let timeZone: string | undefined;

export function configureFormatting(opts: { currency?: string; timezone?: string }) {
  if (opts.currency) currency = opts.currency;
  timeZone = opts.timezone || undefined;
}

export function money(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '–';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return `₹${(minor / 100).toFixed(2)}`;
  }
}

/** "1,250.50" → 125050 */
export function toMinor(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function toMajor(minor: number | null | undefined): string {
  if (!minor) return '';
  return (minor / 100).toFixed(2).replace(/\.00$/, '');
}

function fmt(value: string, opts: Intl.DateTimeFormatOptions, dateOnly = false): string {
  const d = new Date(dateOnly ? value + 'T00:00:00' : value);
  if (Number.isNaN(d.getTime())) return '–';
  try {
    return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: dateOnly ? undefined : timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-IN', opts).format(d);
  }
}

export function date(value: string | null | undefined): string {
  if (!value) return '–';
  return fmt(value, { day: '2-digit', month: 'short', year: 'numeric' }, value.length === 10);
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '–';
  return fmt(value, { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function time(value: string | null | undefined): string {
  if (!value) return '–';
  return fmt(value, { hour: 'numeric', minute: '2-digit' });
}

export function relative(value: string | null | undefined): string {
  if (!value) return '';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return date(value);
}

/** Today (YYYY-MM-DD) in the company timezone. */
export function today(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function label(value: string | null | undefined): string {
  if (!value) return '–';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function qty(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return String(Number(Number(value).toFixed(3)));
}

export function num(n: number): string {
  return String(Number(n.toFixed(1)));
}

export function hours(minutes: number): string {
  if (!minutes) return '–';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  cheque: 'Cheque',
  bank_transfer: 'Bank transfer',
  credit: 'Credit',
  online: 'Online link',
};
