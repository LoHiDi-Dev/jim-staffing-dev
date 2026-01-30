# JIM Staffing Portal – Deploy Notes

The JIM Staffing portal is a standalone frontend app that talks to the main JIM API. Deploy it as a **separate** Vercel (or static) project.

## Vercel

- **Root directory**: Set the project root to `jim-staffing-dev` (or deploy from inside this folder).
- **Build**: `npm run build` (output: `dist/`).
- **Rewrites**: Already configured in `vercel.json` – all routes rewrite to `/index.html` for SPA routing.

## Environment variables (frontend)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | Base URL of the JIM API (e.g. `https://api.jim.example.com` or `https://your-jim-api.vercel.app`). No trailing slash. |

Set these in the Vercel project **Environment Variables**. The app is built at deploy time, so changes to env vars require a new deployment.

## Backend (main JIM server)

- The **main JIM server** must allow the staffing portal origin in **CORS**: add the staffing app URL to `CORS_ORIGIN` (e.g. `https://staffing.jim.example.com`).
- Staffing APIs live under the same server: `/api/v1/staffing/*` (authenticated) and `/api/staffing/v1/*` (agency API key). See repo root `server/env.example` for server-side env (e.g. DB, JWT, SMTP, `STAFFING_REPORT_RECIPIENTS`, `STAFFING_REPORT_CRON_SECRET`).

## Weekly report cron

To run the weekly staffing report on a schedule (e.g. every Monday):

1. Call **POST** `https://<JIM_API>/api/v1/staffing/cron/weekly-report` with either:
   - `Authorization: Bearer <STAFFING_REPORT_CRON_SECRET>`, or  
   - `x-cron-secret: <STAFFING_REPORT_CRON_SECRET>`
2. Configure `STAFFING_REPORT_RECIPIENTS` and SMTP on the JIM server so the report can be emailed.

You can trigger this from Vercel Cron (in the **main** JIM API project), or any external cron that can send an HTTP request with the secret.
