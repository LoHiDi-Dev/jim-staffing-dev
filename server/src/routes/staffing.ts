import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { prisma } from '../prisma.js'
import type { StaffingAgency, StaffingBlockReason, StaffingEventStatus, StaffingEventType } from '@prisma/client'
import { evalWifiAllowlist, newPunchTokenSecret, sha256Hex, shouldBypassWifiAllowlistForUser, userAgentHash } from '../lib/staffingPunchSecurity.js'
import { InMemoryRateLimiter } from '../lib/staffingRateLimit.js'

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
  wifiAllowlistStatus?: 'PASS' | 'FAIL' | 'DEV_BYPASS'
  signatureRequired?: boolean
  shiftId?: string | null
}

function deriveClockState(events: Array<{ type: StaffingEventType; status: StaffingEventStatus; serverTimestamp: Date }>): DerivedState {
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

function resolveWeekRange(q: { week?: 'this' | 'last'; dateFrom?: string; dateTo?: string }): { from: Date; to: Date } {
  const startOfDayUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const startOfWeekSundayUTC = (d: Date) => {
    const day = startOfDayUTC(d)
    const dow = day.getUTCDay() // 0 Sun
    const sunday = new Date(day)
    sunday.setUTCDate(day.getUTCDate() - dow)
    return sunday
  }

  if (q.dateFrom && q.dateTo) return { from: new Date(q.dateFrom), to: new Date(q.dateTo) }

  const now = new Date()
  const thisWeekStart = startOfWeekSundayUTC(now)
  const thisWeekEnd = new Date(thisWeekStart)
  thisWeekEnd.setUTCDate(thisWeekStart.getUTCDate() + 7)

  if (q.week === 'last') {
    const lastStart = new Date(thisWeekStart)
    lastStart.setUTCDate(thisWeekStart.getUTCDate() - 7)
    const lastEnd = new Date(thisWeekStart)
    return { from: lastStart, to: lastEnd }
  }

  return { from: thisWeekStart, to: thisWeekEnd }
}

const verifiedLabel = (m: string | null | undefined) => {
  if (!m || m === 'none') return '—'
  if (m === 'wifi') return 'Wi-Fi'
  if (m === 'location') return 'Location'
  if (m === 'both') return 'Wi-Fi + Location'
  return String(m)
}

async function buildWeeklyDailyRows(args: { userId: string; siteId?: string | null; from: Date; to: Date }) {
  const queryFrom = new Date(args.from.getTime() - 12 * 60 * 60_000)
  const queryTo = new Date(args.to.getTime() + 12 * 60 * 60_000)
  const raw = await prisma.staffingTimeEvent.findMany({
    where: {
      userId: args.userId,
      status: 'OK',
      serverTimestamp: { gte: queryFrom, lt: queryTo },
      ...(args.siteId ? { siteId: args.siteId } : {}),
    },
    orderBy: { serverTimestamp: 'asc' },
    select: {
      type: true,
      serverTimestamp: true,
      verificationMethod: true,
      signedAt: true,
      signaturePngBase64: true,
      shiftType: true,
    },
  })

  type Segment = {
    clockInAt: Date
    clockOutAt: Date
    ms: number
    shiftType: 'DAY' | 'NIGHT'
    verifiedSeq: string[]
    signed: boolean
    signaturePngBase64?: string | null
  }

  const segments: Segment[] = []
  let open: { at: Date; events: typeof raw } | null = null
  for (const e of raw) {
    if (e.type === 'CLOCK_IN') {
      open = { at: e.serverTimestamp, events: [e] }
      continue
    }
    if (!open) continue
    open.events.push(e)
    if (e.type !== 'CLOCK_OUT') continue

    const clockInAt = open.at
    const clockOutAt = e.serverTimestamp
    const ms = Math.max(0, clockOutAt.getTime() - clockInAt.getTime())
    const shiftType = (e.shiftType as 'DAY' | 'NIGHT' | null) ?? (clockInAt.getUTCHours() >= 6 && clockInAt.getUTCHours() < 18 ? 'DAY' : 'NIGHT')
    const verifiedSeq = open.events
      .map((x) => verifiedLabel(x.verificationMethod as string | null | undefined))
      .filter((v) => v !== '—')
      .filter((v, idx, arr) => (idx === 0 ? true : v !== arr[idx - 1]))
    const signed = Boolean(e.signedAt || e.signaturePngBase64)
    segments.push({
      clockInAt,
      clockOutAt,
      ms,
      shiftType,
      verifiedSeq,
      signed,
      signaturePngBase64: e.signaturePngBase64,
    })
    open = null
  }

  const dayKeyUTC = (d: Date) => d.toISOString().slice(0, 10)
  const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60_000)
  const days = Array.from({ length: 7 }).map((_, i) => addDays(args.from, i))
  const dayKeys = days.map((d) => dayKeyUTC(d))

  const rows = dayKeys.map((key, idx) => {
    const segs = segments.filter((s) => dayKeyUTC(s.clockInAt) === key)
    let firstIn: Date | null = null
    let lastOut: Date | null = null
    let totalMs = 0
    let hasSignature = false
    let signaturePngBase64: string | null = null
    const methodSeq: string[] = []
    let shift: 'DAY' | 'NIGHT' | '—' = '—'
    for (const s of segs) {
      if (!firstIn || s.clockInAt.getTime() < firstIn.getTime()) firstIn = s.clockInAt
      if (!lastOut || s.clockOutAt.getTime() > lastOut.getTime()) lastOut = s.clockOutAt
      totalMs += s.ms
      if (shift === '—') shift = s.shiftType
      if (s.signed) {
        hasSignature = true
        signaturePngBase64 ||= s.signaturePngBase64 ?? null
      }
      for (const m of s.verifiedSeq) methodSeq.push(m)
    }
    const hasWork = totalMs > 0
    const lunchMs = hasWork ? 30 * 60_000 : 0
    const hours = Math.max(0, totalMs - lunchMs) / 3_600_000
    const normalizedMethods = methodSeq.filter((v, i2, arr) => (i2 === 0 ? true : v !== arr[i2 - 1]))
    const distinct = Array.from(new Set(normalizedMethods))
    const verifiedVia = !hasWork
      ? '—'
      : distinct.length <= 1
        ? normalizedMethods[0] ?? '—'
        : `${normalizedMethods[0]} → ${normalizedMethods[normalizedMethods.length - 1]}`
    return {
      dayIndex: idx,
      date: key,
      shift: hasWork ? shift : '—',
      timeIn: firstIn ? firstIn.toISOString() : null,
      timeOut: lastOut ? lastOut.toISOString() : null,
      lunchMinutes: hasWork ? 30 : 0,
      hours,
      verifiedVia,
      signed: hasWork ? hasSignature : null,
      signaturePngBase64,
    }
  })

  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0)
  return { rows, totals: { hours: totalHours } }
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
    const wifiRaw = evalWifiAllowlist(req)
    const wifi =
      wifiRaw.status === 'FAIL' && shouldBypassWifiAllowlistForUser(ctx.userId, ctx.email) ? { ...wifiRaw, status: 'DEV_BYPASS' as const } : wifiRaw
    const events = await prisma.staffingTimeEvent.findMany({
      where: { userId: ctx.userId },
      orderBy: { serverTimestamp: 'asc' },
      take: 500,
      select: { id: true, type: true, status: true, serverTimestamp: true, signedAt: true, signaturePngBase64: true },
    })
    const base = deriveClockState(events)
    const ok = events.filter((e) => e.status === 'OK').sort((a, b) => a.serverTimestamp.getTime() - b.serverTimestamp.getTime())
    const last = ok[ok.length - 1]
    const signatureRequired = Boolean(last && last.type === 'CLOCK_OUT' && !last.signedAt && !last.signaturePngBase64)
    return {
      ...base,
      wifiAllowlistStatus: wifi.status,
      signatureRequired,
      shiftId: signatureRequired ? last!.id : null,
    }
  })

  /**
   * Issues a short-lived punch token that must be provided to all punch endpoints.
   * Requires:
   * - contractor eligibility (LTC/STC)
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
      wifiRaw.status === 'FAIL' && shouldBypassWifiAllowlistForUser(ctx.userId, ctx.email) ? { ...wifiRaw, status: 'DEV_BYPASS' as const } : wifiRaw
    // NOTE: punch tokens are intentionally allowed even when Wi‑Fi allowlist fails.
    // Enforcement is performed per punch using (Wi‑Fi OR verified location), so a contractor can clock using location-only verification.

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
      wifiRaw.status === 'FAIL' && shouldBypassWifiAllowlistForUser(ctx.userId, ctx.email) ? { ...wifiRaw, status: 'DEV_BYPASS' as const } : wifiRaw
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
    const state = deriveClockState(events)

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
    const accuracyOk = geo?.accuracyMeters != null ? geo.accuracyMeters <= 200 : geo ? true : false

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
      wifiVerified: wifi.status === 'PASS' || wifi.status === 'DEV_BYPASS',
      locationVerified: Boolean(geo && inRange && accuracyOk),
      verificationMethod:
        (wifi.status === 'PASS' || wifi.status === 'DEV_BYPASS') && geo && inRange && accuracyOk
          ? 'both'
          : wifi.status === 'PASS' || wifi.status === 'DEV_BYPASS'
            ? 'wifi'
            : geo && inRange && accuracyOk
              ? 'location'
              : 'none',
      userAgent,
      notes: body.notes ?? null,
      ipAddress: ipAddress,
      wifiAllowlistStatus: wifi.status,
      deviceId: deviceId || null,
      idempotencyKey: idempotencyKey || null,
    } as const

    // MUST #1 — Verification required: (warehouse Wi‑Fi allowlist) OR (location check).
    const wifiOk = wifi.status === 'PASS' || wifi.status === 'DEV_BYPASS'
    const locOk = Boolean(geo && inRange && accuracyOk)
    if (!wifiOk && !locOk) {
      let reason: StaffingBlockReason = 'PERMISSION_DENIED'
      let msg = 'Clock in/out requires verified warehouse Wi-Fi or a verified location check.'
      if (!geo) {
        reason = 'LOCATION_UNAVAILABLE'
        msg = 'Clock in/out requires a location check (tap Verify location) or verified warehouse Wi-Fi.'
      } else if (!accuracyOk) {
        reason = 'ACCURACY_LOW'
        msg = 'Clock in/out requires an accurate location fix. Try Verify location again.'
      } else if (!inRange) {
        reason = 'OUT_OF_RANGE'
        msg = 'Clock in/out requires being within range of the site geofence or verified warehouse Wi-Fi.'
      }
      await prisma.staffingTimeEvent.create({
        data: { ...baseEvent, status: 'BLOCKED', reason },
      })
      throw app.httpErrors.forbidden(msg)
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

    const created = await prisma.staffingTimeEvent.create({
      data: { ...baseEvent, status: 'OK', reason: null, punchTokenId: tokenRow.id },
      select: { id: true },
    })

    if (requested === 'CLOCK_OUT') {
      // MVP: signature is required after every clock-out (submit via /attendance/:shiftId/signature).
      return { ok: true, shiftId: created.id, signatureRequired: true }
    }

    return { ok: true }
  })

  app.get('/staffing/my-times', async (req) => {
    const ctx = await app.requireSiteRole(req)
    const q = WeekQuery.parse(req.query)
    const { from, to } = resolveWeekRange({ week: q.week, dateFrom: q.dateFrom, dateTo: q.dateTo })

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

    const { from, to } = resolveWeekRange({ week: q.week, dateFrom: q.dateFrom, dateTo: q.dateTo })

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

  app.get('/staffing/my-times/export.pdf', async (req, reply) => {
    const ctx = await app.requireSiteRole(req)
    const q = WeekQuery.parse(req.query)
    const { from, to } = resolveWeekRange({ week: q.week, dateFrom: q.dateFrom, dateTo: q.dateTo })

    const profile = await prisma.staffingContractorProfile.findUnique({ where: { userId: ctx.userId } })
    if (!profile) throw app.httpErrors.forbidden('Not authorized for JIM Staffing.')
    const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, email: true } })

    const { rows, totals } = await buildWeeklyDailyRows({ userId: ctx.userId, siteId: ctx.siteId, from, to })

    const pdf = await PDFDocument.create()
    const page = pdf.addPage([612, 792])
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const tz = 'America/Chicago'
    const safe = (t: string) =>
      String(t ?? '')
        .replace(/→/g, '->')
        .replace(/\u2014/g, '-') // em dash
        .replace(/\u2013/g, '-') // en dash

    const canonicalUserId = (() => {
      const email = String(user?.email ?? ctx.email ?? '').trim().toLowerCase()
      const local = email.includes('@') ? email.split('@')[0]! : ''
      if (!local) return ctx.userId
      return local.replace(/[^a-z0-9-]/g, '-').toUpperCase()
    })()

    const fmtDateSlash = (isoYmd: string): string => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd)
      if (!m) return isoYmd
      return `${m[2]}/${m[3]}/${m[1]}`
    }

    const weekdayShortFromYmd = (isoYmd: string): string => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd)
      if (!m) return '—'
      const y = Number(m[1])
      const mo = Number(m[2]) - 1
      const d = Number(m[3])
      const dt = new Date(Date.UTC(y, mo, d, 12, 0, 0))
      return dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    }

    const fmtTime = (iso: string | null) => {
      if (!iso) return '—'
      try {
        return new Date(iso).toLocaleTimeString('en-US', {
          timeZone: tz,
          hour: 'numeric',
          minute: '2-digit',
        })
      } catch {
        return iso.slice(11, 16)
      }
    }
    const rangeFromYmd = from.toISOString().slice(0, 10)
    const rangeToInclusiveYmd = new Date(to.getTime() - 1).toISOString().slice(0, 10)
    const weekLabel = `${fmtDateSlash(rangeFromYmd)} – ${fmtDateSlash(rangeToInclusiveYmd)}`

    const generatedAt = (() => {
      const now = new Date()
      const date = now.toLocaleDateString('en-US', { timeZone: tz, month: '2-digit', day: '2-digit', year: 'numeric' })
      const time = now.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
      return `${date} ${time} CT`
    })()

    const drawText = (t: string, x: number, y: number, opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }) => {
      const size = opts?.size ?? 10
      const bold = Boolean(opts?.bold)
      page.drawText(safe(t), {
        x,
        y,
        size,
        font: bold ? fontBold : font,
        color: opts?.color,
      })
    }

    // Palette (close to app)
    const brand = rgb(30 / 255, 58 / 255, 138 / 255) // --brand-primary
    const slate900 = rgb(15 / 255, 23 / 255, 42 / 255)
    const slate700 = rgb(51 / 255, 65 / 255, 85 / 255)
    const slate600 = rgb(71 / 255, 85 / 255, 105 / 255)
    const slate200 = rgb(226 / 255, 232 / 255, 240 / 255)
    const slate100 = rgb(241 / 255, 245 / 255, 249 / 255)
    const white = rgb(1, 1, 1)

    // Header (matches the PDF you provided)
    drawText('JIM Staffing®', 36, 760, { bold: true, size: 16, color: brand })
    drawText('Workforce Attendance', 36, 742, { size: 11, color: slate600 })
    drawText('Weekly Timecard', 36, 722, { bold: true, size: 14, color: slate900 })
    drawText(`Site: ${ctx.siteId ?? '—'}`, 36, 704, { size: 10, color: slate700 })
    drawText(`Week: ${weekLabel}`, 36, 690, { size: 10, color: slate700 })
    drawText(`Generated: ${generatedAt}`, 36, 676, { size: 10, color: slate600 })

    // Summary stats (computed like the old PDF)
    const daysWorked = rows.filter((r) => (r.hours ?? 0) > 0).length
    const dayShifts = rows.filter((r) => (r.hours ?? 0) > 0 && r.shift === 'DAY').length
    const nightShifts = rows.filter((r) => (r.hours ?? 0) > 0 && r.shift === 'NIGHT').length
    const unsignedDays = rows.filter((r) => (r.hours ?? 0) > 0 && r.signed === false).length

    // Info grid + totals (2 columns x 4 rows)
    const gridX = 36
    const gridYTop = 646
    const gridW = 612 - 72
    const colW = (gridW - 12) / 2
    const rowH = 34

    const infoRows: Array<Array<{ label: string; value: string }>> = [
      [
        { label: 'Employee Name', value: user?.name ?? '—' },
        { label: 'User ID', value: canonicalUserId },
      ],
      [
        { label: 'Role', value: String(ctx.role ?? '—') },
        { label: 'Employment Type', value: String(profile.employmentType ?? '—') },
      ],
      [
        { label: 'Site', value: String(ctx.siteId ?? '—') },
        { label: 'Date range', value: weekLabel },
      ],
      [
        { label: 'Total Hours', value: totals.hours.toFixed(2) },
        { label: 'Days Worked', value: String(daysWorked) },
      ],
      [
        { label: 'Day Shifts', value: String(dayShifts) },
        { label: 'Night Shifts', value: String(nightShifts) },
      ],
      [
        { label: 'Unsigned Days', value: String(unsignedDays) },
        { label: '', value: '' },
      ],
    ]

    // Draw grid blocks (right column skips the final empty cell)
    let gy = gridYTop
    for (let r = 0; r < infoRows.length; r++) {
      const left = infoRows[r]![0]!
      const right = infoRows[r]![1]!
      // left cell
      page.drawRectangle({ x: gridX, y: gy - rowH, width: colW, height: rowH, color: white, borderColor: slate200, borderWidth: 1 })
      drawText(left.label, gridX + 10, gy - 14, { size: 9, color: slate600 })
      drawText(left.value, gridX + 10, gy - 28, { bold: true, size: 11, color: slate900 })
      // right cell
      if (right.label) {
        page.drawRectangle({ x: gridX + colW + 12, y: gy - rowH, width: colW, height: rowH, color: white, borderColor: slate200, borderWidth: 1 })
        drawText(right.label, gridX + colW + 22, gy - 14, { size: 9, color: slate600 })
        drawText(right.value, gridX + colW + 22, gy - 28, { bold: true, size: 11, color: slate900 })
      }
      gy -= rowH
    }

    // Attendance section title + note
    const attY = gy - 22
    drawText('Weekly Attendance', 36, attY, { bold: true, size: 12, color: slate900 })
    drawText('Note: Lunch: 30 min included per shift', 36, attY - 16, { size: 10, color: slate600 })

    // Table
    const tableX = 36
    const tableW = 612 - 72
    const headerH = 22
    const dataRowH = 22
    const startY = attY - 46

    type Align = 'left' | 'right' | 'center'
    const colDefs = [
      { key: 'day', label: 'Day', w: 34, align: 'left' as Align },
      { key: 'date', label: 'Date', w: 74, align: 'left' as Align },
      { key: 'shift', label: 'Shift', w: 48, align: 'left' as Align },
      { key: 'in', label: 'Time In', w: 76, align: 'left' as Align },
      { key: 'out', label: 'Time Out', w: 76, align: 'left' as Align },
      { key: 'lunch', label: 'Lunch', w: 46, align: 'left' as Align },
      { key: 'hours', label: 'Hours', w: 44, align: 'right' as Align },
      { key: 'verified', label: 'Verified via', w: 86, align: 'left' as Align },
      { key: 'signature', label: 'Signature', w: 56, align: 'left' as Align },
    ]
    const totalW = colDefs.reduce((s, c) => s + c.w, 0)
    const scale = tableW / totalW
    const cols = colDefs.map((c) => ({ ...c, w: c.w * scale }))

    // Header
    page.drawRectangle({ x: tableX, y: startY, width: tableW, height: headerH, color: slate100, borderColor: slate200, borderWidth: 1 })
    let cx = tableX
    for (const c of cols) {
      drawText(c.label, cx + 6, startY + 7, { bold: true, size: 9, color: slate700 })
      cx += c.w
    }

    const drawCell = (txt: string, x: number, y: number, w: number, align: Align = 'left') => {
      const t = safe(txt)
      if (align === 'right') {
        drawText(t, x + w - 6 - t.length * 4.6, y + 7, { size: 9, color: slate900 })
      } else if (align === 'center') {
        drawText(t, x + w / 2 - t.length * 2.3, y + 7, { size: 9, color: slate900 })
      } else {
        drawText(t, x + 6, y + 7, { size: 9, color: slate900 })
      }
    }

    // Rows (7 days)
    let y = startY - dataRowH
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!
      const fill = i % 2 === 0 ? white : rgb(250 / 255, 252 / 255, 255 / 255)
      page.drawRectangle({ x: tableX, y, width: tableW, height: dataRowH, color: fill, borderColor: slate200, borderWidth: 1 })

      const hasWork = (r.hours ?? 0) > 0
      const day = weekdayShortFromYmd(r.date)
      const date = fmtDateSlash(r.date)
      const shift = hasWork ? String(r.shift) : '—'
      const timeIn = hasWork ? fmtTime(r.timeIn) : '—'
      const timeOut = hasWork ? fmtTime(r.timeOut) : '—'
      const lunch = hasWork ? `${r.lunchMinutes ?? 30}m` : '—'
      const hours = (r.hours ?? 0).toFixed(2)
      const verifiedVia = hasWork ? (r.verifiedVia || '—') : '—'
      const signatureText = !hasWork ? '—' : r.signed ? '' : '—'

      const values: Record<string, string> = {
        day,
        date,
        shift,
        in: timeIn,
        out: timeOut,
        lunch,
        hours,
        verified: verifiedVia,
        signature: signatureText,
      }

      let x = tableX
      for (const c of cols) {
        const val = values[c.key] ?? '—'
        drawCell(val, x, y, c.w, c.align)
        x += c.w
      }

      // Signature thumbnail when present
      if (hasWork && r.signaturePngBase64 && r.signaturePngBase64.startsWith('data:image/png;base64,')) {
        try {
          const b64 = r.signaturePngBase64.slice('data:image/png;base64,'.length)
          const bytes = Buffer.from(b64, 'base64')
          const img = await pdf.embedPng(bytes)
          // last column area
          const sigCol = cols[cols.length - 1]!
          const sigX = tableX + tableW - sigCol.w + 6
          page.drawImage(img, { x: sigX, y: y + 6, width: sigCol.w - 12, height: 10 })
        } catch {
          // ignore
        }
      }

      y -= dataRowH
    }

    // Totals row
    page.drawRectangle({ x: tableX, y, width: tableW, height: dataRowH, color: slate100, borderColor: slate200, borderWidth: 1 })
    drawText('Weekly Total', tableX + 6, y + 7, { bold: true, size: 9, color: slate700 })
    // hours column (7th col, 0-indexed)
    const hoursColIndex = cols.findIndex((c) => c.key === 'hours')
    if (hoursColIndex >= 0) {
      const leftW = cols.slice(0, hoursColIndex).reduce((s, c) => s + c.w, 0)
      const hw = cols[hoursColIndex]!.w
      drawCell(totals.hours.toFixed(2), tableX + leftW, y, hw, 'right')
    }

    // Footer
    drawText('This document is generated by JIM Staffing®. Edits are restricted.', 36, 60, { size: 9, color: slate600 })

    const bytes = Buffer.from(await pdf.save())
    reply.header('Content-Type', 'application/pdf')
    reply.header(
      'Content-Disposition',
      `attachment; filename="JIM_Staffing_Timecard_${canonicalUserId}_${rangeFromYmd}_to_${rangeToInclusiveYmd}.pdf"`,
    )
    return reply.send(bytes)
  })

  const SignatureBody = z.object({
    signaturePngBase64: z.string().min(1),
  })

  app.post('/attendance/:shiftId/signature', async (req) => {
    const ctx = await app.requireSiteRole(req)
    const shiftId = String((req.params as { shiftId?: string }).shiftId ?? '').trim()
    if (!shiftId) throw app.httpErrors.badRequest('Missing shift id.')
    const body = SignatureBody.parse(req.body)
    const sig = body.signaturePngBase64
    if (!sig.startsWith('data:image/png;base64,')) {
      throw app.httpErrors.badRequest('Signature must be a PNG data URL (data:image/png;base64,...)')
    }
    if (sig.length > 300_000) {
      throw app.httpErrors.badRequest('Signature too large.')
    }

    const updated = await prisma.staffingTimeEvent.updateMany({
      where: { id: shiftId, userId: ctx.userId, type: 'CLOCK_OUT', status: 'OK' },
      data: { signedAt: new Date(), signaturePngBase64: sig },
    })
    if (!updated.count) throw app.httpErrors.notFound('Shift not found.')
    return { ok: true }
  })
}

