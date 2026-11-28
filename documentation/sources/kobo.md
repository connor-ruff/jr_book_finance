# Kobo

> Part of the refresh process described in [general_refresh_process.md](../general_refresh_process.md). This page holds everything that is specific to this source.

Kobo ebook reports. Two report types, each loaded to its own table.

> **Status: in progress.** The Snowflake RAW tables, crosswalk rows and `SOURCE_TABLE_INFO` rows exist in `connors_snowflake_db`, but items marked **TODO** below are not finished or not yet confirmed (S3 stage, QC checks, report integration).

## At a Glance

| Report | Script argument | Raw table | Target table |
|---|---|---|---|
| Book sales | `kobo-sales` | `RAW.KOBO_BOOK_SALES_STAGE` | `KOBO.BOOK_SALES` |
| Membership revenue (Kobo Plus) | `kobo-membership` | `RAW.KOBO_MEMBERSHIP_REVENUE_STAGE` | `KOBO.MEMBERSHIP_REVENUE` |

| | |
|---|---|
| Download from | TODO: Kobo Writing Life dashboard -> reports (confirm exact location) |
| Cadence | TODO: Monthly (confirm) |
| File type | Excel, converted to CSV by the lambda (one payload per report; TODO: confirm sheet names, currently no sheet filter is set) |
| File format | `CONFIG.CSV_SKIP_HEADER_QUOTES` (1 header row, quoted fields) |
| Merge key | `DP_SOURCE_FILE_MONTH`, parsed from the file name |

## File Nuances

- **The month is parsed from the file name with a regex. Do not rename the files.** The lambda output looks like `books/kobo/book_sales/csv_stage/details/sales_invoice_PUB_2026-08-details.csv` (book sales use `PUB`, membership revenue uses `SUBS`); the month is the `_<YYYY>-<MM>-details.csv` at the end. If it can't be parsed, the merge fails before the target is touched. The logic is in `CONFIG.CROSSWALK.CUSTOM_TRANSFORMATION_LOGIC` for both tables.
- **Two reports per period:** book sales (per-sale detail: date, country/state/zip, quantity, list price, COGS, net due) and membership revenue (Kobo Plus reads/minutes and the publisher revenue share). TODO: record the downloaded file names.
- Identifier is the **eISBN** (`EISBN` column) in both reports, plus `TITLE` / `AUTHOR`. These are what get matched to `CONFIG.BOOK_VERSIONS`.
- **Currency:** each row carries its own currency columns: book sales has `LP_CURRENCY`, `COGS_BASED_LP_CURRENCY` and `PAYABLE_CURRENCY`; membership revenue has `PAYABLE_CURRENCY`. `NET_DUE_PAYABLE_CURRENCY` / `TOTAL_PUBLISHER_REVENUE_SHARE_IN_PAYABLE_CURRENCY` are the amounts earned. TODO: confirm whether `PAYABLE_CURRENCY` is always USD or needs forex conversion.
- Book sales dates (`DATE`) and membership `READ_PERIOD` are parsed as dates in the crosswalk. TODO: document the date formats.
- Both reports have `CONTENT_TYPE`. TODO: document the values (e.g. ebook vs. audiobook) and whether any should be excluded.
- Book sales can contain refunds (`REFUND_REASON`, negative `TOTAL_QTY`). TODO: confirm how refunds should be treated in reports.
- TODO: any quirks in the files (extra header rows, total rows, encoding).

## S3 / Upload

Upload the Excel files, then run the lambda to convert them to CSV. Put **only one report type's files in `~/Downloads` at a time**.

| Report | Upload | Convert | Excel stage | CSV stage |
|---|---|---|---|---|
| Book sales | `./upload-all-from-downloads.sh kobo-sales` | `./invoke-csv-converter-lambda.sh kobo-sales` | `books/kobo/book_sales/excel_stage/` | `books/kobo/book_sales/csv_stage/` |
| Membership revenue | `./upload-all-from-downloads.sh kobo-membership` | `./invoke-csv-converter-lambda.sh kobo-membership` | `books/kobo/membership_revenue/excel_stage/` | `books/kobo/membership_revenue/csv_stage/` |

Payloads: `refresh_helpers/excel-to-csv-lambda-payloads/kobo-sales-payload.json` and `kobo-membership-payload.json`. TODO: if the workbooks have extra sheets, add `include_sheet_names` / `exclude_sheet_names`. TODO: the RAW stage files under `raw/stage/` in `connors_snowflake_db` don't exist yet; their URLs must match the CSV stages above.

## Step 1: Check the Most-Recently Loaded Date

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

SELECT MAX(DP_SOURCE_FILE_MONTH) FROM KOBO.BOOK_SALES;
SELECT MAX(DP_SOURCE_FILE_MONTH) FROM KOBO.MEMBERSHIP_REVENUE;
```

## Step 4: Run the Snowflake Pipeline

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.KOBO_BOOK_SALES_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.KOBO_MEMBERSHIP_REVENUE_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('KOBO.BOOK_SALES');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('KOBO.MEMBERSHIP_REVENUE');
```

## Step 5: Update Dimensions

Find eISBNs that aren't in `CONFIG.BOOK_VERSIONS` yet, across both tables, then paste the results into the DML builder (Google Drive) and fill in values. `title_versions` above 1 means the same eISBN appears under more than one title.

```sql
WITH VERSIONS AS (
    SELECT 
        K.EISBN,
        K.TITLE, 
        K.CONTENT_TYPE,
    FROM KOBO.BOOK_SALES K 
    LEFT JOIN CONFIG.BOOK_VERSIONS BV ON K.EISBN = BV.BOOK_VERSION_UNIQUE_ID
    WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
    
    UNION ALL 

    SELECT 
        K.EISBN,
        K.TITLE, 
        K.CONTENT_TYPE,
    FROM KOBO.MEMBERSHIP_REVENUE K 
    LEFT JOIN CONFIG.BOOK_VERSIONS BV ON K.EISBN = BV.BOOK_VERSION_UNIQUE_ID
    WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
),
VERSIONS_DISTINCT AS (
    SELECT 
        EISBN, TITLE, CONTENT_TYPE 
    FROM VERSIONS
    GROUP BY EISBN, TITLE, CONTENT_TYPE
)
SELECT 
    *,
    COUNT(DISTINCT TITLE) OVER (PARTITION BY EISBN) AS TITLE_COUNT,
    COUNT(DISTINCT CONTENT_TYPE) OVER (PARTITION BY EISBN) AS CONTENT_TYPE_COUNT
FROM VERSIONS_DISTINCT
ORDER BY EISBN;
;
```


## Step 6: Pre-Report QC Checks

TODO: no Kobo checks exist yet in `CONFIG.PRE_REPORT_REBUILD_CHECKS`, and Kobo isn't yet in `CONFIG.REFRESH_DASHBOARD` or the reports. Proposed checks (to be added and numbered, then copied here with their SQL):

- `KOBO_BOOK_VERSIONS`: every `EISBN` in `KOBO.BOOK_SALES` and `KOBO.MEMBERSHIP_REVENUE` exists in `CONFIG.BOOK_VERSIONS` (same pattern as IngramSpark Check 13).
- `KOBO_FOREX_RATES`: every `PAYABLE_CURRENCY` + month exists in `CONFIG.FOREX_RATES` (same pattern as IngramSpark Check 14), if non-USD currencies occur.
- Currency assurance: `PAYABLE_CURRENCY` is USD, if that's assumed.
