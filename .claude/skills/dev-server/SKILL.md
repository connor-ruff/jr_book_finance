---
name: dev-server
description: Start, stop, restart, or check the status of the finance_app Next.js dev server on localhost:3000. Use when asked to run, spin up, or shut down the app locally.
allowed-tools: Bash
---

Start/stop the `finance_app/` dev server (Next.js 15, `npm run dev`, default port 3000).

Repo root: `/Users/connor/source/repos/jr_book_finance`

## Quick reference (run these yourself, no Claude needed)

```bash
# Start (foreground, Ctrl+C to stop)
cd /Users/connor/source/repos/jr_book_finance/finance_app && npm run dev

# Start (background, logs to /tmp/finance_app_dev.log)
cd /Users/connor/source/repos/jr_book_finance/finance_app && nohup npm run dev > /tmp/finance_app_dev.log 2>&1 &

# Status: is anything listening on 3000?
lsof -nP -iTCP:3000 -sTCP:LISTEN

# Stop (background server)
lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill

# Tail logs (background server)
tail -f /tmp/finance_app_dev.log
```

Then open http://localhost:3000 — you'll be redirected to `/login` (password is `SITE_PASSWORD` in `finance_app/.env.local`).

## Prerequisites

- `finance_app/node_modules` exists; if not, run `npm install` in `finance_app/`.
- `finance_app/.env.local` exists (copy from `.env.local.example`). It needs `SITE_PASSWORD`, `SESSION_SECRET`, and the `SNOWFLAKE_*` vars, including `SNOWFLAKE_PRIVATE_KEY_PATH` pointing at the `.p8` key. Without Snowflake creds the pages load but the API routes error.

## Instructions for Claude

- **Start**: first check port 3000 with the status command; if already listening, say so rather than starting a second server (Next would silently pick 3001). Otherwise start in the background (use `run_in_background`) and confirm with `curl -sI http://localhost:3000 | head -1` once it prints "Ready".
- **Stop**: kill only the PID listening on 3000 (command above). Report if nothing was running.
- **Restart**: stop, then start.
- If port 3000 is occupied by something that isn't this app (check `ps -p <pid> -o command=`), tell the user instead of killing it.
- Other useful scripts in `finance_app/`: `npm run typecheck`, `npm run lint`, `npm run build`.
