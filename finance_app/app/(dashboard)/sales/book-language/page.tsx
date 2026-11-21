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
  MultiSelect,
  MultiSelectItem,
  Text,
  Title,
} from '@tremor/react';
import {
  DEFAULT_DAYS,
  MAX_BOOK_LANG_COMBOS,
  type Granularity,
  bucketLabel,
  daysAgo,
  fetchDailySales,
  fmtUSD,
  startOfToday,
  toBucketKey,
  toLocalIsoDate,
} from '../_shared';
import { GranularityToggle } from '../_granularity-toggle';

export default function BookLanguagePage() {
  const [dateRange, setDateRange] = useState<DateRangePickerValue>({
    from: daysAgo(DEFAULT_DAYS),
    to: startOfToday(),
  });
  const [selectedBooks, setSelectedBooks] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('day');

  const from = dateRange.from ?? daysAgo(DEFAULT_DAYS);
  const to = dateRange.to ?? startOfToday();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['daily-sales', toLocalIsoDate(from), toLocalIsoDate(to)],
    queryFn: () => fetchDailySales(from, to),
  });

  const rows = data ?? [];

  const allBooks = useMemo(
    () => Array.from(new Set(rows.map((r) => r.bookTitle))).sort(),
    [rows],
  );

  const allLanguages = useMemo(
    () => Array.from(new Set(rows.map((r) => r.versionLanguage))).sort(),
    [rows],
  );

  const allCombos = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => `${r.bookTitle} · ${r.versionLanguage}`)),
      ).sort(),
    [rows],
  );

  const filteredCombos = useMemo(() => {
    const bookSet = new Set(selectedBooks);
    const langSet = new Set(selectedLanguages);
    return allCombos.filter((c) => {
      const sep = c.lastIndexOf(' · ');
      const bookMatch = bookSet.size === 0 || bookSet.has(c.slice(0, sep));
      const langMatch = langSet.size === 0 || langSet.has(c.slice(sep + 3));
      return bookMatch && langMatch;
    });
  }, [allCombos, selectedBooks, selectedLanguages]);

  const activeCombos = useMemo(
    () => filteredCombos.slice(0, MAX_BOOK_LANG_COMBOS),
    [filteredCombos],
  );

  const bookLangSeries = useMemo(() => {
    const byBucket = new Map<string, Record<string, number>>();
    const comboSet = new Set(activeCombos);
    for (const r of rows) {
      const combo = `${r.bookTitle} · ${r.versionLanguage}`;
      if (!comboSet.has(combo)) continue;
      const key = toBucketKey(r.royaltyDate, granularity);
      if (!byBucket.has(key)) byBucket.set(key, {});
      const entry = byBucket.get(key)!;
      entry[combo] = (entry[combo] ?? 0) + r.royaltyUsd;
    }
    return {
      data: Array.from(byBucket.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => ({
          date: bucketLabel(key, granularity),
          ...Object.fromEntries(
            activeCombos.map((c) => [c, Number((entry[c] ?? 0).toFixed(2))]),
          ),
        })),
      categories: activeCombos,
    };
  }, [rows, activeCombos, granularity]);

  const bookBarSeries = useMemo(() => {
    const languages = Array.from(
      new Set(filteredCombos.map((c) => c.slice(c.lastIndexOf(' · ') + 3))),
    ).sort();
    const byBook = new Map<string, Record<string, number>>();
    const comboSet = new Set(filteredCombos);
    for (const r of rows) {
      const combo = `${r.bookTitle} · ${r.versionLanguage}`;
      if (!comboSet.has(combo)) continue;
      if (!byBook.has(r.bookTitle)) byBook.set(r.bookTitle, {});
      const entry = byBook.get(r.bookTitle)!;
      entry[r.versionLanguage] = (entry[r.versionLanguage] ?? 0) + r.royaltyUsd;
    }
    const data = Array.from(byBook.entries())
      .map(([book, entry]) => ({
        book,
        total: languages.reduce((s, l) => s + (entry[l] ?? 0), 0),
        ...Object.fromEntries(
          languages.map((l) => [l, Number((entry[l] ?? 0).toFixed(2))]),
        ),
      }))
      .sort((a, b) => b.total - a.total)
      .map(({ total: _total, ...rest }) => rest);
    return { data, languages };
  }, [rows, activeCombos]);

  const hasFilters = selectedBooks.length > 0 || selectedLanguages.length > 0;
  const clearFilters = () => {
    setSelectedBooks([]);
    setSelectedLanguages([]);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Title>Book &amp; language royalty</Title>
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
          <Button variant="light" onClick={clearFilters} disabled={!hasFilters}>
            Clear ({selectedBooks.length + selectedLanguages.length})
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <MultiSelect
            value={selectedBooks}
            onValueChange={setSelectedBooks}
            placeholder="Book title"
          >
            {allBooks.map((b) => (
              <MultiSelectItem key={b} value={b}>
                {b}
              </MultiSelectItem>
            ))}
          </MultiSelect>
          <MultiSelect
            value={selectedLanguages}
            onValueChange={setSelectedLanguages}
            placeholder="Language"
          >
            {allLanguages.map((l) => (
              <MultiSelectItem key={l} value={l}>
                {l}
              </MultiSelectItem>
            ))}
          </MultiSelect>
        </div>
      </Card>

      <Card>
        <Title>Total royalty by book &amp; language</Title>
        <div className="mt-4 overflow-x-auto">
          <div style={{ minWidth: `${Math.max(bookBarSeries.data.length * 100, 500)}px` }}>
            <BarChart
              className="h-72"
              data={bookBarSeries.data}
              index="book"
              categories={bookBarSeries.languages}
              valueFormatter={fmtUSD}
              stack
              showLegend
              showAnimation
              yAxisWidth={64}
              noDataText="No sales in this range / filter combo"
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <Title>Royalty by {granularity} — book &amp; language</Title>
          <GranularityToggle value={granularity} onChange={setGranularity} />
        </div>
        {filteredCombos.length > MAX_BOOK_LANG_COMBOS && (
          <Text className="mt-1 text-xs text-amber-600">
            Showing {MAX_BOOK_LANG_COMBOS} of {filteredCombos.length} combos — narrow your filters to see all.
          </Text>
        )}
        <LineChart
          className="mt-4 h-80"
          data={bookLangSeries.data}
          index="date"
          categories={bookLangSeries.categories}
          valueFormatter={fmtUSD}
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
