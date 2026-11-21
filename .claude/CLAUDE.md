# Repo purpose

This repository is related to sales and ad expense data for the author Jen Ruff.
It is comprised of two primary things:

- `refresh_helpers/` - various functions to help download and stage the latest data
- `finance_app` - a web application that analyzes sales and ad expense data for the author Jen Ruff.

Additionally, this repo serves as the central pwd for all work involving Jen Ruff finance. 
Other relevant repos, which should be already injected into this claude session:
- **connors_snowflake_db**: the snowflake ddl manager for the snowflake architecture 
    - Note: this repo is for the entire account, but it is just the **books** database that is relevant for thsi proejct
- **aws_iac_mngr**: the terraform iac repo for AWS resources relevant for this project
    - Note: this repo also contains much much more than just objects for this project

Note that each of these repos have their own CLAUDE.md file that may be useful when working in those repos

# High-Level App Structure

**Note: this section describes the contents of the `finance_app/` folder**

Next.js 15 app router. All dashboard pages live under `app/(dashboard)/` and require authentication via a simple HMAC-signed session cookie (`lib/auth/session.ts`). The middleware (`middleware.ts`) enforces auth on every route except `/login` and `/api/auth/`.

**Routing**
- `/sales/*` — sales/royalty reports (currently: total-royalty, book-language)
- `/config/*` — config/reference data views (currently: summary)
- `/api/reports/*` — API routes that query Snowflake and return JSON
- `/api/config/*` — API routes for config data
- `/api/auth/` — login/logout (exempt from auth middleware)

**Data layer**
- Snowflake is the sole data source. `lib/snowflake/client.ts` manages a singleton connection using key-pair JWT auth.
- Query functions live in `lib/snowflake/queries.ts` (report queries) and `lib/snowflake/config-queries.ts` (config/reference queries).
- Types for API responses are in `lib/types/reports.ts` and `lib/types/config.ts`.

**Frontend**
- Dashboard pages fetch from their corresponding `/api/` routes client-side.
- `components/layout/sidebar.tsx` drives the nav; add new pages there too.
- Styling is Tailwind.

# Helpers Info

Each source has a README.md that describes the manual process that goes into refresh data:
- `refresh_helpers/kdp/README.md`
- `refresh_helpers/acx/README.md`