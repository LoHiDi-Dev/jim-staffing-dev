import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma'
import type { StaffingAgency, StaffingBlockReason, StaffingEventStatus, StaffingEventType } from '@prisma/client'
import { evalWifiAllowlist, newPunchTokenSecret, sha256Hex, shouldBypassWifiAllowlistForUser, userAgentHash } from '../lib/staffingPunchSecurity'
import { InMemoryRateLimiter } from '../lib/staffingRateLimit'

const STAFFING_SITE = {
  address: '1130 E Kearney St, Mesquite, TX 75149',
  lat: 32.76919206739677,
  lng: -96.58379991502918,
  radiusMeters: 1609.344,
} as const

const DEVICE_ID_HEADER = 'x-staffing-device-id'
const PUNCH_TOKEN_HEADER = 'x-staffing-punch-token'
const IDEMPOTENCY_HEADER = 'x-idempotency-key'

const USER_PUNCH_LIMITER = new InMemoryRateLimiter(60_000, 10)
const IP_PUNCH_LIMITER = new InMemoryRateLimiter(60_000, 30)

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sin1 = Math.sin(dLat / 2)
  const sin2 = Math.sin(dLng / 2)
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const EventBody = z.object({
  type: z.enum(['CLOCK_IN', 'LUNCH_START', 'LUNCH_END', 'CLOCK_OUT']),
  clientReportedTimestamp: z.string().datetime().optional(),
  geo: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracyMeters: z.number().optional(),
    })
    .optional(),
  notes: z.string().optional(),
})

const WeekQuery = z.object({
  week: z.enum(['this', 'last']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
})

type DerivedState = {
  clockedIn: boolean
  onLunch: boolean
  lastActionLabel?: string
  lastSyncAt?: string
}

function deriveState(events: Array<{ type: StaffingEventType; status: StaffingEventStatus; serverTimestamp: Date }>): DerivedState {
  const ok = events.filter((e) => e.status === 'OK').sort((a, b) => a.serverTimestamp.getTime() - b.serverTimestamp.getTime())
  let clockedIn = false
  let onLunch = false
  let lunchStartAt: Date | null = null

  for (const e of ok) {
    if (e.type === 'CLOCK_IN') {
      clockedIn = true
      onLunch = false
      lunchStartAt = null
    }
    if (e.type === 'CLOCK_OUT') {
      clockedIn = false
      onLunch = false
      lunchStartAt = null
    }
    if (e.type === 'LUNCH_START') {
      onLunch = true
      lunchStartAt = e.serverTimestamp
    }
    if (e.type === 'LUNCH_END') {
      onLunch = false
      lunchStartAt = null
    }
  }

  // Auto-expire lunch after 30 minutes (MVP: lunch is fixed-length).
  if (clockedIn && onLunch && lunchStartAt && Date.now() - lunchStartAt.getTime() >= 30 * 60 * 1000) {
    onLunch = false
  }

  const last = ok[ok.length - 1]
  const lastActionLabel =
    last?.type === 'CLOCK_IN'
      ? `Clocked in at ${last.serverTimestamp.toLocaleTimeString()}`
      : last?.type === 'CLOCK_OUT'
        ? `Clocked out at ${last.serverTimestamp.toLocaleTimeString()}`
        : last?.type === 'LUNCH_START'
          ? `Lunch started at ${last.serverTimestamp.toLocaleTimeString()}`
          : last?.type === 'LUNCH_END'
            ? `Lunch ended at ${last.serverTimestamp.toLocaleTimeString()}`
            : undefined

  return { clockedIn, onLunch, lastActionLabel, lastSyncAt: new Date().toISOString() }
}

export const staffingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/staffing/me', async (req) => {
    const ctx = await app.requireSiteRole(req)
    const profile = await prisma.staffingContractorProfile.findUnique({ where: { userId: ctx.userId } })

    if (!profile) {
      return {
        eligible: false,
        reason: 'Not authorized for JIM Staffing.',
      }
    }

    const eligible = profile.isActive && (profile.employmentType === 'LTC' || profile.employmentType === 'STC')
    return {
      eligible: Boolean(eligible),
      employmentType: profile.employmentType,
      agency: profile.agency,
      reason: eligible ? undefined : 'Not authorized for JIM Staffing.',
    }
  })

  app.get('/staffing/me/state', async (req) => {
    const ctx = await app.requireSiteRole(req)
    const events = await prisma.staffingTimeEvent.findMany({
      where: { userId: ctx.userId },
      orderBy: { serverTimestamp: 'asc' },
      take: 500,
      select: { type: true, status: true, serverTimestamp: true },
    })
    return deriveState(events)
  })

  /**
   * Issues a short-lived punch token that must be provided to all punch endpoints.
   * Requires:
   * - contractor eligibility (LTC/STC)
   * - request originates from warehouse Wi‑Fi allowlist (or DEV_BYPASS in local dev)
   * - deviceId header present
   */
  app.post('/staffing/punch-token', async (req) => {
    const ctx = await app.requireSiteRole(req)

    const profile = await prisma.staffingContractorProfile.findUnique({ where: { userId: ctx.userId } })
    if (!profile) throw app.httpErrors.forbidden('Not authorized for JIM Staffing.')
    if (!(profile.isActive && (profile.employmentType === 'LTC' || profile.employmentType === 'STC'))) {
      throw app.httpErrors.forbidden('Not authorized for JIM Staffing.')
    }

    const deviceId = String(req.headers[DEVICE_ID_HEADER] ?? '').trim()
    if (!deviceId) throw app.httpErrors.badRequest('Missing device id.')

    const wifiRaw = evalWifiAllowlist(req)
    const wifi =
      wifiRaw.status === 'FAIL' && shouldBypassWifiAllowlistForUser(ctx.userId) ? { ...wifiRaw, status: 'DEV_BYPASS' as const } : wifiRaw
    if (wifi.status === 'FAIL') {
      throw app.httpErrors.forbidden('Clocking is only available on warehouse Wi-Fi.')
    }

    // Revoke any active tokens for this user+device (best-effort).
    await prisma.staffingPunchToken.updateMany({
      where: { userId: ctx.userId, deviceId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    })

    const { token, tokenHash } = newPunchTokenSecret()
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000)
    const uaHash = userAgentHash(req)

    const created = await prisma.staffingPunchToken.create({
      data: {
        userId: ctx.userId,
        deviceId,
        userAgentHash: uaHash,
        tokenHash,
        issuedAt: new Date(),
        expiresAt,
        revokedAt: null,
        lastSeenAt: null,
      },
      select: { id: true, expiresAt: true },
    })

    return {
      token,
      expiresAt: created.expiresAt.toISOString(),
      wifiAllowlistStatus: wifi.status,
    }
  })

  app.post('/staffing/events', async (req) => {
    const ctx = await app.requireSiteRole(req)
    const body = EventBody.parse(req.body)

    const profile = await prisma.staffingContractorProfile.findUnique({ where: { userId: ctx.userId } })
    if (!profile) throw app.httpErrors.forbidden('Not authorized for JIM Staffing.')
    if (!(profile.isActive && (profile.employmentType === 'LTC' || profile.employmentType === 'STC'))) {
      throw app.httpErrors.forbidden('Not authorized for JIM Staffing.')
    }

    const agency: StaffingAgency = profile.agency
    const userAgent = String(req.headers['user-agent'] ?? '')

    const wifiRaw = evalWifiAllowlist(req)
    const wifi =
      wifiRaw.status === 'FAIL' && shouldBypassWifiAllowlistForUser(ctx.userId) ? { ...wifiRaw, status: 'DEV_BYPASS' as const } : wifiRaw
    const ipAddress = wifi.ipAddress

    const deviceId = String(req.headers[DEVICE_ID_HEADER] ?? '').trim()
    const punchToken = String(req.headers[PUNCH_TOKEN_HEADER] ?? '').trim()
    const idempotencyKey = String(req.headers[IDEMPOTENCY_HEADER] ?? req.headers['x-idempotency-key'] ?? '').trim()

    // Load last OK events to validate state transitions.
    const events = await prisma.staffingTimeEvent.findMany({
      where: { userId: ctx.userId },
      orderBy: { serverTimestamp: 'asc' },
      take: 500,
      select: { type: true, status: true, serverTimestamp: true },
    })
    const state = deriveState(events)

    const requested = body.type as StaffingEventType
    let invalidState = false
    if (requested === 'CLOCK_IN' && state.clockedIn) invalidState = true
    if (requested === 'CLOCK_OUT' && !state.clockedIn) invalidState = true
    if (requested === 'LUNCH_START' && (!state.clockedIn || state.onLunch)) invalidState = true
    if (requested === 'LUNCH_END' && (!state.clockedIn || !state.onLunch)) invalidState = true

    const geo = body.geo
    const distanceMeters =
      geo ? haversineMeters({ lat: geo.lat, lng: geo.lng }, { lat: STAFFING_SITE.lat, lng: STAFFING_SITE.lng }) : null
    const inRange = distanceMeters != null ? distanceMeters <= STAFFING_SITE.radiusMeters : false

    const serverNow = new Date()
    const clientReported = body.clientReportedTimestamp ? new Date(body.clientReportedTimestamp) : null
    const driftMs = clientReported ? serverNow.getTime() - clientReported.getTime() : null
    const driftFlag = driftMs != null ? Math.abs(driftMs) >= 5 * 60 * 1000 : null

    const baseEvent = {
      userId: ctx.userId,
      siteId: ctx.siteId,
      agency,
      type: requested,
      serverTimestamp: serverNow,
      clientReportedTimestamp: clientReported,
      clientTimeDriftMs: driftMs != null ? Math.trunc(driftMs) : null,
      clientTimeDriftFlag: driftFlag,
      geoLat: geo?.lat ?? null,
      geoLng: geo?.lng ?? null,
      accuracyMeters: geo?.accuracyMeters ?? null,
      distanceMeters: distanceMeters ?? null,
      inRange,
      userAgent,
      notes: body.notes ?? null,
      ipAddress: ipAddress,
      wifiAllowlistStatus: wifi.status,
      deviceId: deviceId || null,
      idempotencyKey: idempotencyKey || null,
    } as const

    // MUST #1 — Warehouse Wi‑Fi allowlist
    if (wifi.status === 'FAIL') {
      await prisma.staffingTimeEvent.create({
        data: { ...baseEvent, status: 'BLOCKED', reason: 'NOT_ON_WAREHOUSE_WIFI' },
      })
      throw app.httpErrors.forbidden('Clocking is only available on warehouse Wi-Fi.')
    }

    // Device binding required for punch tokens
    if (!deviceId) {
      await prisma.staffingTimeEvent.create({
        data: { ...baseEvent, status: 'BLOCKED', reason: 'PERMISSION_DENIED' },
      })
      throw app.httpErrors.badRequest('Missing device id.')
    }

    // MUST #5 — Rate limits (best-effort in-memory)
    const ipKey = ipAddress ? `ip:${ipAddress}` : 'ip:unknown'
    const userKey = `user:${ctx.userId}`
    const ipHit = IP_PUNCH_LIMITER.hit(ipKey)
    const userHit = USER_PUNCH_LIMITER.hit(userKey)
    if (!ipHit.allowed || !userHit.allowed) {
      await prisma.staffingTimeEvent.create({
        data: { ...baseEvent, status: 'BLOCKED', reason: 'RATE_LIMITED' },
      })
      throw app.httpErrors.tooManyRequests('Too many clock attempts. Please wait and try again.')
    }

    // MUST #5 — Idempotency key required
    if (!idempotencyKey) {
      await prisma.staffingTimeEvent.create({
        data: { ...baseEvent, status: 'BLOCKED', reason: 'MISSING_IDEMPOTENCY_KEY' },
      })
      throw app.httpErrors.badRequest('Missing idempotency key.')
    }
    const exists = await prisma.staffingTimeEvent.findFirst({
      where: { idempotencyKey, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { id: true },
    })
    if (exists) {
      await prisma.staffingTimeEvent.create({
        data: { ...baseEvent, status: 'BLOCKED', reason: 'REUSED_IDEMPOTENCY_KEY' },
      })
      throw app.httpErrors.conflict('Duplicate clock request (idempotency key already used).')
    }

    // MUST #4 — Punch token required + bound to userId + deviceId (+ UA hash)
    if (!punchToken) {
      await prisma.staffingTimeEvent.create({
        data: { ...baseEvent, status: 'BLOCKED', reason: 'INVALID_PUNCH_TOKEN' },
      })
      throw app.httpErrors.forbidden('Session not authorized for clock actions. Please refresh.')
    }
    const tokenHash = sha256Hex(punchToken)
    const uaHash = userAgentHash(req)
    const tokenRow = await prisma.staffingPunchToken.findFirst({
      where: {
        userId: ctx.userId,
        deviceId,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: serverNow },
      },
      select: { id: true, userAgentHash: true },
    })
    if (!tokenRow || (tokenRow.userAgentHash && tokenRow.userAgentHash !== uaHash)) {
      await prisma.staffingTimeEvent.create({
        data: { ...baseEvent, status: 'BLOCKED', reason: 'INVALID_PUNCH_TOKEN' },
      })
      throw app.httpErrors.forbidden('Session not authorized for clock actions. Please refresh.')
    }
    await prisma.staffingPunchToken.update({ where: { id: tokenRow.id }, data: { lastSeenAt: serverNow } })

    // MUST #5 — Strict sequencing (invalid state blocks)
    const reason: StaffingBlockReason | null = invalidState ? 'INVALID_STATE' : null
    if (reason) {
      await prisma.staffingTimeEvent.create({
        data: { ...baseEvent, status: 'BLOCKED', reason, punchTokenId: tokenRow.id },
      })
      throw app.httpErrors.forbidden('Invalid clock state for this action.')
    }

    await prisma.staffingTimeEvent.create({
      data: { ...baseEvent, status: 'OK', reason: null, punchTokenId: tokenRow.id },
    })

    return { ok: true }
  })

  app.get('/staffing/my-times', async (req) => {
    const ctx = await app.requireSiteRole(req)
    const q = WeekQuery.parse(req.query)

    const now = new Date()
    const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

    let from: Date
    let to: Date
    if (q.dateFrom && q.dateTo) {
      from = new Date(q.dateFrom)
      to = new Date(q.dateTo)
    } else {
      const day = startOfDay(now)
      const dow = day.getUTCDay() // 0 Sun
      const mondayOffset = (dow + 6) % 7
      const monday = new Date(day)
      monday.setUTCDate(day.getUTCDate() - mondayOffset)
      const thisWeekStart = monday
      const thisWeekEnd = new Date(monday)
      thisWeekEnd.setUTCDate(monday.getUTCDate() + 7)
      if (q.week === 'last') {
        const lastStart = new Date(thisWeekStart)
        lastStart.setUTCDate(thisWeekStart.getUTCDate() - 7)
        const lastEnd = new Date(thisWeekStart)
        from = lastStart
        to = lastEnd
      } else {
        from = thisWeekStart
        to = thisWeekEnd
      }
    }

    const events = await prisma.staffingTimeEvent.findMany({
      where: { userId: ctx.userId, status: 'OK', serverTimestamp: { gte: from, lt: to } },
      orderBy: { serverTimestamp: 'asc' },
      select: { type: true, serverTimestamp: true },
    })

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      events: events.map((e) => ({ type: e.type, timestamp: e.serverTimestamp.toISOString() })),
    }
  })

  app.get('/staffing/my-times/export.csv', async (req, reply) => {
    const ctx = await app.requireSiteRole(req)
    const q = WeekQuery.parse(req.query)

    const from = q.dateFrom ? new Date(q.dateFrom) : new Date(Date.now() - 7 * 86400000)
    const to = q.dateTo ? new Date(q.dateTo) : new Date()

    const events = await prisma.staffingTimeEvent.findMany({
      where: { userId: ctx.userId, serverTimestamp: { gte: from, lt: to } },
      orderBy: { serverTimestamp: 'asc' },
    })

    const header = [
      'userId',
      'agency',
      'type',
      'status',
      'reason',
      'timestamp',
      'lat',
      'lng',
      'accuracyMeters',
      'distanceMeters',
      'inRange',
    ]
    const rows = events.map((e) => [
      e.userId,
      e.agency,
      e.type,
      e.status,
      e.reason ?? '',
      e.serverTimestamp.toISOString(),
      e.geoLat ?? '',
      e.geoLng ?? '',
      e.accuracyMeters ?? '',
      e.distanceMeters ?? '',
      e.inRange ?? '',
    ])
    const csv = [header, ...rows].map((r) => r.map((v) => String(v)).join(',')).join('\n') + '\n'

    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', `attachment; filename="JIM_Staffing_MyTimes_${ctx.userId}.csv"`)
    return reply.send(csv)
  })
}

