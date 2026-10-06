import type { UpiAccount } from './types';

/** NPCI UPI deep link — mirrors UpiAccount::link() on the API and upiLink() on the web. */
export function upiLink(account: Pick<UpiAccount, 'vpa' | 'payee_name'>, amountMinor?: number | null, note?: string, currency = 'INR'): string {
  const params: [string, string][] = [
    ['pa', account.vpa],
    ['pn', account.payee_name],
  ];
  if (amountMinor) params.push(['am', (amountMinor / 100).toFixed(2)]);
  params.push(['cu', currency]);
  if (note) params.push(['tn', note.slice(0, 80)]);
  return 'upi://pay?' + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/** The branch's own UPI account, else the company default, else the first. */
export function pickUpiAccount(accounts: UpiAccount[] | undefined, branchId?: number | null): UpiAccount | undefined {
  if (!accounts?.length) return undefined;
  return accounts.find((a) => branchId && a.branch_id === branchId) ?? accounts.find((a) => a.is_default) ?? accounts[0];
}
