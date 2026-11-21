'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
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
import {
  DEFAULT_DAYS,
  FILTER_DIMS,
  type DimKey,
  type Granularity,
  bucketLabel,
  daysAgo,
  fetchDailySales,
  fmtNum,
  fmtUSD,
  startOfToday,
  toBucketKey,
  toLocalIsoDate,
} from '../_shared';
import { GranularityToggle } from '../_granularity-toggle';

export default function TotalRoyaltyPage() {
  const [dateRange, setDateRange] = useState<DateRangePickerValue>({
    from: daysAgo(DEFAULT_DAYS),
    to: startOfToday(),
  });
  const [granularity, setGranularity] = useState<Granularity>('day');

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

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        FILTER_DIMS.every(({ key }) => {
          const selected = filters[key];
          return selected.length === 0 || selected.includes(r[key]);
        }),
      ),
    [rows, filters],
  );

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
    const byBucket = new Map<string, number>();
    for (const r of filtered) {
      const key = toBucketKey(r.royaltyDate, granularity);
      byBucket.set(key, (byBucket.get(key) ?? 0) + r.royaltyUsd);
    }
    return Array.from(byBucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, royalty]) => ({
        date: bucketLabel(key, granularity),
        Royalty: Number(royalty.toFixed(2)),
      }));
  }, [filtered, granularity]);

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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Title>Total royalty</Title>
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
        <div className="flex items-center justify-between">
          <Title>Royalty by {granularity}</Title>
          <GranularityToggle value={granularity} onChange={setGranularity} />
        </div>
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
    </div>
  );
}
