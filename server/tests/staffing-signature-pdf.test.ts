import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildTestApp, closeTestApp, cleanupTestUser, createTestUser, getPunchToken, login } from './helpers'
import { prisma } from '../src/prisma'

describe('signature flow + weekly PDF export', () => {
  const email = 'e2e-signature@jillamy.local'
  const pin = '1234'
  let siteId = ''

  beforeAll(async () => {
    const { site } = await createTestUser({ email, name: 'E2E Signature', pin, role: 'OPERATOR' })
    siteId = site.id
  })

  afterAll(async () => {
    await cleanupTestUser(email, siteId)
  })

  it('requires signature after clock-out and shows signature image in PDF', async () => {
    const app = await buildTestApp({
      // Force Wi‑Fi dev bypass so we can clock without geo in tests.
      STAFFING_WIFI_ALLOWLIST_DISABLED: '1',
    })
    try {
      const access = await login(app, { email, pin, siteId })
      const { token } = await getPunchToken(app, access)

      // Clock in
      const inRes = await app.inject({
        method: 'POST',
        url: '/api/v1/staffing/events',
        headers: {
          authorization: `Bearer ${access}`,
          'x-staffing-device-id': 'test-device',
          'x-staffing-punch-token': token,
          'x-idempotency-key': 'k-in',
        },
        payload: { type: 'CLOCK_IN' },
      })
      expect(inRes.statusCode).toBe(200)

      // Clock out
      const outRes = await app.inject({
        method: 'POST',
        url: '/api/v1/staffing/events',
        headers: {
          authorization: `Bearer ${access}`,
          'x-staffing-device-id': 'test-device',
          'x-staffing-punch-token': token,
          'x-idempotency-key': 'k-out',
        },
        payload: { type: 'CLOCK_OUT' },
      })
      expect(outRes.statusCode).toBe(200)
      const outJson = outRes.json() as { ok: true; shiftId: string; signatureRequired: boolean }
      expect(outJson.signatureRequired).toBe(true)

      // State should indicate signature required.
      const stateRes = await app.inject({
        method: 'GET',
        url: '/api/v1/staffing/me/state',
        headers: { authorization: `Bearer ${access}` },
      })
      expect(stateRes.statusCode).toBe(200)
      expect(stateRes.json()).toMatchObject({ signatureRequired: true, shiftId: outJson.shiftId })

      // Submit signature (tiny valid PNG data URL).
      const png1x1 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XbY0QAAAAASUVORK5CYII='

      const before = await prisma.staffingTimeEvent.findUnique({ where: { id: outJson.shiftId } })
      const sigRes = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${encodeURIComponent(outJson.shiftId)}/signature`,
        headers: { authorization: `Bearer ${access}` },
        payload: { signaturePngBase64: png1x1 },
      })
      expect(sigRes.statusCode).toBe(200)

      // Verify DB: signedAt set and signature stored; clockOutAt/serverTimestamp not mutated by signature.
      const shift = await prisma.staffingTimeEvent.findUnique({ where: { id: outJson.shiftId } })
      expect(shift?.signedAt).toBeTruthy()
      expect(shift?.signaturePngBase64).toContain('data:image/png;base64,')
      expect(shift?.type).toBe('CLOCK_OUT')
      expect(shift?.serverTimestamp?.toISOString()).toBe(before?.serverTimestamp?.toISOString())

      // Export weekly PDF and validate: PDF + 1 page.
      const pdfRes = await app.inject({
        method: 'GET',
        url: '/api/v1/staffing/my-times/export.pdf?week=this',
        headers: { authorization: `Bearer ${access}` },
      })
      expect(pdfRes.statusCode).toBe(200)
      expect(pdfRes.headers['content-type']).toMatch(/application\/pdf/i)

      const bytes = pdfRes.rawPayload as unknown as Uint8Array
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(1)
    } finally {
      await closeTestApp(app)
    }
  })
})

