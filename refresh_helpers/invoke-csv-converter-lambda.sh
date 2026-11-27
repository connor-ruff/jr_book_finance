#!/usr/bin/env bash
# Invoke the excel-to-csv lambda for a given source, using its payload in
# excel-to-csv-lambda-payloads/.
# Usage: ./invoke-csv-converter-lambda.sh <kdp|acx|inaud|spot-royalty>

set -euo pipefail

FUNCTION_NAME="lambda-excel-to-csv-s3"
REGION="us-east-2"
PROFILE="connor-ruff-dev-acct"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD_DIR="$SCRIPT_DIR/excel-to-csv-lambda-payloads"

SOURCE="${1:-}"
PAYLOAD_FILE="$PAYLOAD_DIR/${SOURCE}-payload.json"

if [[ $# -ne 1 || ! -f "$PAYLOAD_FILE" ]]; then
	echo "Usage: $0 <source>" >&2
	echo "Available sources:" >&2
	for f in "$PAYLOAD_DIR"/*-payload.json; do
		b="${f##*/}"
		echo "  ${b%-payload.json}" >&2
	done
	exit 1
fi

RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

echo "Invoking $FUNCTION_NAME for '$SOURCE' with $PAYLOAD_FILE"

aws lambda invoke \
	--function-name "$FUNCTION_NAME" \
	--payload "file://$PAYLOAD_FILE" \
	--cli-binary-format raw-in-base64-out \
	--region "$REGION" \
	--profile "$PROFILE" \
	"$RESPONSE_FILE"

echo "--- Response ---"
cat "$RESPONSE_FILE"
echo
