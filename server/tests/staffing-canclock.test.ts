import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeTestApp, createTestUser, cleanupTestUser, buildTestApp, getPunchToken, login } from './helpers'

describe('staffing clock enforcement (server-side)', () => {
  const email = 'e2e-canclock@jillamy.local'
  const pin = '1234'
  let siteId = ''

  beforeAll(async () => {
    const { site } = await createTestUser({ email, name: 'E2E CanClock', pin, role: 'OPERATOR' })
    siteId = site.id
  })

  afterAll(async () => {
    await cleanupTestUser(email, siteId)
  })

  it('blocks clock when neither Wi-Fi nor location are verified', async () => {
    const app = await buildTestApp({
      // Ensure Wi‑Fi allowlist is enforced (no dev bypass).
      STAFFING_WIFI_ALLOWLIST_DISABLED: undefined,
      STAFFING_ALLOWED_EGRESS_IPS: '',
      STAFFING_WIFI_ALLOWLIST_BYPASS_USER_IDS: '',
    })
    try {
      const access = await login(app, { email, pin, siteId })
      const { token } = await getPunchToken(app, access)

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/staffing/events',
        headers: {
          authorization: `Bearer ${access}`,
          'x-staffing-device-id': 'test-device',
          'x-staffing-punch-token': token,
          'x-idempotency-key': 'k1',
        },
        payload: { type: 'CLOCK_IN' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.body).toMatch(/Clock in\/out requires/i)
    } finally {
      await closeTestApp(app)
    }
  })

  it('allows clock when location is verified (Wi-Fi not verified)', async () => {
    const app = await buildTestApp({
      STAFFING_WIFI_ALLOWLIST_DISABLED: undefined,
      STAFFING_ALLOWED_EGRESS_IPS: '',
      STAFFING_WIFI_ALLOWLIST_BYPASS_USER_IDS: '',
    })
    try {
      const access = await login(app, { email, pin, siteId })
      const { token } = await getPunchToken(app, access)

      // DTX geofence center from server constants.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/staffing/events',
        headers: {
          authorization: `Bearer ${access}`,
          'x-staffing-device-id': 'test-device',
          'x-staffing-punch-token': token,
          'x-idempotency-key': 'k2',
        },
        payload: { type: 'CLOCK_IN', geo: { lat: 32.76919206739677, lng: -96.58379991502918, accuracyMeters: 10 } },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ ok: true })
    } finally {
      await closeTestApp(app)
    }
  })
})

