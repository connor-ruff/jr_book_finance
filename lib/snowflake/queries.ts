import { execute } from './client';
import type { DailySaleRow } from '@/lib/types/reports';

type RawDailyRow = {
  BOOK_SID: string;
  BOOK_VERSION_SID: string;
  BOOK_TITLE: string;
  SALE_SOURCE: string;
  VERSION_TYPE: string;
  VERSION_LANGUAGE: string;
  MARKETPLACE: string;
  ROYALTY_DATE: string | Date;
  ROYALTY_IN_USD: number | string | null;
  NET_UNITS_SOLD: number | string | null;
  PAGE_READS: number | string | null;
};

function toIsoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

export async function getDailySales(opts: {
  from: string; // YYYY-MM-DD inclusive
  to: string;   // YYYY-MM-DD inclusive
}): Promise<DailySaleRow[]> {
  const sql = `
    SELECT
      BOOK_SID,
      BOOK_VERSION_SID,
      BOOK_TITLE,
      SALE_SOURCE,
      VERSION_TYPE,
      VERSION_LANGUAGE,
      MARKETPLACE,
      ROYALTY_DATE,
      ROYALTY_IN_USD,
      NET_UNITS_SOLD,
      PAGE_READS
    FROM RPT.DAILY_SALES_REPORT
    WHERE ROYALTY_DATE BETWEEN TO_DATE(:1) AND TO_DATE(:2)
    ORDER BY ROYALTY_DATE ASC
  `;
  const rows = await execute<RawDailyRow>(sql, [opts.from, opts.to]);
  return rows.map((r) => ({
    bookSid: r.BOOK_SID,
    bookVersionSid: r.BOOK_VERSION_SID,
    bookTitle: r.BOOK_TITLE,
    saleSource: r.SALE_SOURCE,
    versionType: r.VERSION_TYPE,
    versionLanguage: r.VERSION_LANGUAGE,
    marketplace: r.MARKETPLACE,
    royaltyDate: toIsoDate(r.ROYALTY_DATE),
    royaltyUsd: toNumber(r.ROYALTY_IN_USD),
    netUnitsSold: toNumber(r.NET_UNITS_SOLD),
    pageReads: toNumber(r.PAGE_READS),
  }));
}
