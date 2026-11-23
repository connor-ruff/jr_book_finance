#!/usr/bin/env bash

set -euo pipefail

S3_DEST="s3://connors-misc-blob-for-blobs/books/spot/monthly_listeners/csv_stage/"

if [[ $# -ne 1 ]]; then
	echo "Usage: $0 <file-path>" >&2
	exit 1
fi

FILE_PATH="$1"

if [[ ! -f "$FILE_PATH" ]]; then
	echo "Error: file not found: $FILE_PATH" >&2
	exit 1
fi

aws s3 cp "$FILE_PATH" "$S3_DEST" --profile connor-ruff-dev-acct
echo "Uploaded: $FILE_PATH -> $S3_DEST"
