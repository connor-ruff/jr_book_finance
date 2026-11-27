'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Text, Title } from '@tremor/react';
import type { ConfigRefreshStatus } from '@/lib/types/config';

async function fetchRefresh(): Promise<ConfigRefreshStatus[]> {
  const res = await fetch('/api/config/refresh');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()).data as ConfigRefreshStatus[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

function loadStatus(days: number | null) {
  if (days == null) return { label: 'No data', cls: 'bg-slate-100 text-slate-600' };
  if (days <= 7) return { label: 'Fresh', cls: 'bg-emerald-50 text-emerald-700' };
  if (days <= 31) return { label: 'Aging', cls: 'bg-amber-50 text-amber-700' };
  return { label: 'Stale', cls: 'bg-red-50 text-red-700' };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function ago(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

// Show just the host (e.g. "kdpreports.amazon.com"), not the full URL
function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Open';
  }
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
    {children}
  </th>
);

const Td = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
  <td className={`border-b border-slate-100 px-3 py-2 text-sm text-slate-700 ${mono ? 'font-mono text-xs' : ''}`}>
    {children}
  </td>
);

export default function RefreshMonitorPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['config-refresh'],
    queryFn: fetchRefresh,
    staleTime: 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <header>
        <Title>Refresh Monitor</Title>
        <Text className="mt-1">
          Latest period of data available and last load time for each source (CONFIG.REFRESH_DASHBOARD).
        </Text>
      </header>

      {error ? (
        <Card className="border-red-200">
          <Text className="text-red-600">{(error as Error).message}</Text>
        </Card>
      ) : null}

      {isLoading ? (
        <Card className="h-64 animate-pulse bg-slate-100" />
      ) : data ? (
        <Card className="overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Data Through</Th>
                <Th>Last Loaded</Th>
                <Th>Load Age</Th>
                <Th>Status</Th>
                <Th>Link</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const days = daysSince(r.latestLoadTimestamp);
                const st = loadStatus(days);
                return (
                  <tr key={r.source} className="hover:bg-slate-50">
                    <Td mono>{r.source}</Td>
                    <Td>{fmtDate(r.latestDataAvailable)}</Td>
                    <Td>{fmtDateTime(r.latestLoadTimestamp)}</Td>
                    <Td>{ago(days)}</Td>
                    <Td>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                    </Td>
                    <Td>
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          title={r.url}
                          className="text-blue-600 underline hover:text-blue-800"
                        >
                          {linkLabel(r.url)} ↗
                        </a>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
