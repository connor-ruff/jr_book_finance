# How to Refresh ACX Data

ACX makes royalty data available on a monthly basis, with earnings files that are specific to each month.

## Step 1: Check The Most-Recently Loaded Royalty Date

TBD...

## Step 2: Download Royalty Statement(s)

- Log in to ACX (https://www.acx.com/dashboard)
- Navigate to "Earning Statements"
- Download all monthly reports that have not been processed previously
- Move files to `refresh_helpers/_downloaded_files/acx/`

# Step 3: Push Files to S3

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
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_MARKETPLACE_BREAKDOWN_BY_TITLE_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_ROYALTIES_BY_TITLE_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SALES_DETAIL_MEMBER_VALUE_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SALES_DETAIL_NET_SALES_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.ACX_SUMMARY_STAGE');
```



**NOTE: this documentation is incomplete, as it is being filled out intermittedly while this pipeline is developed**