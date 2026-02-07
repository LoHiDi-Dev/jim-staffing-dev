import { defineConfig, devices } from '@playwright/test'

// Use an isolated schema for Playwright to avoid interference with local dev DB state.
// Also make it unique per run to avoid getting stuck on a previously failed migration.
const PLAYWRIGHT_SCHEMA = process.env.PLAYWRIGHT_DB_SCHEMA ?? `playwright_e2e_${Date.now()}`
const DATABASE_URL = process.env.DATABASE_URL ?? `postgresql://jim:jim@localhost:5432/jim?schema=${PLAYWRIGHT_SCHEMA}`
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'change-me-change-me-change-me'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'change-me-change-me-change-me'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  // Start backend + frontend for E2E runs.
  webServer: [
    {
      command:
        'cd server && ' +
        `export DATABASE_URL="${DATABASE_URL}" ` +
        `JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET}" ` +
        `JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET}" ` +
        'CORS_ORIGIN="http://localhost:5174" ' +
        'PORT=8787 ' +
        // Allow Test Test to punch off-site for test coverage.
        'STAFFING_WIFI_ALLOWLIST_BYPASS_USER_IDS="dtx-tt-1234@jillamy.local"; ' +
        'npx prisma migrate deploy && npx prisma generate && npm run db:seed && npm run dev',
      port: 8787,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'VITE_API_BASE_URL="http://localhost:8787/api/v1" npm run dev -- --host 127.0.0.1 --port 5174',
      port: 5174,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})

