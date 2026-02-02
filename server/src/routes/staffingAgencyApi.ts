import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { createHash } from 'node:crypto'
import { prisma } from '../prisma'
import { loadEnv } from '../env'
import { InMemoryRateLimiter } from '../lib/staffingRateLimit'

type StaffingAgency = 'PROLOGISTIX' | 'STAFF_FORCE'

declare module 'fastify' {
  interface FastifyRequest {
    staffingAgency?: StaffingAgency
    staffingAgencyKeyId?: string
  }
}

const hashKeyId = (token: string): string => {
  const h = createHash('sha256').update(token).digest('hex')
  return h.slice(0, 10)
}

function clientIp(req: FastifyRequest): string {
  const xf = String(req.headers['x-forwarded-for'] ?? '').trim()
  if (xf) return xf.split(',')[0]!.trim()
  return String(req.ip || 'unknown')
}

// Rate limits (internet-facing; best-effort in-memory)
const BURST_KEY_LIMITER = new InMemoryRateLimiter(1000, 5) // 5 req/sec per key
const BURST_IP_LIMITER = new InMemoryRateLimiter(1000, 3) // 3 req/sec per IP

const MIN_KEY_DAILY_ROWS = new InMemoryRateLimiter(60_000, 60) // 60 req/min per key
const MIN_IP_DAILY_ROWS = new InMemoryRateLimiter(60_000, 30) // 30 req/min per IP

const MIN_KEY_PDF = new InMemoryRateLimiter(60_000, 10) // 10 req/min per key
const MIN_IP_PDF = new InMemoryRateLimiter(60_000, 5) // 5 req/min per IP

const MIN_KEY_DEFAULT = new InMemoryRateLimiter(60_000, 60)
const MIN_IP_DEFAULT = new InMemoryRateLimiter(60_000, 30)

function rateLimitKey(req: FastifyRequest): { keyId: string; ip: string } {
  const ip = clientIp(req)
  const keyId = String(req.staffingAgencyKeyId || 'unknown')
  return { keyId, ip }
}

function enforceAgencyRateLimit(args: {
  app: Parameters<FastifyPluginAsync>[0]
  req: FastifyRequest
  reply: FastifyReply
  route: string
  keyMinute: InMemoryRateLimiter
  ipMinute: InMemoryRateLimiter
}): boolean {
  const { keyId, ip } = rateLimitKey(args.req)
  const keyKey = `key:${keyId}:${args.route}`
  const ipKey = `ip:${ip}:${args.route}`

  const burstKeyHit = BURST_KEY_LIMITER.hit(keyKey)
  const burstIpHit = BURST_IP_LIMITER.hit(ipKey)
  const minKeyHit = args.keyMinute.hit(keyKey)
  const minIpHit = args.ipMinute.hit(ipKey)

  const allowed = burstKeyHit.allowed && burstIpHit.allowed && minKeyHit.allowed && minIpHit.allowed
  if (allowed) return false

  const retryAfterSeconds = Math.max(
    burstKeyHit.retryAfterSeconds,
    burstIpHit.retryAfterSeconds,
    minKeyHit.retryAfterSeconds,
    minIpHit.retryAfterSeconds,
    1,
  )

  args.app.log.warn({ route: args.route, ip, keyId, retryAfterSeconds }, 'staffing_agency_rate_limited')
  args.reply
    .status(429)
    .header('Retry-After', String(retryAfterSeconds))
    .send({ error: 'rate_limited', retryAfterSeconds })
  return true
}

// PDF cache (best-effort in-memory)
const PDF_TEMPLATE_VERSION = 'v1'
const PDF_CACHE_TTL_MS = 30 * 60_000
const pdfCache = new Map<string, { expiresAt: number; bytes: Buffer }>()
let pdfCacheHits = 0
let pdfCacheMisses = 0

function prunePdfCache(now: number) {
  // Simple prune on demand to avoid unbounded growth (best-effort).
  for (const [k, v] of pdfCache.entries()) {
    if (v.expiresAt <= now) pdfCache.delete(k)
  }
}

async function requireAgencyApiKey(req: FastifyRequest, app: Parameters<FastifyPluginAsync>[0]) {
  const env = loadEnv()
  const auth = String(req.headers.authorization ?? '')
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) throw app.httpErrors.unauthorized('Missing API key.')

  const keys: Array<[StaffingAgency, string | undefined]> = [
    ['PROLOGISTIX', env.STAFFING_API_KEY_PROLOGISTIX],
    ['STAFF_FORCE', env.STAFFING_API_KEY_STAFF_FORCE],
  ]

  const match = keys.find(([, k]) => Boolean(k && k.trim() && token === k.trim()))
  if (!match) throw app.httpErrors.unauthorized('Invalid API key.')
  req.staffingAgency = match[0]
  req.staffingAgencyKeyId = hashKeyId(token)
}

const TimeRecordsQuery = z.object({
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
  userId: z.string().optional(),
  status: z.enum(['OK', 'BLOCKED', 'ADJUSTED']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

const WeeklySummaryQuery = z.object({
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
})

const DailyRowsQuery = z.object({
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
  userId: z.string().min(1),
  siteId: z.string().min(1).optional(),
})

const verifiedLabel = (m: string | null | undefined) => {
  if (!m || m === 'none') return '—'
  if (m === 'wifi') return 'Wi-Fi'
  if (m === 'location') return 'Location'
  if (m === 'both') return 'Wi-Fi + Location'
  return String(m)
}

const dayKeyUTC = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60_000)

const buildDailyRows = async (args: { agency: StaffingAgency; from: Date; to: Date; userId: string; siteId?: string }) => {
  // Expand query window to handle cross-midnight sessions safely.
  const queryFrom = new Date(args.from.getTime() - 12 * 60 * 60_000)
  const queryTo = new Date(args.to.getTime() + 12 * 60 * 60_000)

  const raw = await prisma.staffingTimeEvent.findMany({
    where: {
      agency: args.agency,
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
    segments.push({ clockInAt, clockOutAt, ms, shiftType, verifiedSeq, signed })
    open = null
  }

  const days = Array.from({ length: 7 }).map((_, i) => addDays(args.from, i))
  const dayKeys = days.map((d) => dayKeyUTC(d))

  const rows = dayKeys.map((key, idx) => {
    const segs = segments.filter((s) => dayKeyUTC(s.clockInAt) === key)
    let firstIn: Date | null = null
    let lastOut: Date | null = null
    let totalMs = 0
    let hasSignature = false
    const methodSeq: string[] = []
    let shift: 'DAY' | 'NIGHT' | '—' = '—'
    for (const s of segs) {
      if (!firstIn || s.clockInAt.getTime() < firstIn.getTime()) firstIn = s.clockInAt
      if (!lastOut || s.clockOutAt.getTime() > lastOut.getTime()) lastOut = s.clockOutAt
      totalMs += s.ms
      if (shift === '—') shift = s.shiftType
      if (s.signed) hasSignature = true
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
    }
  })

  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0)
  return { rows, totals: { hours: totalHours } }
}

export const staffingAgencyApiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req) => {
    await requireAgencyApiKey(req, app)
  })

  app.get('/time-records', async (req, reply) => {
    // Default protection for internet-facing endpoints (keep looser than timecard endpoints)
    const blocked = enforceAgencyRateLimit({
      app,
      req,
      reply,
      route: 'time-records',
      keyMinute: MIN_KEY_DEFAULT,
      ipMinute: MIN_IP_DEFAULT,
    })
    if (blocked) return

    const agency = req.staffingAgency as StaffingAgency
    const q = TimeRecordsQuery.parse(req.query)
    const from = new Date(q.dateFrom)
    const to = new Date(q.dateTo)

    const where = {
      agency,
      serverTimestamp: { gte: from, lt: to },
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.status ? { status: q.status } : {}),
    } as const

    const [total, records] = await Promise.all([
      prisma.staffingTimeEvent.count({ where }),
      prisma.staffingTimeEvent.findMany({
        where,
        orderBy: { serverTimestamp: 'asc' },
        skip: q.offset,
        take: q.limit,
      }),
    ])
    return { total, records, limit: q.limit, offset: q.offset }
  })

  app.get('/weekly-summary', async (req, reply) => {
    const blocked = enforceAgencyRateLimit({
      app,
      req,
      reply,
      route: 'weekly-summary',
      keyMinute: MIN_KEY_DEFAULT,
      ipMinute: MIN_IP_DEFAULT,
    })
    if (blocked) return

    const agency = req.staffingAgency as StaffingAgency
    const q = WeeklySummaryQuery.parse(req.query)
    const from = new Date(q.dateFrom)
    const to = new Date(q.dateTo)

    const events = await prisma.staffingTimeEvent.findMany({
      where: { agency, status: 'OK', serverTimestamp: { gte: from, lt: to } },
      orderBy: { serverTimestamp: 'asc' },
      select: { userId: true, type: true, serverTimestamp: true },
    })

    // MVP aggregation: compute sessions (CLOCK_IN → CLOCK_OUT) and subtract lunch.
    const byUser = new Map<string, Array<{ type: string; t: Date }>>()
    for (const e of events) {
      const arr = byUser.get(e.userId) ?? []
      arr.push({ type: e.type, t: e.serverTimestamp })
      byUser.set(e.userId, arr)
    }

    const summaries = Array.from(byUser.entries()).map(([userId, evs]) => {
      evs.sort((a, b) => a.t.getTime() - b.t.getTime())
      let totalMs = 0
      const days = new Set<string>()
      let openIn: Date | null = null
      let lunchStart: Date | null = null

      for (const e of evs) {
        if (e.type === 'CLOCK_IN') {
          openIn = e.t
          days.add(e.t.toISOString().slice(0, 10))
          lunchStart = null
        } else if (e.type === 'LUNCH_START' && openIn) {
          lunchStart = e.t
        } else if (e.type === 'LUNCH_END' && openIn && lunchStart) {
          // subtract actual lunch duration
          totalMs -= Math.max(0, e.t.getTime() - lunchStart.getTime())
          lunchStart = null
        } else if (e.type === 'CLOCK_OUT' && openIn) {
          totalMs += Math.max(0, e.t.getTime() - openIn.getTime())
          // If lunch started but no end, default 30m.
          if (lunchStart) totalMs -= 30 * 60 * 1000
          openIn = null
          lunchStart = null
        }
      }

      return {
        userId,
        hours: Math.max(0, totalMs) / 3600000,
        daysWorked: days.size,
      }
    })

    return { range: { from: from.toISOString(), to: to.toISOString() }, agency, summaries }
  })

  const exportCsv = async (req: FastifyRequest, reply: FastifyReply) => {
    const blocked = enforceAgencyRateLimit({
      app,
      req,
      reply,
      route: 'export-csv',
      keyMinute: MIN_KEY_DEFAULT,
      ipMinute: MIN_IP_DEFAULT,
    })
    if (blocked) return

    const agency = req.staffingAgency as StaffingAgency
    const q = TimeRecordsQuery.parse(req.query)
    const from = new Date(q.dateFrom)
    const to = new Date(q.dateTo)

    const where = {
      agency,
      serverTimestamp: { gte: from, lt: to },
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.status ? { status: q.status } : {}),
    } as const

    const records = await prisma.staffingTimeEvent.findMany({
      where,
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
    const rows = records.map((e) => [
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
    reply.header(
      'Content-Disposition',
      `attachment; filename="JIM_Staffing_${agency}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv"`,
    )
    return reply.send(csv)
  }

  // Required endpoint
  app.get('/export/csv', async (req, reply) => {
    return exportCsv(req, reply)
  })

  // Back-compat alias (kept if clients already use plural)
  app.get('/exports/csv', async (req, reply) => {
    return exportCsv(req, reply)
  })

  // Required: daily rows (7 + totals) with signature + verification status
  app.get('/timecard/daily-rows', async (req, reply) => {
    const blocked = enforceAgencyRateLimit({
      app,
      req,
      reply,
      route: 'timecard/daily-rows',
      keyMinute: MIN_KEY_DAILY_ROWS,
      ipMinute: MIN_IP_DAILY_ROWS,
    })
    if (blocked) return

    const agency = req.staffingAgency as StaffingAgency
    const q = DailyRowsQuery.parse(req.query)
    const from = new Date(q.dateFrom)
    const to = new Date(q.dateTo)
    const { rows, totals } = await buildDailyRows({ agency, from, to, userId: q.userId, siteId: q.siteId })
    return { range: { from: from.toISOString(), to: to.toISOString() }, agency, userId: q.userId, siteId: q.siteId ?? null, rows, totals }
  })

  // Required: PDF download (best-effort, one page)
  app.get('/timecard/pdf', async (req, reply) => {
    const blocked = enforceAgencyRateLimit({
      app,
      req,
      reply,
      route: 'timecard/pdf',
      keyMinute: MIN_KEY_PDF,
      ipMinute: MIN_IP_PDF,
    })
    if (blocked) return

    const agency = req.staffingAgency as StaffingAgency
    const q = DailyRowsQuery.parse(req.query)
    const from = new Date(q.dateFrom)
    const to = new Date(q.dateTo)
    const siteId = q.siteId ?? null

    // Cache key includes agencyId, siteId, userId, weekStart, weekEnd, pdfTemplateVersion.
    const cacheKey = [
      `agency:${agency}`,
      `site:${siteId ?? 'any'}`,
      `user:${q.userId}`,
      `from:${from.toISOString()}`,
      `to:${to.toISOString()}`,
      `tpl:${PDF_TEMPLATE_VERSION}`,
    ].join('|')

    const now = Date.now()
    prunePdfCache(now)
    const cached = pdfCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      pdfCacheHits += 1
      reply.header('X-Cache', 'HIT')
      app.log.info({ route: 'timecard/pdf', cache: 'HIT', hits: pdfCacheHits, misses: pdfCacheMisses }, 'staffing_agency_pdf_cache')
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `attachment; filename="JIM_Staffing_${agency}_${q.userId}_${from.toISOString().slice(0, 10)}.pdf"`)
      return reply.send(cached.bytes)
    }

    pdfCacheMisses += 1
    reply.header('X-Cache', 'MISS')
    app.log.info({ route: 'timecard/pdf', cache: 'MISS', hits: pdfCacheHits, misses: pdfCacheMisses }, 'staffing_agency_pdf_cache')

    const t0 = process.hrtime.bigint()
    const { rows, totals } = await buildDailyRows({ agency, from, to, userId: q.userId, siteId: q.siteId })

    const pdf = await PDFDocument.create()
    const page = pdf.addPage([612, 792])
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const sanitize = (t: string) =>
      String(t ?? '')
        .replace(/→/g, '->')
        .replace(/\u2014/g, '-') // em dash
        .replace(/\u2013/g, '-') // en dash

    const draw = (t: string, x: number, y: number, bold = false, size = 10) => {
      page.drawText(sanitize(t), { x, y, size, font: bold ? fontBold : font })
    }

    draw('JIM Staffing® — Weekly Timecard (Agency Export)', 36, 760, true, 14)
    draw(`Agency: ${agency}`, 36, 742, false, 10)
    if (siteId) draw(`Site: ${siteId}`, 36, 734, false, 9)
    draw(`UserId: ${q.userId}`, 36, 728, false, 10)
    draw(`Range: ${from.toISOString()} → ${to.toISOString()}`, 36, 714, false, 9)

    const startY = 690
    const rowH = 20
    const cols = [
      { label: 'Date', x: 36 },
      { label: 'Shift', x: 120 },
      { label: 'In', x: 175 },
      { label: 'Out', x: 285 },
      { label: 'Lunch', x: 395 },
      { label: 'Hours', x: 445 },
      { label: 'Verified', x: 495 },
      { label: 'Signed', x: 560 },
    ]
    cols.forEach((c) => draw(c.label, c.x, startY, true, 9))
    let y = startY - 12
    for (const r of rows) {
      draw(r.date, cols[0].x, y, false, 8)
      draw(String(r.shift), cols[1].x, y, false, 8)
      draw(r.timeIn ? r.timeIn.slice(11, 16) : '—', cols[2].x, y, false, 8)
      draw(r.timeOut ? r.timeOut.slice(11, 16) : '—', cols[3].x, y, false, 8)
      draw(r.lunchMinutes ? `${r.lunchMinutes}m` : '—', cols[4].x, y, false, 8)
      draw(r.hours ? r.hours.toFixed(2) : '0.00', cols[5].x, y, false, 8)
      draw(r.verifiedVia, cols[6].x, y, false, 8)
      draw(r.signed === null ? '—' : r.signed ? 'Y' : 'N', cols[7].x, y, false, 8)
      y -= rowH
    }
    draw(`Total hours: ${totals.hours.toFixed(2)}`, 36, y - 8, true, 11)

    const bytes = Buffer.from(await pdf.save())
    pdfCache.set(cacheKey, { bytes, expiresAt: now + PDF_CACHE_TTL_MS })
    const ms = Number(process.hrtime.bigint() - t0) / 1_000_000
    app.log.info({ route: 'timecard/pdf', ms: Math.round(ms), cache: 'MISS' }, 'staffing_agency_pdf_generated')
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="JIM_Staffing_${agency}_${q.userId}_${from.toISOString().slice(0, 10)}.pdf"`)
    return reply.send(bytes)
  })
}

