# Kobo

> Part of the refresh process described in [general_refresh_process.md](../general_refresh_process.md). This page holds everything that is specific to this source.

Kobo ebook reports. Two report types, each loaded to its own table.

## At a Glance

| Report | Script argument | Raw table | Target table |
|---|---|---|---|
| Book sales | `kobo-sales` | `RAW.KOBO_BOOK_SALES_STAGE` | `KOBO.BOOK_SALES` |
| Membership revenue (Kobo Plus) | `kobo-membership` | `RAW.KOBO_MEMBERSHIP_REVENUE_STAGE` | `KOBO.MEMBERSHIP_REVENUE` |

| | |
|---|---|
| Download from | Kobo Writing Life dashboard (https://writinglife.kobobooks.com/) -> sales / membership reports |
| Cadence | Monthly (the month is in the file name, e.g. `2026-08`) |
| File type | Excel, converted to CSV by the lambda (one payload per report; no sheet filter is set, so every sheet in the workbook is converted) |
| File format | `CONFIG.CSV_SKIP_HEADER_QUOTES` (1 header row, quoted fields) |
| Merge key | `DP_SOURCE_FILE_MONTH`, parsed from the file name |

## File Nuances

- **The month is parsed from the file name with a regex. Do not rename the files.** The lambda output looks like `books/kobo/book_sales/csv_stage/details/sales_invoice_PUB_2026-08-details.csv` (book sales use `PUB`, membership revenue uses `SUBS`); the month is the `_<YYYY>-<MM>-details.csv` at the end. If it can't be parsed, the merge fails before the target is touched. The logic is in `CONFIG.CROSSWALK.CUSTOM_TRANSFORMATION_LOGIC` for both tables.
- **Two reports per period:** book sales (per-sale detail: date, country/state/zip, quantity, list price, COGS, net due) and membership revenue (Kobo Plus reads/minutes and the publisher revenue share).
- Identifier is the **eISBN** (`EISBN` column) in both reports, plus `TITLE` / `AUTHOR`. These are what get matched to `CONFIG.BOOK_VERSIONS`.
- **Currency:** each row carries its own currency columns: book sales has `LP_CURRENCY`, `COGS_BASED_LP_CURRENCY` and `PAYABLE_CURRENCY`; membership revenue has `PAYABLE_CURRENCY`. `NET_DUE_PAYABLE_CURRENCY` / `TOTAL_PUBLISHER_REVENUE_SHARE_IN_PAYABLE_CURRENCY` are the amounts earned. The daily sales report treats these amounts as USD (no forex conversion is applied), and there is no Kobo forex or currency check, so confirm `PAYABLE_CURRENCY` is USD if a new currency ever appears.
- Book sales dates (`DATE`) and membership `READ_PERIOD` are parsed as dates in the crosswalk. `DATE` in the book sales report is a timestamp like `2026-08-03 13:14:25.367`; the crosswalk (`TO_DATE(TO_TIMESTAMP_NTZ(..., 'YYYY-MM-DD HH24:MI:SS.FF3'))`) truncates it to the day, with no time zone conversion. `READ_PERIOD` is cast directly to a date (no custom logic).
- Both reports have `CONTENT_TYPE`. Nothing is filtered on it: all content types flow into the reports. The Step 5 query shows the content types for any new eISBN.
- Book sales can contain refunds (`REFUND_REASON`, negative `TOTAL_QTY`). The daily sales report simply sums `TOTAL_QTY` and `NET_DUE_PAYABLE_CURRENCY`, so refunds net out against sales.
- `TOTAL_QTY` is loaded as a whole number (`NUMBER(38,0)`); the other amount columns are `NUMBER(38,10)`.
- In the daily sales report, book sales appear as source `Kobo` (by day) and membership revenue as `Kobo - Pages`, spread evenly across the days of the month (units are NULL).

## S3 / Upload

Upload the Excel files, then run the lambda to convert them to CSV. Put **only one report type's files in `~/Downloads` at a time**.

| Report | Upload | Convert | Excel stage | CSV stage |
|---|---|---|---|---|
| Book sales | `./upload-all-from-downloads.sh kobo-sales` | `./invoke-csv-converter-lambda.sh kobo-sales` | `books/kobo/book_sales/excel_stage/` | `books/kobo/book_sales/csv_stage/` |
| Membership revenue | `./upload-all-from-downloads.sh kobo-membership` | `./invoke-csv-converter-lambda.sh kobo-membership` | `books/kobo/membership_revenue/excel_stage/` | `books/kobo/membership_revenue/csv_stage/` |

Payloads: `refresh_helpers/excel-to-csv-lambda-payloads/kobo-sales-payload.json` and `kobo-membership-payload.json`. If the workbooks ever have extra sheets, add `include_sheet_names` / `exclude_sheet_names` to the payloads. The Snowflake stages (`raw/stage/kobo_book_sales_stage.sql` and `kobo_membership_revenue_stage.sql` in `connors_snowflake_db`) point at the CSV stages above.

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

Find eISBNs that aren't in `CONFIG.BOOK_VERSIONS` yet, across both tables, then paste the results into the DML builder (Google Drive) and fill in values. `TITLE_COUNT` above 1 means the same eISBN appears under more than one title.

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
```


## Step 6: Pre-Report QC Checks

These run automatically as part of `CALL RPT.BUILD_ALL_REPORTS();` (they live in `CONFIG.PRE_REPORT_REBUILD_CHECKS`). Each must return one row with `PASS_TEST = TRUE`.

### Check 15: `KOBO_BOOK_VERSIONS`

- **Verifies:** Every row across the KOBO tables has a matching CONFIG.BOOK_VERSIONS entry (EISBN = BOOK_VERSION_UNIQUE_ID).
- **Why it matters:** Unmatched rows would show up in reports with no book, version type or language.

```sql
WITH VERSIONS AS (
    SELECT K.EISBN, K.TITLE, K.CONTENT_TYPE
    FROM KOBO.BOOK_SALES K
    LEFT JOIN CONFIG.BOOK_VERSIONS BV ON K.EISBN = BV.BOOK_VERSION_UNIQUE_ID
    WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL

    UNION ALL

    SELECT K.EISBN, K.TITLE, K.CONTENT_TYPE
    FROM KOBO.MEMBERSHIP_REVENUE K
    LEFT JOIN CONFIG.BOOK_VERSIONS BV ON K.EISBN = BV.BOOK_VERSION_UNIQUE_ID
    WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL
),
VERSIONS_DISTINCT AS (
    SELECT EISBN, TITLE, CONTENT_TYPE
    FROM VERSIONS
    GROUP BY EISBN, TITLE, CONTENT_TYPE
)
SELECT COUNT(*) = 0 AS PASS_TEST
FROM VERSIONS_DISTINCT
```

There is no Kobo forex or currency check (see the Currency note above). Both tables are on `CONFIG.REFRESH_DASHBOARD` (`KOBO - BOOK SALES`, `KOBO - MEMBERSHIP REVENUE`).
