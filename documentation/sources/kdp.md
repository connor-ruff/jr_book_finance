# KDP (Kindle Direct Publishing)

> Part of the refresh process described in [general_refresh_process.md](../general_refresh_process.md). This page holds everything that is specific to this source.

Amazon KDP royalties: print and ebook sales (Combined Sales) and Kindle Edition Normalized Pages read (KENP).

## At a Glance

| | |
|---|---|
| Script argument | `kdp` |
| Download from | https://kdpreports.amazon.com/dashboard -> "Orders" |
| Cadence | Daily data, with a lag of a few days |
| File type | Excel (`.xlsx`), converted to CSV by the lambda |
| Sheets converted | `Combined Sales`, `KENP` |
| Raw tables | `RAW.KDP_COMBINED_SALES_STAGE`, `RAW.KDP_KENP_STAGE` |
| Target tables | `KDP.COMBINED_SALES`, `KDP.KENP` |
| Merge key | `ROYALTY_DATE` (sales) / `KENP_DATE` (KENP), taken from the data itself |

## File Nuances

- Reports can be downloaded across any custom date range. Keep each downloaded report to roughly **1 month max**.
- **Download from the last loaded royalty date through today, with a 3-4 day overlap** to pick up lagged royalties. The merge is safe to overlap: for every royalty date present in the new batch, all existing rows for that date are deleted and replaced.
- Unlike the other sources, the date is read from a column in the data, not parsed from the file name.

## S3 / Upload

- Upload prefix (Excel): `books/kdp/excel_stage/`
- Converted CSVs land in: `books/kdp/csv_stage/` (the two sheets are staged separately for the two raw tables)
- Upload: `./upload-all-from-downloads.sh kdp`
- Convert: `./invoke-csv-converter-lambda.sh kdp` (payload: `refresh_helpers/excel-to-csv-lambda-payloads/kdp-payload.json`)

## Step 1: Check the Most-Recently Loaded Date

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

SELECT MAX(ROYALTY_DATE) FROM KDP.COMBINED_SALES;
SELECT MAX(KENP_DATE)    FROM KDP.KENP;
```

## Step 4: Run the Snowflake Pipeline

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.KDP_COMBINED_SALES_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.KDP_KENP_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('KDP.COMBINED_SALES');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('KDP.KENP');
```

## Step 5: Update Dimensions

No new-book query is documented for KDP. Missing book versions, forex rates, marketplaces and KENP rates are caught by the QC checks below; fix them in the dimension files listed in the general process doc (`book_versions.sql`, `forex_rates.sql`, `kenp_rates.sql`).

## Step 6: Pre-Report QC Checks

These run automatically as part of `CALL RPT.BUILD_ALL_REPORTS();` (they live in `CONFIG.PRE_REPORT_REBUILD_CHECKS`). Each must return one row with `PASS_TEST = TRUE`. Run any of them by hand to see why a check fails (change `COUNT(*) = 0 AS PASS_TEST` to `*` to list the offending rows).

### Check 1: `KDP_COMBINED_SALES_BOOK_VERSIONS`

- **Verifies:** Every KDP.COMBINED_SALES row has a matching CONFIG.BOOK_VERSIONS entry (ASIN_ISBN = BOOK_VERSION_UNIQUE_ID).
- **Why it matters:** Unmatched rows would show up in reports with no book, version type or language.

```sql
SELECT COUNT(*) = 0 AS PASS_TEST
FROM BOOKS.KDP.COMBINED_SALES CS
WHERE NOT EXISTS (
    SELECT 1
    FROM BOOKS.CONFIG.BOOK_VERSIONS BV
    WHERE BV.BOOK_VERSION_UNIQUE_ID = CS.ASIN_ISBN
)
```

### Check 2: `KDP_COMBINED_SALES_FOREX_RATES`

- **Verifies:** Every KDP.COMBINED_SALES row has a CONFIG.FOREX_RATES entry for its currency and royalty month.
- **Why it matters:** Without a rate, ROYALTY_IN_USD is NULL and revenue is silently understated.

```sql
SELECT COUNT(*) = 0 AS PASS_TEST
FROM BOOKS.KDP.COMBINED_SALES CS
WHERE NOT EXISTS (
    SELECT 1
    FROM BOOKS.CONFIG.FOREX_RATES FOREX
    WHERE FOREX.SOURCE_CURRENCY  = CS.CURRENCY
      AND FOREX.MONTH_BEGIN_DATE = DATE_TRUNC('MONTH', CS.ROYALTY_DATE)
)
```

### Check 3: `KDP_KENP_BOOK_VERSIONS`

- **Verifies:** Every KDP.KENP row has a matching CONFIG.BOOK_VERSIONS entry (EBOOK_ASIN = BOOK_VERSION_UNIQUE_ID).
- **Why it matters:** Unmatched rows would show up in reports with no book, version type or language.

```sql
SELECT COUNT(*) = 0 AS PASS_TEST
FROM BOOKS.KDP.KENP K
WHERE NOT EXISTS (
    SELECT 1
    FROM BOOKS.CONFIG.BOOK_VERSIONS BV
    WHERE BV.BOOK_VERSION_UNIQUE_ID = K.EBOOK_ASIN
)
```

### Check 4: `KDP_KENP_MARKETPLACES`

- **Verifies:** Every KDP.KENP row has a matching CONFIG.MARKETPLACES entry (MARKETPLACE = AMAZON_NAME).
- **Why it matters:** The marketplace supplies the country and currency used to look up KENP rates and forex rates; without it KENP revenue is NULL.

```sql
SELECT COUNT(*) = 0 AS PASS_TEST
FROM BOOKS.KDP.KENP K
WHERE NOT EXISTS (
    SELECT 1
    FROM BOOKS.CONFIG.MARKETPLACES M
    WHERE M.AMAZON_NAME = K.MARKETPLACE
)
```

### Check 5: `KDP_KENP_KENP_RATES`

- **Verifies:** Every KDP.KENP row has a CONFIG.KENP_RATES entry for its marketplace country and KENP month.
- **Why it matters:** Without a KENP rate, page reads cannot be converted to royalty and KENP revenue is NULL.

```sql
SELECT COUNT(*) = 0 AS PASS_TEST
FROM BOOKS.KDP.KENP K
INNER JOIN BOOKS.CONFIG.MARKETPLACES M ON M.AMAZON_NAME = K.MARKETPLACE
WHERE NOT EXISTS (
    SELECT 1
    FROM BOOKS.CONFIG.KENP_RATES KR
    WHERE KR.COUNTRY          = M.COUNTRY
      AND KR.MONTH_BEGIN_DATE = DATE_TRUNC('MONTH', K.KENP_DATE)
)
```

### Check 6: `KDP_KENP_FOREX_RATES`

- **Verifies:** Every KDP.KENP row has a CONFIG.FOREX_RATES entry for its marketplace currency and KENP month.
- **Why it matters:** Without a rate, KENP ROYALTY_IN_USD is NULL and revenue is silently understated.

```sql
SELECT COUNT(*) = 0 AS PASS_TEST
FROM BOOKS.KDP.KENP K
INNER JOIN BOOKS.CONFIG.MARKETPLACES M ON M.AMAZON_NAME = K.MARKETPLACE
WHERE NOT EXISTS (
    SELECT 1
    FROM BOOKS.CONFIG.FOREX_RATES FR
    WHERE FR.SOURCE_CURRENCY  = M.CURRENCY
      AND FR.MONTH_BEGIN_DATE = DATE_TRUNC('MONTH', K.KENP_DATE)
)
```
