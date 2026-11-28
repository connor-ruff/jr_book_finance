# General Refresh Process

This is the process that applies to **every** data source. Anything that differs by source (where to download, file quirks, the exact SQL to run, QC checks) lives in its own page under [`sources/`](sources/). Wherever you see **"-> source page"** below, that's the step where you plug in the source-specific details.

## Sources

| Source | Source page | Script argument(s) | Excel -> CSV lambda? |
|---|---|---|---|
| KDP | [sources/kdp.md](sources/kdp.md) | `kdp` | Yes |
| ACX | [sources/acx.md](sources/acx.md) | `acx` | Yes |
| InAudio | [sources/inaudio.md](sources/inaudio.md) | `inaud` | Yes |
| Spotify royalty | [sources/spotify_royalty.md](sources/spotify_royalty.md) | `spot-royalty` | Yes |
| Spotify listeners | [sources/spotify_listeners.md](sources/spotify_listeners.md) | `spot-listeners-monthly`, `spot-listeners-weekly` | No (already CSV) |
| IngramSpark | [sources/ingramspark.md](sources/ingramspark.md) | `ig-usd`, `ig-aud`, `ig-gbp`, `ig-global` | No (tab-delimited text) |
| Kobo (in progress) | [sources/kobo.md](sources/kobo.md) | `kobo-sales`, `kobo-membership` | Yes |

## The Steps

1. [Check what is already loaded](#step-1-check-whats-already-loaded) -> source page
2. [Download the new reports](#step-2-download-the-new-reports) -> source page
3. [Push the files to S3](#step-3-push-the-files-to-s3) -> source page for the script argument
4. [Run the Snowflake pipeline](#step-4-run-the-snowflake-pipeline) -> source page for the SQL
5. [Update dimensions](#step-5-update-dimensions) -> source page for the "new books" query
6. [QC checks and report build](#step-6-qc-checks-and-report-build) -> source page for the source's checks

## How the Pipeline Works

All Snowflake work goes through two generic procs in `BOOKS.CONFIG`. They are driven by config tables (`CONFIG.SOURCE_TABLE_INFO` and `CONFIG.CROSSWALK`), so adding a source is a config change, not a new proc.

- `CONFIG.COPY_S3_TO_RAW_GENERAL('<raw table>')` truncates the RAW table and loads the staged files from S3 into it (adding the `DP_RUN_ID`, `DP_SOURCE_FILE_NAME`, `DP_SOURCE_FILE_ROW_NUMBER` and `DP_LOAD_TIMESTAMP` columns).
- `CONFIG.MERGE_RAW_TO_FINAL_GENERAL('<target table>')` transforms the RAW rows into the final table:
  1. Transforms the RAW rows (per the crosswalk) into a temp table with the exact structure of the target. **Any bad value or unparseable file name errors here, before the target is touched.**
  2. In a single transaction, deletes the target rows whose merge key (`DELETE_KEY_COLUMN`) appears in the staged data, then inserts the staged rows. Any error rolls back.
  3. Returns `SUCCESS: Deleted X row(s), inserted Y row(s) ...` or `ERROR: ...`.

The merge is **safe to re-run**: for every merge key present in the new batch (a royalty date, file month, or file week), existing rows for that key are replaced. Re-staging an already-loaded file will not duplicate data.

The exact calls for each source are also stored in `CONFIG.SOURCE_TABLE_INFO` (`COPY_TO_S3_PROC_CALL` / `MERGE_TO_TARGET_PROC_CALL`).

**File names matter.** For most sources, the month (or week) a file belongs to is parsed from the file name by a regex in `CONFIG.CROSSWALK.CUSTOM_TRANSFORMATION_LOGIC`. **Do not rename downloaded files.** Each source page says how its period is determined.

## Step 1: Check What's Already Loaded

Each source page has the `SELECT MAX(...)` queries for its tables. Use them to decide which reports you still need to download.

Run Snowflake SQL with this context:

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;
```

## Step 2: Download the New Reports

Download only the not-yet-loaded reports for the source, **without renaming them**, into your `~/Downloads` folder (the upload script reads from there). Where to download, cadence, and file quirks are on the source page.

## Step 3: Push the Files to S3

All commands run from the `refresh_helpers/` folder.

1. Log in to AWS:

   ```bash
   cd refresh_helpers
   ./aws-login.sh
   ```

2. Upload the files. This uploads **every file** sitting at the top level of `~/Downloads` to the source's S3 stage (it lists the files and asks for confirmation first), so keep only the files for **one** source/report type in `~/Downloads` at a time:

   ```bash
   ./upload-all-from-downloads.sh <script argument>
   ```

   Valid arguments: `kdp`, `acx`, `inaud`, `spot-royalty`, `spot-listeners-monthly`, `spot-listeners-weekly`, `ig-usd`, `ig-aud`, `ig-gbp`, `ig-global`.

3. **Excel sources only** (KDP, ACX, InAudio, Spotify royalty, Kobo): trigger the lambda that converts the uploaded Excel files to CSV. It processes the whole `excel_stage/` folder, writes to the source's `csv_stage/`, and moves the processed Excel files into a `processed/` folder:

   ```bash
   ./invoke-csv-converter-lambda.sh <kdp|acx|inaud|spot-royalty|kobo-sales|kobo-membership>
   ```

   Check the printed response for errors. The payloads (including which sheets are converted) are in `refresh_helpers/excel-to-csv-lambda-payloads/`.

Sources that are already text (Spotify listeners, IngramSpark) skip step 3 and are uploaded straight to their `csv_stage/`.

S3 bucket: `connors-misc-blob-for-blobs`. Each source page lists its exact prefixes.

## Step 4: Run the Snowflake Pipeline

For each source you staged, run the `COPY` for each raw table and then the `MERGE` for each target table. The exact `CALL` statements are on the source page; the pattern is:

```sql
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.<SOURCE>_<TABLE>_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('<SCHEMA>.<TABLE>');
```

If a merge returns an `ERROR`, **nothing was changed in the target table.** Common causes:

- A renamed file, so the month/week can't be parsed
- A value that doesn't convert to the target column's type (blank or whitespace-only numeric/date cells are treated as NULL, not errors)
- A column in the crosswalk with no valid mapping (`Invalid column mapping found in crosswalk`)

Fix the file or the crosswalk, then re-run the `COPY` + `MERGE`.

## Step 5: Update Dimensions

The manually maintained dimension DML lives in the `connors_snowflake_db` repo:

- `snowflake_objects/books/config/table/books.sql`
- `snowflake_objects/books/config/table/book_versions.sql`
- `snowflake_objects/books/config/table/forex_rates.sql`
- `snowflake_objects/books/config/table/kenp_rates.sql`

Some sources have a query that finds new books/ISBNs not yet in `CONFIG.BOOK_VERSIONS` (on the source page). Paste the results into the DML builder in Google Drive, fill in the values, and add the generated rows to the files above.

You don't have to catch everything by hand: the QC checks in step 6 fail if any dimension entry is missing.

## Step 6: QC Checks and Report Build

Once **all** the sources you're refreshing are loaded:

```sql
CALL RPT.BUILD_ALL_REPORTS();
```

This first runs every active check in `CONFIG.PRE_REPORT_REBUILD_CHECKS` and only rebuilds the reports if they all pass; otherwise it returns the list of failed checks. Each source page lists its checks with their SQL, so you can run one by hand to see exactly which rows are missing a dimension entry.

Checks that apply to several sources:

- **Book versions:** every book/ISBN/ID in the data exists in `CONFIG.BOOK_VERSIONS`
- **Forex rates:** every currency + month exists in `CONFIG.FOREX_RATES`
- **Currency assurance:** sources assumed to report in USD still do

## Adding a New Source

1. In `connors_snowflake_db`:
   - Create the RAW table (`CONFIG.CREATE_RAW_DDL_FROM_CROSSWALK` can generate the DDL) and its S3 stage (`raw/stage/`)
   - Create the final table (`CONFIG.CREATE_TARGET_DDL_FROM_CROSSWALK` can generate the DDL)
   - Add the `CONFIG.CROSSWALK` rows, including any `CUSTOM_TRANSFORMATION_LOGIC` for DP columns derived from the file name
   - Add a row to `CONFIG.SOURCE_TABLE_INFO` (copy call, `CONFIG.MERGE_RAW_TO_FINAL_GENERAL` call, file format, and `DELETE_KEY_COLUMN`)
   - Add QC checks to `CONFIG.PRE_REPORT_REBUILD_CHECKS` and a row to `CONFIG.REFRESH_DASHBOARD`
2. In `refresh_helpers/`: add the source to the `case` in `upload-all-from-downloads.sh`, and (for Excel sources) add a payload to `excel-to-csv-lambda-payloads/`
3. Here: add a page under `sources/` and a row to the table at the top of this file
