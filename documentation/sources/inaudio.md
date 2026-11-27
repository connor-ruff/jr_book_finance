# InAudio

> Part of the refresh process described in [general_refresh_process.md](../general_refresh_process.md). This page holds everything that is specific to this source.

InAudio audiobook royalty reports.

## At a Glance

| | |
|---|---|
| Script argument | `inaud` |
| Download from | https://voices.inaudio.com/reporting/royalty-reports -> "Royalty Reports" |
| Cadence | Monthly; typically available **2-3 months** after month end |
| File type | Excel (`.xlsx`), converted to CSV by the lambda |
| Sheets converted | All except `Summary` |
| Raw table | `RAW.INAUD_ROYALTY_REPORT_ALL_TABS_STAGE` |
| Target table | `INAUD.ROYALTY_REPORT_ALL_TABS` |
| Merge key | `DP_SOURCE_FILE_MONTH`, parsed from the file name |

## File Nuances

- Download only the not-yet-loaded months. Re-staging a loaded month is safe: that month is deleted and replaced.
- **The month is parsed from the file name with a regex. Do not rename the files.** Names look like `.../library/Jenifer Ruff (2026-08 Royalty)-library.csv` and `.../pool/Jenifer Ruff (2026-01 Royalty)-pool.csv`; the month is the `YYYY-MM` inside `(YYYY-MM Royalty)`.
- Each month has a **library** and a **pool** sheet/file; both land in the same table and are staged together.
- The reports are assumed to be in USD (QC check 10 will tell you if that changes).

## S3 / Upload

- Upload prefix (Excel): `books/inaud/excel_stage/`
- Converted CSVs land in: `books/inaud/csv_stage/`
- Upload: `./upload-all-from-downloads.sh inaud`
- Convert: `./invoke-csv-converter-lambda.sh inaud` (payload: `refresh_helpers/excel-to-csv-lambda-payloads/inaud-payload.json`)

## Step 1: Check the Most-Recently Loaded Date

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

SELECT MAX(DP_SOURCE_FILE_MONTH) FROM INAUD.ROYALTY_REPORT_ALL_TABS;
```

## Step 4: Run the Snowflake Pipeline

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.INAUD_ROYALTY_REPORT_ALL_TABS_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('INAUD.ROYALTY_REPORT_ALL_TABS');
```

## Step 5: Update Dimensions

Find ISBNs that aren't in `CONFIG.BOOK_VERSIONS` yet, then paste the results into the DML builder (Google Drive) and fill in values:

```sql
WITH VERSIONS AS (
    SELECT
        ISBN,
        TITLE
    FROM INAUD.ROYALTY_REPORT_ALL_TABS I
    LEFT JOIN CONFIG.BOOK_VERSIONS BV ON I.ISBN = BV.BOOK_VERSION_UNIQUE_ID
    WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
    GROUP BY ALL
)
SELECT *, COUNT(*) OVER (PARTITION BY ISBN) AS ISBN_COUNT
FROM VERSIONS
ORDER BY 1,2;
```

## Step 6: Pre-Report QC Checks

These run automatically as part of `CALL RPT.BUILD_ALL_REPORTS();` (they live in `CONFIG.PRE_REPORT_REBUILD_CHECKS`). Each must return one row with `PASS_TEST = TRUE`. Run any of them by hand to see why a check fails (change `COUNT(*) = 0 AS PASS_TEST` to `*` to list the offending rows).

### Check 9: `INAUDIO_BOOK_VERSIONS`

- **Verifies:** All ISBN values across INAUD.ROYALTY_REPORT_ALL_TABS have corresponding entries in CONFIG.BOOK_VERSIONS.
- **Why it matters:** Unmatched rows would show up in reports with no book, version type or language.

```sql
WITH VERSIONS AS (
    SELECT 
        ISBN, 
        TITLE
    FROM INAUD.ROYALTY_REPORT_ALL_TABS I 
    LEFT JOIN CONFIG.BOOK_VERSIONS BV ON I.ISBN = BV.BOOK_VERSION_UNIQUE_ID
    WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
    GROUP BY ALL 
)
SELECT
    COUNT(*) = 0 AS PASS_TEST
FROM VERSIONS
;
```

### Check 10: `INAUDIO_CURRENCY_ASSURANCE`

- **Verifies:** All currencies used in the Inaudio royalty reports is USD
- **Why it matters:** We are assuming that all royalties are reported in USD, if this assumption changes, we need to know.

```sql
SELECT 
    COUNT(*) = 0 AS PASS_TEST
FROM INAUD.ROYALTY_REPORT_ALL_TABS
WHERE NVL(ROYALTY_PAYABLE_CURRENCY, '') <> 'USD'
```
