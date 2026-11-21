'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Button,
  Card,
  DateRangePicker,
  type DateRangePickerValue,
  DonutChart,
  LineChart,
  Metric,
  MultiSelect,
  MultiSelectItem,
  Text,
  Title,
} from '@tremor/react';
import {
  FILTER_DIMS,
  type DimKey,
  type Granularity,
  bucketLabel,
  defaultFromDate,
  fetchDailySales,
  fmtUSD,
  startOfToday,
  toBucketKey,
  toLocalIsoDate,
} from '../_shared';
import { GranularityToggle } from '../_granularity-toggle';

export default function SaleSourcePage() {
  const [dateRange, setDateRange] = useState<DateRangePickerValue>({
    from: defaultFromDate(),
    to: startOfToday(),
  });
  const [granularity, setGranularity] = useState<Granularity>('week');

  const from = dateRange.from ?? defaultFromDate();
  const to = dateRange.to ?? startOfToday();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['daily-sales', toLocalIsoDate(from), toLocalIsoDate(to)],
    queryFn: () => fetchDailySales(from, to),
  });

  const allRows = data ?? [];

  const [filters, setFilters] = useState<Record<DimKey, string[]>>({
    bookTitle: [],
    saleSource: [],
    versionType: [],
    versionLanguage: [],
    marketplace: [],
  });

  const options = useMemo(
    () =>
      Object.fromEntries(
        FILTER_DIMS.map(({ key }) => [
          key,
          Array.from(new Set(allRows.map((r) => r[key]))).sort(),
        ]),
      ) as Record<DimKey, string[]>,
    [allRows],
  );

  const rows = useMemo(
    () =>
      allRows.filter((r) =>
        FILTER_DIMS.every(
          ({ key }) => filters[key].length === 0 || filters[key].includes(r[key]),
        ),
      ),
    [allRows, filters],
  );

  const activeFilterCount = FILTER_DIMS.reduce((n, { key }) => n + filters[key].length, 0);
  const clearFilters = () =>
    setFilters({
      bookTitle: [],
      saleSource: [],
      versionType: [],
      versionLanguage: [],
      marketplace: [],
    });

  const totals = useMemo(() => {
    const bySource = new Map<string, number>();
    for (const r of rows) {
      bySource.set(r.saleSource, (bySource.get(r.saleSource) ?? 0) + r.royaltyUsd);
    }
    const list = Array.from(bySource.entries())
      .map(([source, revenue]) => ({ source, revenue: Number(revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue);
    const total = list.reduce((s, x) => s + x.revenue, 0);
    return { list, total };
  }, [rows]);

  const sources = useMemo(() => totals.list.map((t) => t.source), [totals]);

  const series = useMemo(() => {
    const byBucket = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = toBucketKey(r.royaltyDate, granularity);
      if (!byBucket.has(key)) byBucket.set(key, {});
      const entry = byBucket.get(key)!;
      entry[r.saleSource] = (entry[r.saleSource] ?? 0) + r.royaltyUsd;
    }
    return Array.from(byBucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => ({
        date: bucketLabel(key, granularity),
        ...Object.fromEntries(
          sources.map((s) => [s, Number((entry[s] ?? 0).toFixed(2))]),
        ),
      }));
  }, [rows, sources, granularity]);

  const pct = (n: number) =>
    totals.total > 0 ? `${((n / totals.total) * 100).toFixed(1)}%` : '—';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Title>Revenue by sale source</Title>
          <Text>
            {toLocalIsoDate(from)} → {toLocalIsoDate(to)}
            {isFetching ? ' · refreshing…' : isLoading ? ' · loading…' : ''}
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
          <Button variant="light" onClick={clearFilters} disabled={activeFilterCount === 0}>
            Clear ({activeFilterCount})
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {FILTER_DIMS.map(({ key, placeholder }) => (
            <MultiSelect
              key={key}
              value={filters[key]}
              onValueChange={(v) => setFilters((f) => ({ ...f, [key]: v }))}
              placeholder={placeholder}
            >
              {options[key].map((o) => (
                <MultiSelectItem key={o} value={o}>
                  {o}
                </MultiSelectItem>
              ))}
            </MultiSelect>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Text>Total</Text>
          <Metric>{fmtUSD(totals.total)}</Metric>
        </Card>
        {totals.list.map((t) => (
          <Card key={t.source}>
            <Text>{t.source}</Text>
            <Metric>{fmtUSD(t.revenue)}</Metric>
            <Text className="mt-1 text-xs">{pct(t.revenue)} of total</Text>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <Title>Share of revenue</Title>
          <DonutChart
            className="mt-4 h-60"
            data={totals.list}
            index="source"
            category="revenue"
            valueFormatter={fmtUSD}
            showAnimation
            noDataText="No sales in this range"
          />
        </Card>
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <Title>Revenue by {granularity} — sale source</Title>
            <GranularityToggle value={granularity} onChange={setGranularity} />
          </div>
          <BarChart
            className="mt-4 h-60"
            data={series}
            index="date"
            categories={sources}
            valueFormatter={fmtUSD}
            stack
            showLegend
            showAnimation
            yAxisWidth={64}
            noDataText="No sales in this range"
          />
        </Card>
      </div>

      <Card>
        <Title>Trend by sale source</Title>
        <LineChart
          className="mt-4 h-72"
          data={series}
          index="date"
          categories={sources}
          valueFormatter={fmtUSD}
          showLegend
          showAnimation
          yAxisWidth={64}
          intervalType="preserveStartEnd"
          noDataText="No sales in this range"
        />
      </Card>
    </div>
  );
}
