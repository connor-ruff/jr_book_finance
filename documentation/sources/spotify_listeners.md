# Spotify Listener Reports

> Part of the refresh process described in [general_refresh_process.md](../general_refresh_process.md). This page holds everything that is specific to this source.

Spotify audiobook listener data ("Spotify Insights"), available as both monthly and weekly files. These are informational and not part of royalty revenue. (Royalties are a separate source: see [spotify_royalty.md](spotify_royalty.md).)

## At a Glance

| | |
|---|---|
| Script arguments | `spot-listeners-monthly`, `spot-listeners-weekly` |
| Download from | Spotify Authors -> "Spotify Insights" |
| Cadence | Monthly and weekly; available a few days after the period ends |
| File type | **Already CSV** - no lambda step |
| Raw tables | `RAW.SPOT_LISTENER_MONTHLY_REPORT_STAGE`, `RAW.SPOT_LISTENER_WEEKLY_REPORT_STAGE` |
| Target tables | `SPOT.LISTENER_MONTHLY_REPORT`, `SPOT.LISTENER_WEEKLY_REPORT` |
| Merge key | Monthly: `DP_SOURCE_FILE_MONTH`. Weekly: `DP_SOURCE_FILE_BEGIN_DATE`. Both parsed from the file name |

## File Nuances

- Download all monthly and weekly reports that haven't been loaded. Re-staging a loaded period is safe: that month/week is deleted and replaced.
- **The period is parsed from the file name with a regex. Do not rename the files.**
- **Monthly** files look like `monthly-20260201-00000-of-00001.csv`. The 8-digit `YYYYMMDD` is the **1st of the month after** the reporting month, so `20260201` is the **January** file (`DP_SOURCE_FILE_MONTH` = 2026-01-01).
- **Weekly** files look like `weekly-20261116-00000-of-00001.csv`. The date is the **Monday after** the reporting week (Mon-Sun), so `20261116` covers 2026-11-09 through 2026-11-15 (`DP_SOURCE_FILE_BEGIN_DATE` = file date - 7, `DP_SOURCE_FILE_END_DATE` = file date - 1).
- Upload the monthly and weekly files separately (they go to different stages).

## S3 / Upload

- Upload straight to the CSV stages (no lambda):
  - Monthly: `books/spot/monthly_listeners/csv_stage/` via `./upload-all-from-downloads.sh spot-listeners-monthly`
  - Weekly: `books/spot/weekly_listeners/csv_stage/` via `./upload-all-from-downloads.sh spot-listeners-weekly`

## Step 1: Check the Most-Recently Loaded Date

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

SELECT MAX(DP_SOURCE_FILE_MONTH)    FROM SPOT.LISTENER_MONTHLY_REPORT;
SELECT MAX(DP_SOURCE_FILE_END_DATE) FROM SPOT.LISTENER_WEEKLY_REPORT;
```

## Step 4: Run the Snowflake Pipeline

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.SPOT_LISTENER_MONTHLY_REPORT_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.SPOT_LISTENER_WEEKLY_REPORT_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('SPOT.LISTENER_MONTHLY_REPORT');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('SPOT.LISTENER_WEEKLY_REPORT');
```

## Step 5: Update Dimensions

None. Listener data doesn't feed any book-version or currency lookups.

## Step 6: Pre-Report QC Checks

_No pre-report checks are defined for this source yet._
