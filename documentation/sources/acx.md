# ACX (Audible Creation Exchange)

> Part of the refresh process described in [general_refresh_process.md](../general_refresh_process.md). This page holds everything that is specific to this source.

ACX audiobook earnings statements. Each month's statement has four sheets that load to four tables.

## At a Glance

| | |
|---|---|
| Script argument | `acx` |
| Download from | https://www.acx.com/dashboard -> "Earning Statements" |
| Cadence | Monthly; a month's file is available about a week after month end |
| File type | Excel (`.xlsx`), converted to CSV by the lambda |
| Sheets converted | `Summary`, `Sales Detail (Net Sales)`, `Sales Detail (Member Value)`, `Adjustments` |
| Raw tables | `RAW.ACX_SUMMARY_STAGE`, `RAW.ACX_SALES_DETAIL_NET_SALES_STAGE`, `RAW.ACX_SALES_DETAIL_MEMBER_VALUE_STAGE`, `RAW.ACX_ADJUSTMENTS_STAGE` |
| Target tables | `ACX.SUMMARY`, `ACX.SALES_DETAIL_NET_SALES`, `ACX.SALES_DETAIL_MEMBER_VALUE`, `ACX.ADJUSTMENTS` |
| Merge key | `DP_SOURCE_FILE_MONTH`, parsed from the file name |

## File Nuances

- Download only the not-yet-loaded months. Re-staging an already-loaded month is safe: that source month is deleted and replaced.
- **The month is parsed from the file name with a regex. Do not rename the files.** File names look like `.../Royalty_ACCT_<name>_<id>_ACX_MONTHLY_Aug_2026-summary.csv`; the month is the `_<Mon>_<YYYY>-` near the end. (The lambda adds the `-<sheet>` suffix.)
- If the month can't be parsed, the merge fails before the target is touched.
- The `Total` rows in `Summary` and `Adjustments` are filtered out downstream where needed (`ROYALTY_EARNER <> 'Total'`).

## S3 / Upload

- Upload prefix (Excel): `books/acx/excel_stage/`
- Converted CSVs land in: `books/acx/csv_stage/`
- Upload: `./upload-all-from-downloads.sh acx`
- Convert: `./invoke-csv-converter-lambda.sh acx` (payload: `refresh_helpers/excel-to-csv-lambda-payloads/acx-payload.json`)

## Step 1: Check the Most-Recently Loaded Date

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

SELECT MAX(DP_SOURCE_FILE_MONTH) FROM ACX.SUMMARY;
```

## Step 4: Run the Snowflake Pipeline

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;

CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SALES_DETAIL_MEMBER_VALUE_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SALES_DETAIL_NET_SALES_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SUMMARY_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_ADJUSTMENTS_STAGE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('ACX.SALES_DETAIL_MEMBER_VALUE');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('ACX.SALES_DETAIL_NET_SALES');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('ACX.SUMMARY');
CALL CONFIG.MERGE_RAW_TO_FINAL_GENERAL('ACX.ADJUSTMENTS');
```

## Step 5: Update Dimensions

Find royalty earners (books) that aren't in `CONFIG.BOOK_VERSIONS` yet, then paste the results into the DML builder (Google Drive) and fill in values:

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

## Step 6: Pre-Report QC Checks

These run automatically as part of `CALL RPT.BUILD_ALL_REPORTS();` (they live in `CONFIG.PRE_REPORT_REBUILD_CHECKS`). Each must return one row with `PASS_TEST = TRUE`. Run any of them by hand to see why a check fails (change `COUNT(*) = 0 AS PASS_TEST` to `*` to list the offending rows).

### Check 7: `ACX_SUMMARY_TIE_OUT`

- **Verifies:** The components of cost sum up to the total payment due in ACX.SUMMARY.
- **Why it matters:** If the components do not sum to the total, there is a discrepancy in the reported costs.

```sql
WITH SUMMARY_CHECKS AS (
    SELECT 
        DP_SOURCE_FILE_MONTH,
        SUM(PAYMENT_DUE) AS TOTAL_PAYMENT_DUE
    FROM ACX.SUMMARY 
    WHERE ROYALTY_EARNER <> 'Total'
    GROUP BY DP_SOURCE_FILE_MONTH
),
DAILY_NET_SALES AS (
    SELECT 
        DP_SOURCE_FILE_MONTH,
        SUM(NET_ROYALTIES_EARNED) AS NET_SALES_ROYALTIES
    FROM ACX.SALES_DETAIL_NET_SALES
    GROUP BY DP_SOURCE_FILE_MONTH
),
DAILY_MEMBER_VALUE AS (
    SELECT 
        DP_SOURCE_FILE_MONTH, 
        SUM(NET_ROYALTIES_EARNED_EARNER_CURRENCY) AS MEMBER_VALUE_ROYALTIES
    FROM ACX.SALES_DETAIL_MEMBER_VALUE
    GROUP BY DP_SOURCE_FILE_MONTH
),
ADJUSTMENTS AS (
    SELECT 
        DP_SOURCE_FILE_MONTH,
        SUM(AMOUNT_DUE) AS ADJUSTMENTS_AMOUNT_DUE
    FROM ACX.ADJUSTMENTS
    WHERE ROYALTY_EARNER <> 'Total'
    GROUP BY DP_SOURCE_FILE_MONTH
)
SELECT 
    COUNT(*) = 0 AS PASS_TEST
FROM SUMMARY_CHECKS S 
FULL OUTER JOIN DAILY_NET_SALES N 
    ON S.DP_SOURCE_FILE_MONTH = N.DP_SOURCE_FILE_MONTH 
FULL OUTER JOIN DAILY_MEMBER_VALUE M
    ON S.DP_SOURCE_FILE_MONTH = M.DP_SOURCE_FILE_MONTH
FULL OUTER JOIN ADJUSTMENTS A
    ON S.DP_SOURCE_FILE_MONTH = A.DP_SOURCE_FILE_MONTH
WHERE 
    S.DP_SOURCE_FILE_MONTH IS NULL
    OR N.DP_SOURCE_FILE_MONTH IS NULL
    OR M.DP_SOURCE_FILE_MONTH IS NULL
   
   -- Adjustments are rare, do not need to have a row for every month in the join
    --OR A.DP_SOURCE_FILE_MONTH IS NULL

    OR 
    (
        ROUND(S.TOTAL_PAYMENT_DUE, 2)
         <> 
        (
            ROUND(N.NET_SALES_ROYALTIES, 2) 
            + ROUND(M.MEMBER_VALUE_ROYALTIES, 2) 

            -- Allowing for null here
            + ROUND(NVL(A.ADJUSTMENTS_AMOUNT_DUE, 0), 2))
    )
;
```

### Check 8: `ACX_BOOK_VERSIONS`

- **Verifies:** All ROYALTY_EARNER values across the various ACX tables have corresponding entries in CONFIG.BOOK_VERSIONS.
- **Why it matters:** Unmatched rows would show up in reports with no book, version type or language.

```sql
WITH ALL_ENTRIES AS (
    SELECT ROYALTY_EARNER, TITLE 
    FROM ACX.ADJUSTMENTS
    WHERE ROYALTY_EARNER <> 'Total'
    UNION 
    SELECT 
        ROYALTY_EARNER, TITLE
    FROM ACX.SALES_DETAIL_MEMBER_VALUE
    UNION 
    SELECT 
        ROYALTY_EARNER, TITLE
    FROM ACX.SALES_DETAIL_NET_SALES

)
SELECT 
    COUNT(*)  = 0 AS PASS_TEST
FROM ALL_ENTRIES AE 
LEFT JOIN CONFIG.BOOK_VERSIONS BV ON BV.BOOK_VERSION_UNIQUE_ID = AE.ROYALTY_EARNER
WHERE BV.BOOK_VERSION_UNIQUE_ID IS NULL 
;
```
