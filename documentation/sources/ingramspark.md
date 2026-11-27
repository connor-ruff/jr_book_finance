# IngramSpark

> Part of the refresh process described in [general_refresh_process.md](../general_refresh_process.md). This page holds everything that is specific to this source.

IngramSpark compensation reports. Four report types, each loaded to its own table.

## At a Glance

| Report | Script argument | Raw table | Target table |
|---|---|---|---|
| Wholesale POD (USD) | `ig-usd` | `RAW.IG_WHOLESALE_POD_USD_STAGE` | `IG.WHOLESALE_POD_USD` |
| Wholesale POD (AUD) | `ig-aud` | `RAW.IG_WHOLESALE_POD_AUD_STAGE` | `IG.WHOLESALE_POD_AUD` |
| Wholesale POD (GBP) | `ig-gbp` | `RAW.IG_WHOLESALE_POD_GBP_STAGE` | `IG.WHOLESALE_POD_GBP` |
| Global Connect (USD) | `ig-global` | `RAW.IG_GLOBAL_CONNECT_STAGE` | `IG.GLOBAL_CONNECT` |

| | |
|---|---|
| Download from | IngramSpark compensation reports |
| Cadence | Monthly |
| File type | `.xls` extension, but actually **tab-delimited text** - no lambda step |
| Merge key | `DP_SOURCE_FILE_MONTH`, taken from the `period_name` column inside the file |

## File Nuances

- **Four files per month:** `WholesalePODCompensationUSD-<MON>-<YY>.xls`, `WholesalePODCompensationAUD-...`, `WholesalePODCompensationGBP-...`, and `GlobalConnectCompensationUSD-...` (for example `WholesalePODCompensationUSD-OCT-26.xls`).
- **They are not Excel files.** Despite the `.xls` extension they are tab-delimited text with CRLF line endings. Leave them as downloaded and keep the original file names. Some (the USD wholesale ones) contain Windows-1252 characters such as the trademark sign, so they are loaded with the `CONFIG.TSV_SKIP_HEADER` file format (tab delimiter, 1 header row, `WINDOWS1252` encoding).
- **The month comes from the data, not the file name.** The `period_name` column holds values like `'JAN-26` (with a leading apostrophe added by the export). The crosswalk strips the apostrophe and parses it as `DD-MON-YY` for the first of that month.
- `NONRETURNABLE_DATE` is in `DD-MON-YY` form (e.g. `06-OCT-23`) and is usually blank; the crosswalk has custom logic for it. `CANCELLED_DATE` is currently always blank.
- Some numeric columns (for example `MTD_return_charge_tax` / `YTD_return_charge_tax`) contain a single space. The general merge treats blank or whitespace-only numeric and date cells as NULL.
- Each report only contains one currency (`reporting_currency_code`), and that is what is converted to USD in the daily sales report.

## S3 / Upload

- No Excel conversion. Upload straight to the CSV stages. Put **only one report type's files in `~/Downloads` at a time** and run the matching script:

| Report | Command | S3 location |
|---|---|---|
| Wholesale POD (USD) | `./upload-all-from-downloads.sh ig-usd` | `books/ig/wholesale_pod_usd/csv_stage/` |
| Wholesale POD (AUD) | `./upload-all-from-downloads.sh ig-aud` | `books/ig/wholesale_pod_aud/csv_stage/` |
| Wholesale POD (GBP) | `./upload-all-from-downloads.sh ig-gbp` | `books/ig/wholesale_pod_gbp/csv_stage/` |
| Global Connect (USD) | `./upload-all-from-downloads.sh ig-global` | `books/ig/global_connect/csv_stage/` |

## Step 1: Check the Most-Recently Loaded Date

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

SELECT MAX(DP_SOURCE_FILE_MONTH) FROM IG.WHOLESALE_POD_USD;
SELECT MAX(DP_SOURCE_FILE_MONTH) FROM IG.WHOLESALE_POD_AUD;
SELECT MAX(DP_SOURCE_FILE_MONTH) FROM IG.WHOLESALE_POD_GBP;
SELECT MAX(DP_SOURCE_FILE_MONTH) FROM IG.GLOBAL_CONNECT;
```

## Step 4: Run the Snowflake Pipeline

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.IG_WHOLESALE_POD_USD_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.IG_WHOLESALE_POD_AUD_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.IG_WHOLESALE_POD_GBP_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.IG_GLOBAL_CONNECT_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('IG.WHOLESALE_POD_USD');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('IG.WHOLESALE_POD_AUD');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('IG.WHOLESALE_POD_GBP');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('IG.GLOBAL_CONNECT');
```

## Step 5: Update Dimensions

Find ISBNs (`ISBN_13`) that aren't in `CONFIG.BOOK_VERSIONS` yet, across all four tables, then paste the results into the DML builder (Google Drive) and fill in values. `title_versions` above 1 means the same ISBN appears under more than one title.

```sql
WITH IDS AS (
    SELECT ISBN_13, TITLE FROM IG.WHOLESALE_POD_USD GROUP BY ALL
    UNION ALL
    SELECT ISBN_13, TITLE FROM IG.WHOLESALE_POD_AUD GROUP BY ALL
    UNION ALL
    SELECT ISBN_13, TITLE FROM IG.WHOLESALE_POD_GBP GROUP BY ALL
    UNION ALL
    SELECT ISBN_13, TITLE FROM IG.GLOBAL_CONNECT GROUP BY ALL
),
CONDENSED AS (
    SELECT
        ISBN_13,
        TITLE,
        COUNT(DISTINCT TITLE) OVER (PARTITION BY ISBN_13) AS title_versions
    FROM IDS
    GROUP BY ISBN_13, TITLE
)
SELECT C.*
FROM CONDENSED C
LEFT JOIN CONFIG.BOOK_VERSIONS BV
    ON C.ISBN_13 = BV.BOOK_VERSION_UNIQUE_ID
WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
ORDER BY 1;
```

## Step 6: Pre-Report QC Checks

These run automatically as part of `CALL RPT.BUILD_ALL_REPORTS();` (they live in `CONFIG.PRE_REPORT_REBUILD_CHECKS`). Each must return one row with `PASS_TEST = TRUE`. Run any of them by hand to see why a check fails (change `COUNT(*) = 0 AS PASS_TEST` to `*` to list the offending rows).

### Check 13: `IG_BOOK_VERSIONS`

- **Verifies:** Every row across the IG tables (WHOLESALE_POD_USD/AUD/GBP and GLOBAL_CONNECT) has a matching CONFIG.BOOK_VERSIONS entry (ISBN_13 = BOOK_VERSION_UNIQUE_ID).
- **Why it matters:** Unmatched rows would show up in reports with no book, version type or language.

```sql
WITH IDS AS (
    SELECT
        ISBN_13,
        TITLE
    FROM IG.WHOLESALE_POD_USD
    GROUP BY ALL
    UNION ALL
    SELECT
        ISBN_13,
        TITLE
    FROM IG.WHOLESALE_POD_AUD
    GROUP BY ALL
    UNION ALL
    SELECT
        ISBN_13,
        TITLE
    FROM IG.WHOLESALE_POD_GBP
    GROUP BY ALL
    UNION ALL
    SELECT
        ISBN_13,
        TITLE
    FROM IG.GLOBAL_CONNECT
    GROUP BY ALL
),
CONDENSED AS (
    SELECT
        ISBN_13,
        COUNT(DISTINCT TITLE) AS title_versions
    FROM IDS
    GROUP BY ISBN_13
)
SELECT COUNT(*) = 0 AS PASS_TEST
FROM CONDENSED C
LEFT JOIN CONFIG.BOOK_VERSIONS BV
ON C.ISBN_13 = BV.BOOK_VERSION_UNIQUE_ID
WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
;
```

### Check 14: `IG_FOREX_RATES`

- **Verifies:** Every row across the IG tables has a CONFIG.FOREX_RATES entry for its REPORTING_CURRENCY_CODE and DP_SOURCE_FILE_MONTH.
- **Why it matters:** Without a rate, royalties cannot be converted to USD and revenue is silently understated.

```sql
WITH ALL_ENTRIES AS (
    SELECT REPORTING_CURRENCY_CODE, DP_SOURCE_FILE_MONTH FROM BOOKS.IG.WHOLESALE_POD_USD
    UNION ALL
    SELECT REPORTING_CURRENCY_CODE, DP_SOURCE_FILE_MONTH FROM BOOKS.IG.WHOLESALE_POD_AUD
    UNION ALL
    SELECT REPORTING_CURRENCY_CODE, DP_SOURCE_FILE_MONTH FROM BOOKS.IG.WHOLESALE_POD_GBP
    UNION ALL
    SELECT REPORTING_CURRENCY_CODE, DP_SOURCE_FILE_MONTH FROM BOOKS.IG.GLOBAL_CONNECT
)
SELECT COUNT(*) = 0 AS PASS_TEST
FROM ALL_ENTRIES AE
WHERE NOT EXISTS (
    SELECT 1
    FROM BOOKS.CONFIG.FOREX_RATES FOREX
    WHERE FOREX.SOURCE_CURRENCY  = AE.REPORTING_CURRENCY_CODE
      AND FOREX.MONTH_BEGIN_DATE = DATE_TRUNC('MONTH', AE.DP_SOURCE_FILE_MONTH)
)
```
