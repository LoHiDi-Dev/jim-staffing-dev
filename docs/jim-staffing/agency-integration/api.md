## Agency API (`/api/staffing/v1`)

Prepared by: **Joel S. Premier — Senior Software Engineer**

### Authentication
All requests require:
- `Authorization: Bearer <API_KEY>`

If missing/invalid:
- `401 Unauthorized` with message `Missing API key.` or `Invalid API key.`

### Rate limiting
All agency endpoints are rate limited (best-effort in-memory):

- `/timecard/daily-rows`
  - 60 req/min per agency key
  - 30 req/min per IP
- `/timecard/pdf`
  - 10 req/min per agency key
  - 5 req/min per IP
- Burst (all routes)
  - 5 req/sec per agency key
  - 3 req/sec per IP

On limit hit:
- `429 Too Many Requests`
- `Retry-After: <seconds>`
- JSON: `{ "error": "rate_limited", "retryAfterSeconds": <n> }`

### PDF caching
`/timecard/pdf` is cached for **30 minutes** by:
`agencyId + siteId + userId + weekStart + weekEnd + pdfTemplateVersion`

Response header:
- `X-Cache: HIT|MISS`

### Conventions
- **Timestamps**: ISO-8601 UTC strings
- **dateFrom/dateTo**: `datetime` strings
- **Agency isolation**: the API key determines which agency’s data is accessible

### GET `/time-records`
List raw attendance events for the agency.

**Query**
- `dateFrom` (required, datetime)
- `dateTo` (required, datetime)
- `userId` (optional)
- `status` (optional: `OK | BLOCKED | ADJUSTED`)
- `limit` (optional, default 200, max 1000)
- `offset` (optional, default 0)

### GET `/weekly-summary`
Weekly aggregation (MVP): total hours and days worked per user.

**Query**
- `dateFrom` (required, datetime)
- `dateTo` (required, datetime)

### GET `/timecard/daily-rows`
Returns **7 daily rows + totals** for a single user in the requested range.

**Query**
- `dateFrom` (required, datetime)
- `dateTo` (required, datetime)
- `userId` (required)
- `siteId` (optional; if provided, filters time events by site)

**Response fields (per day)**
- `shift`: `DAY | NIGHT | —`
- `timeIn`, `timeOut`: ISO or `null`
- `lunchMinutes`: 30 when work exists, else 0
- `hours`: decimal hours (lunch subtracted)
- `verifiedVia`: Wi-Fi / Location / Wi-Fi + Location / transitions
- `signed`: true/false/null (null when no work)

### GET `/timecard/pdf`
One-page PDF export for agency consumption (best-effort).

**Query**
- `dateFrom` (required, datetime)
- `dateTo` (required, datetime)
- `userId` (required)
- `siteId` (optional)

