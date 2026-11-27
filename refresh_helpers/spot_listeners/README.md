# How to Refresh InAudio Data

Spotify makes listener data available on both a monthly and weekly basis, with files that are specific to one week or month.
Monthly/weekly reports can be downloaded one at a time. 
Typically, a date range's file is made available just a few days after that date range.

Our refresh methodology is:

- Download not-yet-loaded listeners files from Spotify
- For all source date ranges that have been staged to load, completely delete that source month or week from the Spotify tables
    - Since we only want to download/stage NEW files, no deletes should every truly happen, but this check makes the operation safer by preventing double-loading if we accidentally stage/load a file that's already been loaded
- Insert data from new batch

- **Note: the "source month" or "source week" for each file is detected (using a regex expression) from the file name itself**
- **So it is important not to change the file names after downloading**

## Step 1: Check The Most-Recently Loaded Royalty Date

In Snowflake:

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;
SELECT MAX(DP_SOURCE_FILE_MONTH) FROM SPOT.LISTENER_MONTHLY_REPORT;
SELECT MAX(DP_SOURCE_FILE_END_DATE) FROM SPOT.LISTENER_WEEKLY_REPORT;
```

## Step 2: Download Royalty Statement(s)

- Log in to Spotify Authors
- Navigate to "Spotify Insights"
- Download all monthly reports and weekly reports that have not been processed previously
- Move files to `refresh_helpers/_downloaded_files/spot/listeners_monthly`
    - for weekly: `refresh_helpers/_downloaded_files/spot/listeners_weekly`

## Step 3: Push Files to S3

- Initiate AWS profile

```bash
cd refresh_helpers/spot_listeners
./aws-login.sh
```

- Upload each excel file (do separately for each file you need to stage)

```bash 
cd refresh_helpers/spot
./upload-file.sh ../_downloaded_files/spot/listeners_monthly/<file_name>.xlsx
```


## Step 4: Trigger the Snowflake Pipeline Through the Spotify Layer

```sql
USE ROLE BOOKS_ADMIN;
USE SCHEMA BOOKS.CONFIG;
USE WAREHOUSE COMPUTE_WH;
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.SPOT_LISTENER_MONTHLY_REPORT_STAGE');
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.SPOT_LISTENER_WEEKLY_REPORT_STAGE');
CALL SPOT.MERGE_LISTENER_MONTHLY_REPORT_GENERAL('SPOT.LISTENER_MONTHLY_REPORT');
CALL SPOT.MERGE_LISTENER_WEEKLY_REPORT_GENERAL('SPOT.LISTENER_WEEKLY_REPORT');
```

## Step 5: Update any dimensions



## Step 6: Build All Reports

