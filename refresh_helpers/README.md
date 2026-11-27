# How to Refresh Source Data (All Sources)

One unified process for refreshing every data source. All scripts live in this folder (`refresh_helpers/`) and
all Snowflake work goes through two generic procs in `BOOKS.CONFIG`:

- `CONFIG.COPY_S3_TO_RAW_GENERAL('<raw table>')` - loads staged CSVs from S3 into the RAW table
- `CONFIG.MERGE_RAW_TO_FINAL_GENERAL('<target table>')` - transforms RAW into the final table and replaces any overlapping data

Both are driven by config tables (`CONFIG.SOURCE_TABLE_INFO` and `CONFIG.CROSSWALK`), so adding a source is a config change rather than a new proc.

## Sources at a Glance

| Source | `<source>` arg (scripts) | Excel -> CSV lambda? | Raw table(s) | Target table(s) | Merge key |
|---|---|---|---|---|---|
| KDP | `kdp` | Yes | `RAW.KDP_COMBINED_SALES_STAGE`, `RAW.KDP_KENP_STAGE` | `KDP.COMBINED_SALES`, `KDP.KENP` | `ROYALTY_DATE` / `KENP_DATE` (from the data) |
| ACX | `acx` | Yes | `RAW.ACX_SALES_DETAIL_MEMBER_VALUE_STAGE`, `RAW.ACX_SALES_DETAIL_NET_SALES_STAGE`, `RAW.ACX_SUMMARY_STAGE`, `RAW.ACX_ADJUSTMENTS_STAGE` | `ACX.SALES_DETAIL_MEMBER_VALUE`, `ACX.SALES_DETAIL_NET_SALES`, `ACX.SUMMARY`, `ACX.ADJUSTMENTS` | `DP_SOURCE_FILE_MONTH` (from file name) |
| InAudio | `inaud` | Yes | `RAW.INAUD_ROYALTY_REPORT_ALL_TABS_STAGE` | `INAUD.ROYALTY_REPORT_ALL_TABS` | `DP_SOURCE_FILE_MONTH` (from file name) |
| Spotify royalty | `spot-royalty` | Yes | `RAW.SPOT_ROYALTY_REPORT_ALL_TABS_STAGE` | `SPOT.ROYALTY_REPORT_ALL_TABS` | `DP_SOURCE_FILE_MONTH` (from file name) |
| Spotify listeners (monthly) | `spot-listeners-monthly` | No (already CSV) | `RAW.SPOT_LISTENER_MONTHLY_REPORT_STAGE` | `SPOT.LISTENER_MONTHLY_REPORT` | `DP_SOURCE_FILE_MONTH` (from file name) |
| Spotify listeners (weekly) | `spot-listeners-weekly` | No (already CSV) | `RAW.SPOT_LISTENER_WEEKLY_REPORT_STAGE` | `SPOT.LISTENER_WEEKLY_REPORT` | `DP_SOURCE_FILE_BEGIN_DATE` (from file name) |
| IngramSpark | _not wired up yet_ | - | `RAW.IG_*_STAGE` | `IG.*` | _in development_ |

**Important - file names matter.** For every source except KDP, the month (or week) a file belongs to is parsed out of the
file name with a regex (defined in `CONFIG.CROSSWALK.CUSTOM_TRANSFORMATION_LOGIC`). **Do not rename files after downloading them.**
If a name can't be parsed, the merge fails before anything in the target table is changed.

## The Refresh Methodology (same for every source)

1. Check what has already been loaded
2. Download only the not-yet-loaded reports from the source (KDP: include a 3-4 day overlap to pick up lagged royalties)
3. Upload the files to S3, convert Excel to CSV where needed
4. Copy S3 -> RAW, then merge RAW -> final
5. Update any dimension tables (new books / versions, etc.)
6. Rebuild the reports

The merge is safe to re-run: for every merge key present in the new batch (a royalty date, file month, or file week),
existing rows for that key are deleted and replaced with the new rows. So accidentally re-staging an already-loaded file
will not duplicate data.

How `MERGE_RAW_TO_FINAL_GENERAL` works:
1. Transforms RAW rows (per the crosswalk) into a temp table with the exact structure of the target table. **Any bad value / unparseable file name errors here, before the target is touched.**
2. In a single transaction, deletes target rows whose key appears in the temp table, then inserts the temp table rows. Any error rolls back.
3. Returns `SUCCESS: Deleted X row(s), inserted Y row(s) ...` or `ERROR: ...`

## Step 1: Check the Most-Recently Loaded Date

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

SELECT MAX(ROYALTY_DATE)                FROM KDP.COMBINED_SALES;            -- KDP
SELECT MAX(DP_SOURCE_FILE_MONTH)        FROM ACX.SUMMARY;                   -- ACX
SELECT MAX(DP_SOURCE_FILE_MONTH)        FROM INAUD.ROYALTY_REPORT_ALL_TABS; -- InAudio
SELECT MAX(DP_SOURCE_FILE_MONTH)        FROM SPOT.ROYALTY_REPORT_ALL_TABS;  -- Spotify royalty
SELECT MAX(DP_SOURCE_FILE_MONTH)        FROM SPOT.LISTENER_MONTHLY_REPORT;  -- Spotify listeners (monthly)
SELECT MAX(DP_SOURCE_FILE_END_DATE)     FROM SPOT.LISTENER_WEEKLY_REPORT;   -- Spotify listeners (weekly)
```

## Step 2: Download the Reports

Download all not-yet-loaded reports, **without renaming them**, into your `~/Downloads` folder (the upload script reads from there - see Step 3).

| Source | Where | Notes |
|---|---|---|
| KDP | https://kdpreports.amazon.com/dashboard -> "Orders" | Daily data with a few days of lag. Download from the last loaded royalty date through today, **with a 3-4 day overlap**. Keep each report to ~1 month max. |
| ACX | https://www.acx.com/dashboard -> "Earning Statements" | Monthly; a month's file is available about a week after month end. |
| InAudio | https://voices.inaudio.com/reporting/royalty-reports -> "Royalty Reports" | Monthly; typically available 2-3 months after month end. |
| Spotify royalty | Spotify Authors -> "Royalty Reports" | Monthly; typically available 2-3 months after month end. |
| Spotify listeners | Spotify Authors -> "Spotify Insights" | Monthly and weekly files, available a few days after the period ends. These are already CSV. |

## Step 3: Push Files to S3

All commands run from `refresh_helpers/`.

1. Log in to AWS:

```bash
cd refresh_helpers
./aws-login.sh
```

2. Upload the files. This uploads **every file** sitting at the top level of `~/Downloads` to the source's S3 stage (it lists
   the files and asks for confirmation first), so make sure only the files for ONE source are in `~/Downloads` at a time:

```bash
./upload-all-from-downloads.sh <kdp|acx|inaud|spot-royalty|spot-listeners-monthly|spot-listeners-weekly>
```

3. **Excel sources only** (`kdp`, `acx`, `inaud`, `spot-royalty`): trigger the lambda that converts the uploaded Excel files to CSV
   (it processes the whole `excel_stage/` folder, writes to the source's `csv_stage/`, and moves the processed Excel files):

```bash
./invoke-csv-converter-lambda.sh <kdp|acx|inaud|spot-royalty>
```

Check the printed response for errors. (Payloads, including which sheets are converted, are in `excel-to-csv-lambda-payloads/`.)

Spotify listener files are already CSV and are uploaded straight to their `csv_stage/`, so they skip the lambda.

S3 locations (bucket `connors-misc-blob-for-blobs`):

| Source | Upload (Excel) | Converted / CSV |
|---|---|---|
| KDP | `books/kdp/excel_stage/` | `books/kdp/csv_stage/` |
| ACX | `books/acx/excel_stage/` | `books/acx/csv_stage/` |
| InAudio | `books/inaud/excel_stage/` | `books/inaud/csv_stage/` |
| Spotify royalty | `books/spot/royalty/excel_stage/` | `books/spot/royalty/csv_stage/` |
| Spotify listeners (monthly) | - | `books/spot/monthly_listeners/csv_stage/` |
| Spotify listeners (weekly) | - | `books/spot/weekly_listeners/csv_stage/` |

## Step 4: Run the Snowflake Pipeline

Run the `COPY` + `MERGE` pair for each source you staged. The `COPY` takes the RAW table; the `MERGE` takes the target table.

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

-- KDP
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.KDP_COMBINED_SALES_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.KDP_KENP_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('KDP.COMBINED_SALES');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('KDP.KENP');

-- ACX
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SALES_DETAIL_MEMBER_VALUE_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SALES_DETAIL_NET_SALES_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SUMMARY_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_ADJUSTMENTS_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('ACX.SALES_DETAIL_MEMBER_VALUE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('ACX.SALES_DETAIL_NET_SALES');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('ACX.SUMMARY');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('ACX.ADJUSTMENTS');

-- InAudio
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.INAUD_ROYALTY_REPORT_ALL_TABS_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('INAUD.ROYALTY_REPORT_ALL_TABS');

-- Spotify royalty
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.SPOT_ROYALTY_REPORT_ALL_TABS_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('SPOT.ROYALTY_REPORT_ALL_TABS');

-- Spotify listeners
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.SPOT_LISTENER_MONTHLY_REPORT_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.SPOT_LISTENER_WEEKLY_REPORT_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('SPOT.LISTENER_MONTHLY_REPORT');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('SPOT.LISTENER_WEEKLY_REPORT');
```

The exact calls for every source are also stored in `CONFIG.SOURCE_TABLE_INFO` (`COPY_TO_S3_PROC_CALL` / `MERGE_TO_TARGET_PROC_CALL`).

If a merge returns an `ERROR`, nothing was changed in the target table. The usual causes are a renamed file (can't parse the month/week),
or a value that doesn't convert to the target column's type. Fix the file or the crosswalk, then re-run the `COPY` + `MERGE`.

## Step 5: Update Any Dimensions

From the `connors_snowflake_db` repo, the manually maintained dimension DML lives in:

- `snowflake_objects/books/config/table/books.sql`
- `snowflake_objects/books/config/table/book_versions.sql`
- `snowflake_objects/books/config/table/forex_rates.sql`
- `snowflake_objects/books/config/table/kenp_rates.sql`

Running `RPT.BUILD_ALL_REPORTS()` (Step 6) has checks that tell you if any of these need updating. Some helpers exist in Google Drive
(the "DML builder") to build the insert statements.

To find new book versions that aren't in `CONFIG.BOOK_VERSIONS` yet, per source (paste the results into the DML builder and fill in values):

**ACX**

```sql
WITH ALL_ENTRIES AS (
    SELECT ROYALTY_EARNER, TITLE
    FROM ACX.ADJUSTMENTS
    WHERE ROYALTY_EARNER <> 'Total'
    UNION
    SELECT ROYALTY_EARNER, TITLE
    FROM ACX.SALES_DETAIL_MEMBER_VALUE
    UNION
    SELECT ROYALTY_EARNER, TITLE
    FROM ACX.SALES_DETAIL_NET_SALES
)
SELECT
    ROYALTY_EARNER,
    TITLE,
    COUNT(*) OVER (PARTITION BY ROYALTY_EARNER) AS ENTRY_COUNT
FROM ALL_ENTRIES AE
LEFT JOIN CONFIG.BOOK_VERSIONS BV ON BV.BOOK_VERSION_UNIQUE_ID = AE.ROYALTY_EARNER
WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
GROUP BY ROYALTY_EARNER, TITLE
ORDER BY 1;
```

**InAudio**

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

**Spotify**

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

KDP and Spotify listeners have no dimension step beyond what the report-build checks flag.

## Step 6: Build All Reports

Once **all** sources are updated/staged, rebuild the master reports:

```sql
CALL RPT.BUILD_ALL_REPORTS();
```

## Adding a New Source

1. In `connors_snowflake_db`: create the RAW table + S3 stage, the final table, and the `CONFIG.CROSSWALK` rows (including any `CUSTOM_TRANSFORMATION_LOGIC` for DP columns derived from the file name)
2. Add a row to `CONFIG.SOURCE_TABLE_INFO` (copy call, `CONFIG.MERGE_RAW_TO_FINAL_GENERAL` call, and `DELETE_KEY_COLUMN`)
3. Here: add the source to the `case` in `upload-all-from-downloads.sh`, and (for Excel sources) a payload in `excel-to-csv-lambda-payloads/`
4. Add it to the tables in this README
