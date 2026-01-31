import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma'
import { loadEnv } from '../env'

type StaffingAgency = 'PROLOGISTIX' | 'STAFF_FORCE' | 'BLUECREW'

declare module 'fastify' {
  interface FastifyRequest {
    staffingAgency?: StaffingAgency
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
    ['BLUECREW', env.STAFFING_API_KEY_BLUECREW],
  ]

  const match = keys.find(([, k]) => Boolean(k && k.trim() && token === k.trim()))
  if (!match) throw app.httpErrors.unauthorized('Invalid API key.')
  req.staffingAgency = match[0]
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

export const staffingAgencyApiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req) => {
    await requireAgencyApiKey(req, app)
  })

  app.get('/time-records', async (req) => {
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

  app.get('/weekly-summary', async (req) => {
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
}

