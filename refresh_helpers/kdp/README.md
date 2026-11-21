# How to Refresh KDP Data

KDP makes royalty data available on a daily basis, with minor lag of a few days. 
Royalties reports can be downloaded across a custom-set range of dates.
Our refresh methodology is:

- Download royalties files from a date range starting from the last royalty date available in Snowflake through the current date
    - **Note: add a 3-4 day overlap to pick up any lagged royalties, the process is safe and will not duplicate records**
- For any royalty date included in the new refresh batch, fully delete all records from that royalty date from Snowflake
- Insert data from new batch

## Step 1: Check The Most-Recently Loaded Royalty Date

In Snowflake:

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;
SELECT MAX(ROYALTY_DATE) FROM KDP.COMBINED_SALES
```

## Step 2: Download Combined Sales Report(s)

- Log in to KDP (https://kdpreports.amazon.com/dashboard)
- Navigate to "Orders"
- Download reports up to the current day
    - Typically limiting the maximum size of a downloaded report to 1 month is wise
- Move files to `refresh_helpers/_downloaded_files/kdp/`

## Step 3: Push Files to S3

- Initiate AWS profile

```bash
cd refresh_helpers/kdp
./aws-login.sh
```

- Upload each excel file (do separately for each file you need to stage)

```bash 
cd refresh_helpers/kdp
./upload-file.sh ../_downloaded_files/kdp/<file_name>.xlsx
```


- Trigger the lambda function that parses the excel file and converts to csv
    - Review `test-event.json`
    - ```./invoke-test.sh```
    - Review `response.json`

## Step 4: Trigger the Snowflake Pipeline Through the KDP Layer

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.KDP_COMBINED_SALES_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.KDP_KENP_STAGE');
CALL KDP.MERGE_ORDERS_DATA_BY_ROYALTY_DATE_GENERAL('KDP.COMBINED_SALES');
CALL KDP.MERGE_ORDERS_DATA_BY_ROYALTY_DATE_GENERAL('KDP.KENP');
```

## Step 5: Update Any Dimensions

From the `connors_snowflake_db` repo...

`snowflake_objects/books/config/table/books.sql`
`snowflake_objects/books/config/table/book_versions.sql`
`snowflake_objects/books/config/table/forex_rates.sql`
`snowflake_objects/books/config/table/kenp_rates.sql`

- **running the proc in step 6 has checks to ensure that nothing from the above has to be updated**
- **some helpers exist in Google Drive to help build the DML statements**

## Step 6: Build All Reports

```sql
CALL RPT.BUILD_ALL_REPORTS();
```

