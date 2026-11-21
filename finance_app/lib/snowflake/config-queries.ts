import { execute } from './client';
import type {
  ConfigAuditDpRun,
  ConfigBook,
  ConfigBookVersion,
  ConfigCrosswalk,
  ConfigForexRate,
  ConfigKenpRate,
  ConfigMarketplace,
  ConfigSourceTableInfo,
} from '@/lib/types/config';

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

function toStr(v: unknown): string {
  return v == null ? '' : String(v);
}

export async function getConfigBooks(): Promise<ConfigBook[]> {
  const rows = await execute<Record<string, unknown>>(
    'SELECT BOOK_SID, TITLE, SERIES, SERIES_NO, IS_SET FROM CONFIG.BOOKS ORDER BY BOOK_SID',
  );
  return rows.map((r) => ({
    bookSid: toNum(r.BOOK_SID),
    title: toStr(r.TITLE),
    series: r.SERIES == null ? null : toStr(r.SERIES),
    seriesNo: r.SERIES_NO == null ? null : toNum(r.SERIES_NO),
    isSet: toBool(r.IS_SET),
  }));
}

export async function getConfigBookVersions(): Promise<ConfigBookVersion[]> {
  const rows = await execute<Record<string, unknown>>(
    `SELECT BOOK_VERSION_SID, BOOK_SID, BOOK_TITLE, BOOK_VERSION_UNIQUE_ID,
            BOOK_VERSION_UNIQUE_ID_TYPE, VERSION_TITLE, VERSION_TYPE, VERSION_LANGUAGE
     FROM CONFIG.BOOK_VERSIONS
     ORDER BY BOOK_SID, BOOK_VERSION_UNIQUE_ID_TYPE, BOOK_VERSION_UNIQUE_ID`,
  );
  return rows.map((r) => ({
    bookVersionSid: toNum(r.BOOK_VERSION_SID),
    bookSid: toNum(r.BOOK_SID),
    bookTitle: toStr(r.BOOK_TITLE),
    bookVersionUniqueId: toStr(r.BOOK_VERSION_UNIQUE_ID),
    bookVersionUniqueIdType: toStr(r.BOOK_VERSION_UNIQUE_ID_TYPE),
    versionTitle: toStr(r.VERSION_TITLE),
    versionType: toStr(r.VERSION_TYPE),
    versionLanguage: toStr(r.VERSION_LANGUAGE),
  }));
}

export async function getConfigMarketplaces(): Promise<ConfigMarketplace[]> {
  const rows = await execute<Record<string, unknown>>(
    'SELECT AMAZON_NAME, COUNTRY, CURRENCY FROM CONFIG.MARKETPLACES ORDER BY COUNTRY',
  );
  return rows.map((r) => ({
    amazonName: toStr(r.AMAZON_NAME),
    country: toStr(r.COUNTRY),
    currency: toStr(r.CURRENCY),
  }));
}

export async function getConfigKenpRates(): Promise<ConfigKenpRate[]> {
  const rows = await execute<Record<string, unknown>>(
    `SELECT MONTH_BEGIN_DATE, COUNTRY, KENP_RATE, IS_FINAL
     FROM CONFIG.KENP_RATES
     ORDER BY MONTH_BEGIN_DATE DESC, COUNTRY`,
  );
  return rows.map((r) => ({
    monthBeginDate: r.MONTH_BEGIN_DATE instanceof Date
      ? r.MONTH_BEGIN_DATE.toISOString().slice(0, 10)
      : toStr(r.MONTH_BEGIN_DATE).slice(0, 10),
    country: toStr(r.COUNTRY),
    kenpRate: r.KENP_RATE == null ? null : toNum(r.KENP_RATE),
    isFinal: toBool(r.IS_FINAL),
  }));
}

export async function getConfigForexRates(): Promise<ConfigForexRate[]> {
  const rows = await execute<Record<string, unknown>>(
    `SELECT MONTH_BEGIN_DATE, SOURCE_CURRENCY, TARGET_CURRENCY, EXCHANGE_RATE, IS_FINAL
     FROM CONFIG.FOREX_RATES
     ORDER BY MONTH_BEGIN_DATE DESC, SOURCE_CURRENCY`,
  );
  return rows.map((r) => ({
    monthBeginDate: r.MONTH_BEGIN_DATE instanceof Date
      ? r.MONTH_BEGIN_DATE.toISOString().slice(0, 10)
      : toStr(r.MONTH_BEGIN_DATE).slice(0, 10),
    sourceCurrency: toStr(r.SOURCE_CURRENCY),
    targetCurrency: toStr(r.TARGET_CURRENCY),
    exchangeRate: toNum(r.EXCHANGE_RATE),
    isFinal: toBool(r.IS_FINAL),
  }));
}

export async function getConfigCrosswalk(): Promise<ConfigCrosswalk[]> {
  const rows = await execute<Record<string, unknown>>(
    `SELECT RAW_TABLE_NAME, RAW_COLUMN_NUMBER, RAW_COLUMN_NAME,
            TARGET_TABLE_NAME, TARGET_COLUMN_NAME, TARGET_DATA_TYPE
     FROM CONFIG.CROSSWALK
     ORDER BY RAW_TABLE_NAME, RAW_COLUMN_NUMBER`,
  );
  return rows.map((r) => ({
    rawTableName: toStr(r.RAW_TABLE_NAME),
    rawColumnNumber: toNum(r.RAW_COLUMN_NUMBER),
    rawColumnName: toStr(r.RAW_COLUMN_NAME),
    targetTableName: toStr(r.TARGET_TABLE_NAME),
    targetColumnName: toStr(r.TARGET_COLUMN_NAME),
    targetDataType: toStr(r.TARGET_DATA_TYPE),
  }));
}

export async function getConfigSourceTableInfo(): Promise<ConfigSourceTableInfo[]> {
  const rows = await execute<Record<string, unknown>>(
    `SELECT RAW_TABLE_NAME, TARGET_TABLE_NAME, S3_STAGE_NAME,
            FILE_FORMAT_NAME, COPY_TO_S3_PROC_CALL, MERGE_TO_TARGET_PROC_CALL
     FROM CONFIG.SOURCE_TABLE_INFO
     ORDER BY RAW_TABLE_NAME`,
  );
  return rows.map((r) => ({
    rawTableName: toStr(r.RAW_TABLE_NAME),
    targetTableName: toStr(r.TARGET_TABLE_NAME),
    s3StageName: toStr(r.S3_STAGE_NAME),
    fileFormatName: toStr(r.FILE_FORMAT_NAME),
    copyToS3ProcCall: toStr(r.COPY_TO_S3_PROC_CALL),
    mergeToTargetProcCall: toStr(r.MERGE_TO_TARGET_PROC_CALL),
  }));
}

export async function getConfigAuditDpRuns(): Promise<ConfigAuditDpRun[]> {
  const rows = await execute<Record<string, unknown>>(
    `SELECT DP_RUN_ID, START_DT, END_DT, STATUS
     FROM CONFIG.AUDIT_DP_RUNS
     ORDER BY START_DT DESC
     LIMIT 50`,
  );
  return rows.map((r) => ({
    dpRunId: toStr(r.DP_RUN_ID),
    startDt: toStr(r.START_DT),
    endDt: r.END_DT == null ? null : toStr(r.END_DT),
    status: toStr(r.STATUS),
  }));
}
