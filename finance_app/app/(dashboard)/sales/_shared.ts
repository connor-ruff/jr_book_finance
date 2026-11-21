import type { DailySaleRow, DailySalesResponse } from '@/lib/types/reports';

export const DEFAULT_MONTHS_BACK = 3;
export const MAX_BOOK_LANG_COMBOS = 10;

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// First day of the month, `months` months before the current month
// (e.g. on Nov 20 with months=3 -> Aug 1): a rolling quarter plus month-to-date.
export function startOfMonthsAgo(months: number): Date {
  const d = startOfToday();
  return new Date(d.getFullYear(), d.getMonth() - months, 1);
}

export function defaultFromDate(): Date {
  return startOfMonthsAgo(DEFAULT_MONTHS_BACK);
}

export function isoToShortLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export async function fetchDailySales(from: Date, to: Date): Promise<DailySaleRow[]> {
  const params = new URLSearchParams({
    from: toLocalIsoDate(from),
    to: toLocalIsoDate(to),
  });
  const res = await fetch(`/api/reports/sales?${params.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  const json = (await res.json()) as DailySalesResponse;
  return json.data;
}

export const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

export const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(n);

export type DimKey =
  | 'bookTitle'
  | 'saleSource'
  | 'versionType'
  | 'versionLanguage'
  | 'marketplace';

export const FILTER_DIMS: { key: DimKey; placeholder: string }[] = [
  { key: 'bookTitle', placeholder: 'Book title' },
  { key: 'saleSource', placeholder: 'Sale source' },
  { key: 'versionType', placeholder: 'Version type' },
  { key: 'versionLanguage', placeholder: 'Language' },
  { key: 'marketplace', placeholder: 'Marketplace' },
];

export type Granularity = 'day' | 'week' | 'month';

export function toBucketKey(iso: string, granularity: Granularity): string {
  if (granularity === 'month') return iso.slice(0, 7);
  if (granularity === 'day') return iso.slice(0, 10);
  // week: return the ISO date of the Monday of that week
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0 = Sun
  date.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
  return toLocalIsoDate(date);
}

export function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }
  return isoToShortLabel(key); // day and week both display as "Mon D"
}
