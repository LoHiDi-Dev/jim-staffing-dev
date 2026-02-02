import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, closeTestApp, cleanupTestUser, createTestUser } from './helpers'
import { prisma } from '../src/prisma'

describe('staffing agency endpoints: rate limiting + PDF caching', () => {
  const email = 'agency-e2e@jillamy.local'
  const pin = '1234'
  let siteId = ''
  let userId = ''

  beforeAll(async () => {
    const { user, site } = await createTestUser({ email, name: 'Agency E2E', pin, role: 'OPERATOR', agency: 'PROLOGISTIX' })
    siteId = site.id
    userId = user.id

    const t0 = new Date(Date.now() - 2 * 24 * 60 * 60_000)
    const clockIn = new Date(t0.getTime() + 9 * 60 * 60_000)
    const clockOut = new Date(t0.getTime() + 17 * 60 * 60_000)

    await prisma.staffingTimeEvent.createMany({
      data: [
        {
          userId,
          siteId,
          agency: 'PROLOGISTIX',
          type: 'CLOCK_IN',
          status: 'OK',
          serverTimestamp: clockIn,
          verificationMethod: 'wifi',
          wifiVerified: true,
          locationVerified: false,
        },
        {
          userId,
          siteId,
          agency: 'PROLOGISTIX',
          type: 'CLOCK_OUT',
          status: 'OK',
          serverTimestamp: clockOut,
          verificationMethod: 'wifi',
          wifiVerified: true,
          locationVerified: false,
        },
      ],
    })
  })

  afterAll(async () => {
    await cleanupTestUser(email, siteId)
  })

  it('returns X-Cache MISS then HIT for repeated PDF requests', async () => {
    const app = await buildTestApp({
      STAFFING_API_KEY_PROLOGISTIX: 'test-prologistix',
      STAFFING_API_KEY_STAFF_FORCE: 'test-staff-force',
    })
    try {
      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
      const dateTo = new Date(Date.now() + 1 * 24 * 60 * 60_000).toISOString()

      const r1 = await app.inject({
        method: 'GET',
        url: `/api/staffing/v1/timecard/pdf?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&userId=${encodeURIComponent(
          userId,
        )}&siteId=${encodeURIComponent(siteId)}`,
        headers: { authorization: 'Bearer test-prologistix', 'x-forwarded-for': '10.0.0.1' },
      })
      expect(r1.statusCode).toBe(200)
      expect(String(r1.headers['x-cache'] ?? '')).toBe('MISS')

      const r2 = await app.inject({
        method: 'GET',
        url: `/api/staffing/v1/timecard/pdf?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&userId=${encodeURIComponent(
          userId,
        )}&siteId=${encodeURIComponent(siteId)}`,
        headers: { authorization: 'Bearer test-prologistix', 'x-forwarded-for': '10.0.0.1' },
      })
      expect(r2.statusCode).toBe(200)
      expect(String(r2.headers['x-cache'] ?? '')).toBe('HIT')
    } finally {
      await closeTestApp(app)
    }
  })

  it('rate limits /timecard/pdf per IP (5/min) and includes Retry-After + JSON body', async () => {
    const app = await buildTestApp({
      STAFFING_API_KEY_PROLOGISTIX: 'test-prologistix',
    })
    try {
      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
      const dateTo = new Date(Date.now() + 1 * 24 * 60 * 60_000).toISOString()

      let last: { status: number; headers: any; body: string } | null = null
      for (let i = 0; i < 6; i += 1) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/staffing/v1/timecard/pdf?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&userId=${encodeURIComponent(
            userId,
          )}&siteId=${encodeURIComponent(siteId)}`,
          headers: { authorization: 'Bearer test-prologistix', 'x-forwarded-for': '10.0.0.2' },
        })
        last = { status: res.statusCode, headers: res.headers, body: res.body }
        // Avoid triggering burst limiter (3/sec IP).
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 350))
      }

      expect(last?.status).toBe(429)
      expect(String(last?.headers['retry-after'] ?? '')).toMatch(/^\d+$/)
      const parsed = JSON.parse(String(last?.body ?? '{}')) as { error?: string; retryAfterSeconds?: number }
      expect(parsed.error).toBe('rate_limited')
      expect(typeof parsed.retryAfterSeconds).toBe('number')
    } finally {
      await closeTestApp(app)
    }
  })

  it('rate limits /timecard/pdf per agency key (10/min), independent of IP', async () => {
    const app = await buildTestApp({
      STAFFING_API_KEY_PROLOGISTIX: 'test-prologistix',
    })
    try {
      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
      const dateTo = new Date(Date.now() + 1 * 24 * 60 * 60_000).toISOString()

      let blocked: any = null
      for (let i = 0; i < 11; i += 1) {
        const ip = `10.0.1.${i + 1}`
        // eslint-disable-next-line no-await-in-loop
        const res = await app.inject({
          method: 'GET',
          url: `/api/staffing/v1/timecard/pdf?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&userId=${encodeURIComponent(
            userId,
          )}&siteId=${encodeURIComponent(siteId)}`,
          headers: { authorization: 'Bearer test-prologistix', 'x-forwarded-for': ip },
        })
        if (res.statusCode === 429) {
          blocked = { headers: res.headers, body: res.body }
          break
        }
        // Avoid triggering key burst limiter (5/sec) deterministically.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250))
      }

      expect(blocked).toBeTruthy()
      expect(String(blocked.headers['retry-after'] ?? '')).toMatch(/^\d+$/)
      const parsed = JSON.parse(String(blocked.body ?? '{}')) as { error?: string }
      expect(parsed.error).toBe('rate_limited')
    } finally {
      await closeTestApp(app)
    }
  })

  it('enforces burst limit on /timecard/daily-rows per IP (3/sec)', async () => {
    const app = await buildTestApp({
      STAFFING_API_KEY_PROLOGISTIX: 'test-prologistix',
    })
    try {
      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
      const dateTo = new Date(Date.now() + 1 * 24 * 60 * 60_000).toISOString()

      let last = 0
      for (let i = 0; i < 4; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const res = await app.inject({
          method: 'GET',
          url: `/api/staffing/v1/timecard/daily-rows?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(
            dateTo,
          )}&userId=${encodeURIComponent(userId)}&siteId=${encodeURIComponent(siteId)}`,
          headers: { authorization: 'Bearer test-prologistix', 'x-forwarded-for': '10.0.0.3' },
        })
        last = res.statusCode
      }

      expect(last).toBe(429)
    } finally {
      await closeTestApp(app)
    }
  })
})

