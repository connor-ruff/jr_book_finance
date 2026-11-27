# Spotify Royalty Reports

> Part of the refresh process described in [general_refresh_process.md](../general_refresh_process.md). This page holds everything that is specific to this source.

Spotify audiobook royalty reports. (Listener/insights data is a separate source: see [spotify_listeners.md](spotify_listeners.md).)

## At a Glance

| | |
|---|---|
| Script argument | `spot-royalty` |
| Download from | Spotify Authors -> "Royalty Reports" |
| Cadence | Monthly; typically available **2-3 months** after month end |
| File type | Excel (`.xlsx`), converted to CSV by the lambda |
| Sheets converted | All except `Summary` |
| Raw table | `RAW.SPOT_ROYALTY_REPORT_ALL_TABS_STAGE` |
| Target table | `SPOT.ROYALTY_REPORT_ALL_TABS` |
| Merge key | `DP_SOURCE_FILE_MONTH`, parsed from the file name |

## File Nuances

- Download only the not-yet-loaded months. Re-staging a loaded month is safe: that month is deleted and replaced.
- **The month is parsed from the file name with a regex. Do not rename the files.** Names look like `.../retail/Jenifer Ruff - Digital Royalty - March 2026-retail.csv`; the month is the `<Month name> <YYYY>` after `Royalty - `.
- All files for a month land in the same table, so stage them together.
- The reports are assumed to be in USD (QC check 12 will tell you if that changes).
- Books are identified by `DISPLAY_NUMBER` (not ISBN) when matching to `CONFIG.BOOK_VERSIONS`.
- In the daily sales report, Spotify royalties are aggregated by quarter and spread across the days of the quarter.

## S3 / Upload

- Upload prefix (Excel): `books/spot/royalty/excel_stage/`
- Converted CSVs land in: `books/spot/royalty/csv_stage/`
- Upload: `./upload-all-from-downloads.sh spot-royalty`
- Convert: `./invoke-csv-converter-lambda.sh spot-royalty` (payload: `refresh_helpers/excel-to-csv-lambda-payloads/spot-royalty-payload.json`)

## Step 1: Check the Most-Recently Loaded Date

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

SELECT MAX(DP_SOURCE_FILE_MONTH) FROM SPOT.ROYALTY_REPORT_ALL_TABS;
```

## Step 4: Run the Snowflake Pipeline

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.SPOT_ROYALTY_REPORT_ALL_TABS_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('SPOT.ROYALTY_REPORT_ALL_TABS');
```

## Step 5: Update Dimensions

Find display numbers that aren't in `CONFIG.BOOK_VERSIONS` yet, then paste the results into the DML builder (Google Drive) and fill in values:

```sql
WITH VERSIONS AS (
    SELECT
        DISPLAY_NUMBER,
        TITLE
    FROM SPOT.ROYALTY_REPORT_ALL_TABS I
    LEFT JOIN CONFIG.BOOK_VERSIONS BV ON I.DISPLAY_NUMBER = BV.BOOK_VERSION_UNIQUE_ID
    WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
    GROUP BY ALL
)
SELECT *, COUNT(*) OVER (PARTITION BY DISPLAY_NUMBER) AS ID_COUNT
FROM VERSIONS
ORDER BY 1,2;
```

## Step 6: Pre-Report QC Checks

These run automatically as part of `CALL RPT.BUILD_ALL_REPORTS();` (they live in `CONFIG.PRE_REPORT_REBUILD_CHECKS`). Each must return one row with `PASS_TEST = TRUE`. Run any of them by hand to see why a check fails (change `COUNT(*) = 0 AS PASS_TEST` to `*` to list the offending rows).

### Check 11: `SPOTIFY_BOOK_VERSIONS`

- **Verifies:** All ISBN values across SPOT.ROYALTY_REPORT_ALL_TABS have corresponding entries in CONFIG.BOOK_VERSIONS.
- **Why it matters:** Unmatched rows would show up in reports with no book, version type or language.

```sql
WITH VERSIONS AS (
    SELECT 
        DISPLAY_NUMBER, 
        TITLE
    FROM SPOT.ROYALTY_REPORT_ALL_TABS I 
    LEFT JOIN CONFIG.BOOK_VERSIONS BV ON I.DISPLAY_NUMBER = BV.BOOK_VERSION_UNIQUE_ID
    WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
    GROUP BY ALL 
)
SELECT
    COUNT(*) = 0 AS PASS_TEST
FROM VERSIONS
;
```

### Check 12: `SPOTIFY_CURRENCY_ASSURANCE`

- **Verifies:** All currencies used in the Spotify royalty reports is USD
- **Why it matters:** We are assuming that all royalties are reported in USD, if this assumption changes, we need to know.

```sql
SELECT 
    COUNT(*) = 0 AS PASS_TEST
FROM SPOT.ROYALTY_REPORT_ALL_TABS
WHERE NVL(ROYALTY_PAYABLE_CURRENCY, '') <> 'USD'
```
