import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma'
import type { StaffingAgency, StaffingBlockReason, StaffingEventStatus, StaffingEventType } from '@prisma/client'

const STAFFING_SITE = {
  address: '1130 E Kearney St, Mesquite, TX 75149',
  lat: 32.76919206739677,
  lng: -96.58379991502918,
  radiusMeters: 1609.344,
} as const

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

  app.post('/staffing/events', async (req) => {
    const ctx = await app.requireSiteRole(req)
    const body = EventBody.parse(req.body)

    const profile = await prisma.staffingContractorProfile.findUnique({ where: { userId: ctx.userId } })
    if (!profile) throw app.httpErrors.forbidden('Not authorized for JIM Staffing.')
    if (!(profile.isActive && (profile.employmentType === 'LTC' || profile.employmentType === 'STC'))) {
      throw app.httpErrors.forbidden('Not authorized for JIM Staffing.')
    }

    const agency: StaffingAgency = profile.agency

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

    const userAgent = String(req.headers['user-agent'] ?? '')

    const geo = body.geo
    const distanceMeters =
      geo ? haversineMeters({ lat: geo.lat, lng: geo.lng }, { lat: STAFFING_SITE.lat, lng: STAFFING_SITE.lng }) : null
    const inRange = distanceMeters != null ? distanceMeters <= STAFFING_SITE.radiusMeters : false

    const reason: StaffingBlockReason | null =
      invalidState
        ? 'INVALID_STATE'
        : !geo
          ? 'LOCATION_UNAVAILABLE'
          : !inRange
            ? 'OUT_OF_RANGE'
            : null

    if (reason) {
      await prisma.staffingTimeEvent.create({
        data: {
          userId: ctx.userId,
          siteId: ctx.siteId,
          agency,
          type: requested,
          status: 'BLOCKED',
          reason,
          serverTimestamp: new Date(),
          geoLat: geo?.lat ?? null,
          geoLng: geo?.lng ?? null,
          accuracyMeters: geo?.accuracyMeters ?? null,
          distanceMeters: distanceMeters ?? null,
          inRange,
          userAgent,
          notes: body.notes ?? null,
        },
      })

      if (reason === 'OUT_OF_RANGE') {
        const miles = distanceMeters != null ? distanceMeters / 1609.344 : null
        throw app.httpErrors.forbidden(`Out of range (${miles ? miles.toFixed(2) : '—'} mi from site).`)
      }
      if (reason === 'LOCATION_UNAVAILABLE') throw app.httpErrors.forbidden('Location unavailable.')
      if (reason === 'INVALID_STATE') throw app.httpErrors.forbidden('Invalid clock state for this action.')
      throw app.httpErrors.forbidden('Blocked.')
    }

    await prisma.staffingTimeEvent.create({
      data: {
        userId: ctx.userId,
        siteId: ctx.siteId,
        agency,
        type: requested,
        status: 'OK',
        reason: null,
        serverTimestamp: new Date(),
        geoLat: geo?.lat ?? null,
        geoLng: geo?.lng ?? null,
        accuracyMeters: geo?.accuracyMeters ?? null,
        distanceMeters: distanceMeters ?? null,
        inRange,
        userAgent,
        notes: body.notes ?? null,
      },
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

