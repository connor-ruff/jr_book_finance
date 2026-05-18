---
name: snowflake-lookup
description: Look up Snowflake table, view, procedure, or stage definitions before writing queries, adding API routes, or debugging data issues in this app. Use this whenever a Snowflake object name is mentioned or a new query needs to be written.
user-invocable: false
allowed-tools: Read Bash
---

All Snowflake DDL for this app lives in a separate repo:

```
/Users/connor/source/repos/connors_snowflake_db/
```

## Path convention

`DATABASE.SCHEMA.OBJECT_NAME` maps to:
`snowflake_objects/<database>/<schema>/<object_type>/<object_name>.sql`

Names are lowercase in the filesystem. Example:
`BOOKS.RPT.DAILY_SALES_REPORT` → `snowflake_objects/books/rpt/table/daily_sales_report.sql`

## BOOKS database schemas

| Schema   | Purpose |
|----------|---------|
| `CONFIG` | Reference tables: books, book versions, marketplaces, KENP rates, forex rates |
| `KDP`    | Cleaned KDP sales and KENP page-read data |
| `RAW`    | Raw ingestion staging tables and S3 stages |
| `RPT`    | Reporting views/tables the app queries directly |

## Objects this app currently queries

| Snowflake name | File path (relative to snowflake_objects/) |
|---|---|
| `RPT.DAILY_SALES_REPORT` | `books/rpt/table/daily_sales_report.sql` |
| `CONFIG.BOOKS` | `books/config/table/books.sql` |
| `CONFIG.BOOK_VERSIONS` | `books/config/table/book_versions.sql` |
| `CONFIG.MARKETPLACES` | `books/config/table/marketplaces.sql` |
| `CONFIG.KENP_RATES` | `books/config/table/kenp_rates.sql` |
| `CONFIG.FOREX_RATES` | `books/config/table/forex_rates.sql` |

## How to look up an object

1. Read the `.sql` file — it has the `CREATE` DDL and, for config tables, seed `INSERT`s that show the real data shape.
2. If you don't know the object type, list the schema directory first:
   ```bash
   ls /Users/connor/source/repos/connors_snowflake_db/snowflake_objects/books/<schema>/
   ```
3. For procedures and views the SQL body is the ground truth for what the app actually receives.

Always read the relevant definition before writing or modifying a query.
