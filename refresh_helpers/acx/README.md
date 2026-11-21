# How to Refresh ACX Data

ACX makes royalty data available on a monthly basis, with earnings files that are specific to each month.
Earnings reports can be downloaded one month at a time. 
Typically, a month's file is made available a week or so after a month ends.
Our refresh methodology is:

- Download not-yet-loaded earnings files from ACX
- For all source month that have been staged to load, completely delete that source month from the ACX tables
    - Since we only want to download/stage NEW files, no deletes should every truly happen, but this check makes the operation safer by preventing double-loading if we accidentally stage/load a file that's already been loaded
- Insert data from new batch

- **Note: the "source month" for each file is detected (using a regex expression) from the file name itself**
- **So it is important not to change the file names after downloading**

## Step 1: Check The Most-Recently Loaded Royalty Date

In Snowflake:

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;
SELECT MAX(DP_SOURCE_FILE_MONTH) FROM ACX.SUMMARY;
```

## Step 2: Download Royalty Statement(s)

- Log in to ACX (https://www.acx.com/dashboard)
- Navigate to "Earning Statements"
- Download all monthly reports that have not been processed previously
- Move files to `refresh_helpers/_downloaded_files/acx/`

## Step 3: Push Files to S3

- Initiate AWS profile

```bash
cd refresh_helpers/acx
./aws-login.sh
```

- Upload each excel file (do separately for each file you need to stage)

```bash 
cd refresh_helpers/kdp
./upload-file.sh ../_downloaded_files/acx/<file_name>.xlsx
```

- Trigger the lambda function that parses the excel file and converts to csv
    - Review `test-event.json`
    - ```./invoke-test.sh```
    - Review `response.json`


## Step 4: Trigger the Snowflake Pipeline Through the ACX Layer

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SALES_DETAIL_MEMBER_VALUE_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SALES_DETAIL_NET_SALES_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SUMMARY_STAGE');
CALL ACX.MERGE_DATA_BY_FILE_MONTH_DATE_GENERAL('ACX.SALES_DETAIL_MEMBER_VALUE');
CALL ACX.MERGE_DATA_BY_FILE_MONTH_DATE_GENERAL('ACX.SALES_DETAIL_NET_SALES')
CALL ACX.MERGE_DATA_BY_FILE_MONTH_DATE_GENERAL('ACX.SUMMARY');

```

## Step 5: Update any dimensions

**NOTE: this documentation is incomplete, as it is being filled out intermittedly while this pipeline is developed**