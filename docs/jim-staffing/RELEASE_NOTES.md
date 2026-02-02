## Release Notes — JIM Staffing® (Workforce Attendance)

Prepared by: **Joel S. Premier — Senior Software Engineer**

### Summary
Final production hardening for JIM Staffing® including security enforcement, E2E coverage, agency protections (rate limit + caching), and release documentation.

### Agency protections (internet-facing)
- Added rate limiting to `/api/staffing/v1/*` with strict limits on:
  - `/timecard/daily-rows` (60 req/min per key, 30 req/min per IP)
  - `/timecard/pdf` (10 req/min per key, 5 req/min per IP)
  - Burst (all routes): 5 req/sec per key, 3 req/sec per IP
- Rate limit responses:
  - `429 Too Many Requests`
  - `Retry-After: <seconds>`
  - JSON `{ "error": "rate_limited", "retryAfterSeconds": <n> }`
- Added PDF caching (30 min TTL) for `/timecard/pdf`:
  - `X-Cache: HIT|MISS`

### Tests
- Added backend tests to validate:
  - server-side verification enforcement (Wi‑Fi OR Location)
  - signature flow and PDF generation correctness
  - agency rate limiting + PDF caching behavior
- Added Playwright E2E tests for:
  - verification gating
  - clock in/out + signature
  - weekly PDF download parses and is one page

### Deployment notes
- Ensure production env disables dev bypass:
  - `STAFFING_WIFI_ALLOWLIST_DISABLED` should be unset/false in production
  - Set `STAFFING_ALLOWED_EGRESS_IPS` to DTX egress IPs
- Set agency API keys:
  - `STAFFING_API_KEY_PROLOGISTIX`
  - `STAFFING_API_KEY_STAFF_FORCE`

