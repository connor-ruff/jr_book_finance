# Repo purpose

This repository is for a web application that analyzes sales and ad expense data for the author Jen Ruff.
The data comes from Snowflake.

# High-Level App Structure

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