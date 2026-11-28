#!/usr/bin/env bash
# Upload every file in ~/Downloads to the stage for a given source.
# Excel sources go to the excel stage (the csv-converter lambda handles them next);
# Spotify listener reports are already CSV, so they go straight to the csv stage.
# Usage: ./upload-all-from-downloads.sh <kdp|acx|inaud|spot-royalty|spot-listeners-monthly|spot-listeners-weekly|ig-usd|ig-aud|ig-gbp|ig-global|kobo-sales|kobo-membership>

set -euo pipefail

BUCKET="connors-misc-blob-for-blobs"
PROFILE="connor-ruff-dev-acct"
DOWNLOADS_DIR="$HOME/Downloads"

# Stage prefix per source. Excel stages match source_key in excel-to-csv-lambda-payloads/;
# csv stages match the URLs in connors_snowflake_db/snowflake_objects/books/raw/stage/
case "${1:-}" in
	kdp)          PREFIX="books/kdp/excel_stage/" ;;
	acx)          PREFIX="books/acx/excel_stage/" ;;
	inaud)        PREFIX="books/inaud/excel_stage/" ;;
	spot-royalty) PREFIX="books/spot/royalty/excel_stage/" ;;
	spot-listeners-monthly) PREFIX="books/spot/monthly_listeners/csv_stage/" ;;
	spot-listeners-weekly)  PREFIX="books/spot/weekly_listeners/csv_stage/" ;;
	ig-usd)       PREFIX="books/ig/wholesale_pod_usd/csv_stage/" ;;
	ig-aud)       PREFIX="books/ig/wholesale_pod_aud/csv_stage/" ;;
	ig-gbp)       PREFIX="books/ig/wholesale_pod_gbp/csv_stage/" ;;
	ig-global)    PREFIX="books/ig/global_connect/csv_stage/" ;;
	kobo-sales)      PREFIX="books/kobo/book_sales/excel_stage/" ;;
	kobo-membership) PREFIX="books/kobo/membership_revenue/excel_stage/" ;;
	*)
		echo "Usage: $0 <kdp|acx|inaud|spot-royalty|spot-listeners-monthly|spot-listeners-weekly|ig-usd|ig-aud|ig-gbp|ig-global|kobo-sales|kobo-membership>" >&2
		exit 1
		;;
esac

S3_DEST="s3://$BUCKET/$PREFIX"

# Top-level regular files only, skipping hidden files (.DS_Store, .localized, ...)
FILES=()
while IFS= read -r -d '' f; do
	FILES+=("$f")
done < <(find "$DOWNLOADS_DIR" -maxdepth 1 -type f ! -name '.*' -print0)

if [[ ${#FILES[@]} -eq 0 ]]; then
	echo "No files found in $DOWNLOADS_DIR" >&2
	exit 1
fi

echo "About to upload ${#FILES[@]} file(s) to $S3_DEST:"
printf '  %s\n' "${FILES[@]##*/}"
read -r -p "Proceed? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

for f in "${FILES[@]}"; do
	aws s3 cp "$f" "$S3_DEST" --profile "$PROFILE"
done

echo "Uploaded ${#FILES[@]} file(s) -> $S3_DEST"
