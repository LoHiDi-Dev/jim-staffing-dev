# JIM Staffing – Deploy Notes

JIM Staffing is a **standalone** app:

- **Frontend**: Vite + React (this folder)
- **API server**: Fastify + Prisma (in `server/`)

Deploy the frontend and API server as **separate deploys** (recommended), or run together locally.

## Local development

**You must start the database first.** The staffing server uses PostgreSQL on port **5433** by default.

1. **Start PostgreSQL** (from `jim-staffing-dev/`):
   - **Option A (Docker):** Start Docker Desktop, then run:
     ```bash
     docker compose up -d db
     ```
   - **Option B:** Use a local Postgres on port 5433 with user `jim`, password `jim`, database `jim` (see `server/env.example`).
2. **Install dependencies**:
   ```bash
   npm install
   cd server && npm install
   ```
3. **Apply schema and seed** (creates contractor user "Test test" at DTX):
   ```bash
   cd server
   npx prisma migrate dev
   npx prisma db seed
   ```
4. **Start the API server**:
   ```bash
   cd server
   npm run dev
   ```
   The API listens on `http://localhost:8787` and serves:
   - Authenticated staffing endpoints under `/api/v1/staffing/*`
   - Agency API under `/api/staffing/v1/*`
5. **Start the frontend**:
   ```bash
   cd ..
   npm run dev
   ```
   The frontend listens on `http://localhost:5174`.

### Local auth / proxy

The frontend can talk to the API in two ways:

- **Same-origin via proxy (recommended for local)**:
  - Vite proxies `/api/*` → `http://localhost:8787`
  - Set `VITE_API_BASE_URL=http://localhost:5174/api/v1`
- **Direct to API**:
  - Set `VITE_API_BASE_URL=http://localhost:8787/api/v1`

### Test user (DTX)

Log in at `http://localhost:5174/login` with:

- Step 1: **Returning User**
- Step 2: **DTX**
- Step 3: **Full Name**
- Step 4: First name **Test**, Last name **test**
- Step 5: PIN **1234**

## Frontend deploy (Vercel/static)

- **Root directory**: `jim-staffing-dev`
- **Build**: `npm run build` (output: `dist/`)
- **Rewrites**: `vercel.json` rewrites all routes to `/index.html` for SPA routing.

### Frontend env vars

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | API base URL, including `/api/v1` (no trailing slash). |
| `VITE_STAFFING_SITE_LAT` | Yes | Geo-fence center latitude. |
| `VITE_STAFFING_SITE_LNG` | Yes | Geo-fence center longitude. |
| `VITE_STAFFING_RADIUS_METERS` | Yes | Geo-fence radius in meters (1 mile = 1609.344). |

## API server deploy

Deploy the `server/` folder as a Node service.

### Server env vars

See `server/env.example`. Required:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN`
- `PORT`

Staffing agency API keys (MVP env-based):

- `STAFFING_API_KEY_PROLOGISTIX`
- `STAFFING_API_KEY_STAFF_FORCE`
- `STAFFING_API_KEY_BLUECREW`

## Weekly report cron (Friday 5:00 PM CT)

This server exposes a cron endpoint:

- `POST /api/v1/staffing/cron/weekly-report`

Secure it with:

- `Authorization: Bearer <STAFFING_REPORT_CRON_SECRET>` **or**
- `x-cron-secret: <STAFFING_REPORT_CRON_SECRET>`

Schedule an external cron (Vercel Cron / GitHub Actions / etc.) to call it **Friday 5:00 PM CT**, and configure:

- `STAFFING_REPORT_RECIPIENTS=email1,email2`
- SMTP env vars (see `server/env.example`)
