aws lambda invoke \
  --function-name lambda-excel-to-csv-s3 \
  --payload file://test-event.json \
  --cli-binary-format raw-in-base64-out \
  --region us-east-2 \
  --profile connor-ruff-dev-acct \
  response.json && cat response.json
