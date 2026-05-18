'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Button,
  Card,
  DateRangePicker,
  type DateRangePickerValue,
  LineChart,
  Metric,
  MultiSelect,
  MultiSelectItem,
  Text,
  Title,
} from '@tremor/react';
import type { DailySaleRow, DailySalesResponse } from '@/lib/types/reports';

const DEFAULT_DAYS = 90;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}

function isoToShortLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

async function fetchDailySales(from: Date, to: Date): Promise<DailySaleRow[]> {
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

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(n);

type DimKey = 'bookTitle' | 'saleSource' | 'versionType' | 'versionLanguage' | 'marketplace';

const FILTER_DIMS: { key: DimKey; placeholder: string }[] = [
  { key: 'bookTitle', placeholder: 'Book title' },
  { key: 'saleSource', placeholder: 'Sale source' },
  { key: 'versionType', placeholder: 'Version type' },
  { key: 'versionLanguage', placeholder: 'Language' },
  { key: 'marketplace', placeholder: 'Marketplace' },
];

export default function SalesPage() {
  const [dateRange, setDateRange] = useState<DateRangePickerValue>({
    from: daysAgo(DEFAULT_DAYS),
    to: startOfToday(),
  });
  const [filters, setFilters] = useState<Record<DimKey, string[]>>({
    bookTitle: [],
    saleSource: [],
    versionType: [],
    versionLanguage: [],
    marketplace: [],
  });

  const from = dateRange.from ?? daysAgo(DEFAULT_DAYS);
  const to = dateRange.to ?? startOfToday();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['daily-sales', toLocalIsoDate(from), toLocalIsoDate(to)],
    queryFn: () => fetchDailySales(from, to),
  });

  const rows = data ?? [];

  const filterOptions = useMemo(() => {
    const result = {} as Record<DimKey, string[]>;
    for (const { key } of FILTER_DIMS) {
      result[key] = Array.from(
        new Set(rows.map((r) => r[key]).filter(Boolean)),
      ).sort();
    }
    return result;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      FILTER_DIMS.every(({ key }) => {
        const selected = filters[key];
        return selected.length === 0 || selected.includes(r[key]);
      }),
    );
  }, [rows, filters]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.royalty += r.royaltyUsd;
          acc.units += r.netUnitsSold;
          acc.pageReads += r.pageReads;
          return acc;
        },
        { royalty: 0, units: 0, pageReads: 0 },
      ),
    [filtered],
  );

  const dailySeries = useMemo(() => {
    const byDate = new Map<
      string,
      { royalty: number; units: number; pageReads: number }
    >();
    for (const r of filtered) {
      const key = r.royaltyDate.slice(0, 10);
      const agg =
        byDate.get(key) ?? { royalty: 0, units: 0, pageReads: 0 };
      agg.royalty += r.royaltyUsd;
      agg.units += r.netUnitsSold;
      agg.pageReads += r.pageReads;
      byDate.set(key, agg);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, agg]) => ({
        date: isoToShortLabel(iso),
        Royalty: Number(agg.royalty.toFixed(2)),
        Units: agg.units,
        'Page reads': agg.pageReads,
      }));
  }, [filtered]);

  const activeFilterCount = FILTER_DIMS.reduce(
    (sum, { key }) => sum + filters[key].length,
    0,
  );

  const setDimFilter = (key: DimKey) => (values: string[]) =>
    setFilters((prev) => ({ ...prev, [key]: values }));

  const clearFilters = () =>
    setFilters({
      bookTitle: [],
      saleSource: [],
      versionType: [],
      versionLanguage: [],
      marketplace: [],
    });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Title>Daily sales</Title>
          <Text>
            {toLocalIsoDate(from)} → {toLocalIsoDate(to)}
            {' · '}
            {isLoading
              ? 'loading…'
              : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} rows`}
            {isFetching && !isLoading ? ' · refreshing…' : ''}
          </Text>
        </div>
        <DateRangePicker
          value={dateRange}
          onValueChange={setDateRange}
          enableSelect={false}
          className="max-w-sm"
        />
      </header>

      {error ? (
        <Card className="border-red-200">
          <Text className="text-red-600">{(error as Error).message}</Text>
        </Card>
      ) : null}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Text className="font-medium text-slate-700">Filters</Text>
          <Button
            variant="light"
            onClick={clearFilters}
            disabled={activeFilterCount === 0}
          >
            Clear ({activeFilterCount})
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {FILTER_DIMS.map(({ key, placeholder }) => (
            <MultiSelect
              key={key}
              value={filters[key]}
              onValueChange={setDimFilter(key)}
              placeholder={placeholder}
            >
              {filterOptions[key].map((v) => (
                <MultiSelectItem key={v} value={v}>
                  {v}
                </MultiSelectItem>
              ))}
            </MultiSelect>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <Text>Royalty (USD)</Text>
          <Metric>{isLoading ? '—' : fmtUSD(totals.royalty)}</Metric>
        </Card>
        <Card>
          <Text>Net units sold</Text>
          <Metric>{isLoading ? '—' : fmtNum(totals.units)}</Metric>
        </Card>
        <Card>
          <Text>Page reads</Text>
          <Metric>{isLoading ? '—' : fmtNum(totals.pageReads)}</Metric>
        </Card>
      </div>

      <Card>
        <Title>Royalty by day</Title>
        <LineChart
          className="mt-4 h-80"
          data={dailySeries}
          index="date"
          categories={['Royalty']}
          valueFormatter={fmtUSD}
          showLegend={false}
          showAnimation
          yAxisWidth={64}
          intervalType="preserveStartEnd"
          noDataText="No sales in this range / filter combo"
        />
      </Card>

      <Card>
        <Title>Units sold & page reads by day</Title>
        <BarChart
          className="mt-4 h-64"
          data={dailySeries}
          index="date"
          categories={['Units', 'Page reads']}
          valueFormatter={fmtNum}
          showLegend
          showAnimation
          yAxisWidth={64}
          intervalType="preserveStartEnd"
          noDataText="No sales in this range / filter combo"
        />
      </Card>
    </div>
  );
}
