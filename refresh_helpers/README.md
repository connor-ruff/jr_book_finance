# Refresh Helpers

Scripts for downloading/staging source data and pushing it to S3:

- `aws-login.sh` - AWS SSO login
- `upload-all-from-downloads.sh` - uploads everything in `~/Downloads` to a source's S3 stage
- `invoke-csv-converter-lambda.sh` - converts uploaded Excel files to CSV (Excel sources only)
- `excel-to-csv-lambda-payloads/` - lambda payloads per source

The full refresh process is documented in [`../documentation/`](../documentation/general_refresh_process.md), with a page for each source under `../documentation/sources/`.
