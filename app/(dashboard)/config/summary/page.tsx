'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Text, Title } from '@tremor/react';
import type {
  ConfigBook,
  ConfigBookVersion,
  ConfigForexRate,
  ConfigKenpRate,
  ConfigMarketplace,
  ConfigSummary,
} from '@/lib/types/config';

async function fetchConfigSummary(): Promise<ConfigSummary> {
  const res = await fetch('/api/config/summary');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.data as ConfigSummary;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td
      className={`border-b border-slate-100 px-3 py-2 text-sm text-slate-700 ${mono ? 'font-mono text-xs' : ''}`}
    >
      {children}
    </td>
  );
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonthYear(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  return `${MONTHS[Number(month) - 1]}-${year.slice(2)}`;
}

function Badge({ value }: { value: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        value
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-amber-50 text-amber-700'
      }`}
    >
      {value ? 'Final' : 'Estimated'}
    </span>
  );
}

function TableCard({
  title,
  subtitle,
  rowCount,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  rowCount: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <Title className="text-base">{title}</Title>
            <Text className="mt-0.5 text-xs text-slate-500">{subtitle}</Text>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {rowCount.toLocaleString()} rows
          </span>
        </div>
      </div>
      <div className="max-h-80 overflow-auto border-t border-slate-100">
        <table className="w-full">{children}</table>
      </div>
    </Card>
  );
}

function BooksTable({ rows }: { rows: ConfigBook[] }) {
  return (
    <TableCard
      title="Books"
      subtitle="CONFIG.BOOKS — master list of books and series"
      rowCount={rows.length}
    >
      <thead>
        <tr>
          <Th>SID</Th>
          <Th>Title</Th>
          <Th>Series</Th>
          <Th>Series #</Th>
          <Th>Is Set</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.bookSid} className="hover:bg-slate-50">
            <Td mono>{r.bookSid}</Td>
            <Td>{r.title}</Td>
            <Td>{r.series ?? '—'}</Td>
            <Td>{r.seriesNo ?? '—'}</Td>
            <Td>
              {r.isSet ? (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Set
                </span>
              ) : (
                <span className="text-slate-400">No</span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

function BookVersionsTable({ rows }: { rows: ConfigBookVersion[] }) {
  return (
    <TableCard
      title="Book Versions"
      subtitle="CONFIG.BOOK_VERSIONS — ASIN/ISBN identifiers per edition and language"
      rowCount={rows.length}
    >
      <thead>
        <tr>
          <Th>SID</Th>
          <Th>Book</Th>
          <Th>ID Type</Th>
          <Th>Unique ID</Th>
          <Th>Format</Th>
          <Th>Language</Th>
          <Th>Version Title</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.bookVersionSid} className="hover:bg-slate-50">
            <Td mono>{r.bookVersionSid}</Td>
            <Td>{r.bookTitle}</Td>
            <Td>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {r.bookVersionUniqueIdType}
              </span>
            </Td>
            <Td mono>{r.bookVersionUniqueId}</Td>
            <Td>{r.versionType}</Td>
            <Td>{r.versionLanguage}</Td>
            <Td>
              <span className="block max-w-xs truncate text-xs text-slate-500" title={r.versionTitle}>
                {r.versionTitle}
              </span>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

function MarketplacesTable({ rows }: { rows: ConfigMarketplace[] }) {
  return (
    <TableCard
      title="Marketplaces"
      subtitle="CONFIG.MARKETPLACES — Amazon storefront to country and currency mapping"
      rowCount={rows.length}
    >
      <thead>
        <tr>
          <Th>Amazon Name</Th>
          <Th>Country</Th>
          <Th>Currency</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.amazonName} className="hover:bg-slate-50">
            <Td mono>{r.amazonName}</Td>
            <Td>{r.country}</Td>
            <Td>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {r.currency}
              </span>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

function KenpRatesTable({ rows }: { rows: ConfigKenpRate[] }) {
  const months = Array.from(new Set(rows.map((r) => r.monthBeginDate))).sort().reverse();
  return (
    <TableCard
      title="KENP Rates"
      subtitle={<>CONFIG.KENP_RATES — Kindle Unlimited per-page royalty rates by country and month. Source: <a href="https://readerlinks.com/kenp_rates/index.php" target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800">readerlinks.com/kenp_rates</a></>}
      rowCount={rows.length}
    >
      <thead>
        <tr>
          <Th>Month</Th>
          <Th>Country</Th>
          <Th>Rate (local)</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {months.flatMap((month) =>
          rows
            .filter((r) => r.monthBeginDate === month)
            .map((r) => (
              <tr key={`${r.monthBeginDate}-${r.country}`} className="hover:bg-slate-50">
                <Td mono>{fmtMonthYear(r.monthBeginDate)}</Td>
                <Td>{r.country}</Td>
                <Td mono>{r.kenpRate == null ? '—' : r.kenpRate.toFixed(7)}</Td>
                <Td>
                  <Badge value={r.isFinal} />
                </Td>
              </tr>
            )),
        )}
      </tbody>
    </TableCard>
  );
}

function ForexRatesTable({ rows }: { rows: ConfigForexRate[] }) {
  const months = Array.from(new Set(rows.map((r) => r.monthBeginDate))).sort().reverse();
  return (
    <TableCard
      title="Forex Rates"
      subtitle={<>CONFIG.FOREX_RATES — Monthly exchange rates to USD for royalty normalization. Source: <a href="https://www.x-rates.com/average/" target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800">x-rates.com/average</a></>}
      rowCount={rows.length}
    >
      <thead>
        <tr>
          <Th>Month</Th>
          <Th>From</Th>
          <Th>To</Th>
          <Th>Rate</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {months.flatMap((month) =>
          rows
            .filter((r) => r.monthBeginDate === month)
            .map((r) => (
              <tr key={`${r.monthBeginDate}-${r.sourceCurrency}`} className="hover:bg-slate-50">
                <Td mono>{fmtMonthYear(r.monthBeginDate)}</Td>
                <Td>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {r.sourceCurrency}
                  </span>
                </Td>
                <Td>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {r.targetCurrency}
                  </span>
                </Td>
                <Td mono>{r.exchangeRate.toFixed(6)}</Td>
                <Td>
                  <Badge value={r.isFinal} />
                </Td>
              </tr>
            )),
        )}
      </tbody>
    </TableCard>
  );
}


export default function ConfigSummaryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['config-summary'],
    queryFn: fetchConfigSummary,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <header>
        <Title>Configuration Summary</Title>
        <Text className="mt-1">
          Reference tables maintained in Snowflake that drive back-end processing logic.
        </Text>
      </header>

      {error ? (
        <Card className="border-red-200">
          <Text className="text-red-600">{(error as Error).message}</Text>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-6">
          <BooksTable rows={data.books} />
          <BookVersionsTable rows={data.bookVersions} />
          <MarketplacesTable rows={data.marketplaces} />
          <KenpRatesTable rows={data.kenpRates} />
          <ForexRatesTable rows={data.forexRates} />
        </div>
      ) : null}
    </div>
  );
}
