# How to Refresh InAudio Data

Spotify makes royalty data available on a monthly basis, with earnings files that are specific to each month.
Earnings reports can be downloaded one month at a time. 
Typically, a month's file is made available 2-3 months after a month ends
Our refresh methodology is:

- Download not-yet-loaded earnings files from InAudio
- For all source month that have been staged to load, completely delete that source month from the InAudio tables
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
SELECT MAX(DP_SOURCE_FILE_MONTH) FROM SPOT.ROYALTY_REPORT_ALL_TABS;
```

## Step 2: Download Royalty Statement(s)

- Log in to Spotify Authors
- Navigate to "Royalty Reports"
- Download all monthly reports that have not been processed previously
- Move files to `refresh_helpers/_downloaded_files/spot/royalty/`

## Step 3: Push Files to S3

- Initiate AWS profile

```bash
cd refresh_helpers/spot
./aws-login.sh
```

- Upload each excel file (do separately for each file you need to stage)

```bash 
cd refresh_helpers/spot
./upload-file.sh ../_downloaded_files/spot/royalty/<file_name>.xlsx
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
CALL CONFIG.COPY_S3_TO_RAW_GENERAL('RAW.SPOT_ROYALTY_REPORT_ALL_TABS_STAGE');
CALL SPOT.MERGE_ROYALTY_REPORT_ALL_TABS_GENERAL('SPOT.ROYALTY_REPORT_ALL_TABS');
```

## Step 5: Update any dimensions

Use the below SQL and the DML builder on Google Drive to add any necessary entries to the manual BOOK_VERSIONS insert statement.

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

Paste that into the DML builder and fill in values


## Step 6: Build All Reports

Once all other sources are also updated/stage, we can rebuild the master reports:

```sql
CALL RPT.BUILD_ALL_REPORTS();
```
