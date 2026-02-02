import { prisma } from '../prisma.js'
import { loadEnv } from '../env.js'
import { sendEmail } from './email.js'

export type WeeklyReportSummaryRow = {
  userId: string
  userName: string
  agency: string
  totalHours: number
  daysWorked: number
  eventCount: number
}

export type WeeklyExceptionRow = {
  userId: string
  userName: string
  agency: string
  exceptionType:
    | 'MISSING_CLOCK_OUT'
    | 'NOT_ON_WAREHOUSE_WIFI'
    | 'INVALID_STATE'
    | 'RATE_LIMITED'
    | 'TIME_DRIFT_FLAG'
  eventType?: string
  eventTimestamp?: string
  ipAddress?: string
  wifiAllowlistStatus?: string
  deviceId?: string
  notes?: string
}

/**
 * Returns the current week range in UTC: Monday 00:00:00 to "now".
 */
export function getThisWeekRangeUTC(now = new Date()): { rangeStart: Date; rangeEnd: Date } {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = day.getUTCDay()
  const mondayOffset = (dow + 6) % 7
  const thisMonday = new Date(day)
  thisMonday.setUTCDate(day.getUTCDate() - mondayOffset)
  return { rangeStart: thisMonday, rangeEnd: now }
}

export async function buildWeeklyReport(rangeStart: Date, rangeEnd: Date): Promise<{ csv: string; summaryRows: WeeklyReportSummaryRow[] }> {
  const events = await prisma.staffingTimeEvent.findMany({
    where: { status: 'OK', serverTimestamp: { gte: rangeStart, lt: rangeEnd } },
    orderBy: { serverTimestamp: 'asc' },
    select: {
      userId: true,
      type: true,
      serverTimestamp: true,
      agency: true,
      user: { select: { name: true } },
    },
  })

  const byUser = new Map<string, { name: string; agency: string; evs: Array<{ type: string; t: Date }> }>()
  for (const e of events) {
    const existing = byUser.get(e.userId)
    const evs = existing?.evs ?? []
    evs.push({ type: e.type, t: e.serverTimestamp })
    byUser.set(e.userId, {
      name: existing?.name ?? e.user.name,
      agency: existing?.agency ?? e.agency,
      evs,
    })
  }

  const summaryRows: WeeklyReportSummaryRow[] = []
  for (const [userId, { name, agency, evs }] of byUser.entries()) {
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
        totalMs -= Math.max(0, e.t.getTime() - lunchStart.getTime())
        lunchStart = null
      } else if (e.type === 'CLOCK_OUT' && openIn) {
        totalMs += Math.max(0, e.t.getTime() - openIn.getTime())
        if (lunchStart) totalMs -= 30 * 60 * 1000
        openIn = null
        lunchStart = null
      }
    }

    summaryRows.push({
      userId,
      userName: name,
      agency,
      totalHours: Math.max(0, totalMs) / 3600000,
      daysWorked: days.size,
      eventCount: evs.length,
    })
  }

  summaryRows.sort((a, b) => a.userName.localeCompare(b.userName) || a.agency.localeCompare(b.agency))

  const header = ['userId', 'userName', 'agency', 'totalHours', 'daysWorked', 'eventCount']
  const rows = summaryRows.map((r) => [
    r.userId,
    escapeCsv(r.userName),
    r.agency,
    r.totalHours.toFixed(2),
    r.daysWorked,
    r.eventCount,
  ])
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n') + '\n'

  return { csv, summaryRows }
}

function escapeCsv(val: string): string {
  if (!/[\n,"]/.test(val)) return val
  return `"${val.replace(/"/g, '""')}"`
}

export async function buildWeeklyExceptions(rangeStart: Date, rangeEnd: Date): Promise<{ csv: string; rows: WeeklyExceptionRow[] }> {
  const rows: WeeklyExceptionRow[] = []

  const [blocked, driftFlagged, okEvents] = await Promise.all([
    prisma.staffingTimeEvent.findMany({
      where: {
        status: 'BLOCKED',
        serverTimestamp: { gte: rangeStart, lt: rangeEnd },
        reason: { in: ['NOT_ON_WAREHOUSE_WIFI', 'INVALID_STATE', 'RATE_LIMITED'] },
      },
      orderBy: { serverTimestamp: 'asc' },
      select: {
        userId: true,
        type: true,
        reason: true,
        serverTimestamp: true,
        agency: true,
        ipAddress: true,
        wifiAllowlistStatus: true,
        deviceId: true,
        notes: true,
        user: { select: { name: true } },
      },
    }),
    prisma.staffingTimeEvent.findMany({
      where: {
        clientTimeDriftFlag: true,
        serverTimestamp: { gte: rangeStart, lt: rangeEnd },
      },
      orderBy: { serverTimestamp: 'asc' },
      select: {
        userId: true,
        type: true,
        serverTimestamp: true,
        agency: true,
        ipAddress: true,
        wifiAllowlistStatus: true,
        deviceId: true,
        notes: true,
        user: { select: { name: true } },
      },
    }),
    prisma.staffingTimeEvent.findMany({
      where: { status: 'OK', serverTimestamp: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { serverTimestamp: 'asc' },
      select: {
        userId: true,
        type: true,
        serverTimestamp: true,
        agency: true,
        user: { select: { name: true } },
      },
    }),
  ])

  for (const e of blocked) {
    rows.push({
      userId: e.userId,
      userName: e.user.name,
      agency: e.agency,
      exceptionType: e.reason as WeeklyExceptionRow['exceptionType'],
      eventType: e.type,
      eventTimestamp: e.serverTimestamp.toISOString(),
      ipAddress: e.ipAddress ?? undefined,
      wifiAllowlistStatus: e.wifiAllowlistStatus ?? undefined,
      deviceId: e.deviceId ?? undefined,
      notes: e.notes ?? undefined,
    })
  }

  for (const e of driftFlagged) {
    rows.push({
      userId: e.userId,
      userName: e.user.name,
      agency: e.agency,
      exceptionType: 'TIME_DRIFT_FLAG',
      eventType: e.type,
      eventTimestamp: e.serverTimestamp.toISOString(),
      ipAddress: e.ipAddress ?? undefined,
      wifiAllowlistStatus: e.wifiAllowlistStatus ?? undefined,
      deviceId: e.deviceId ?? undefined,
      notes: e.notes ?? undefined,
    })
  }

  // Missing clock-out: detect open sessions in OK events within the range.
  const byUser = new Map<string, { name: string; agency: string; openIn: { t: Date; type: string } | null }>()
  for (const e of okEvents) {
    const existing = byUser.get(e.userId) ?? { name: e.user.name, agency: e.agency, openIn: null }
    if (e.type === 'CLOCK_IN') existing.openIn = { t: e.serverTimestamp, type: e.type }
    if (e.type === 'CLOCK_OUT') existing.openIn = null
    byUser.set(e.userId, existing)
  }
  for (const [userId, st] of byUser.entries()) {
    if (!st.openIn) continue
    rows.push({
      userId,
      userName: st.name,
      agency: st.agency,
      exceptionType: 'MISSING_CLOCK_OUT',
      eventType: st.openIn.type,
      eventTimestamp: st.openIn.t.toISOString(),
      notes: 'Clocked in without a matching clock-out by report time.',
    })
  }

  rows.sort((a, b) => a.userName.localeCompare(b.userName) || a.exceptionType.localeCompare(b.exceptionType))

  const header = [
    'userId',
    'userName',
    'agency',
    'exceptionType',
    'eventType',
    'eventTimestamp',
    'ipAddress',
    'wifiAllowlistStatus',
    'deviceId',
    'notes',
  ]
  const csvRows = rows.map((r) => [
    r.userId,
    escapeCsv(r.userName),
    r.agency,
    r.exceptionType,
    r.eventType ?? '',
    r.eventTimestamp ?? '',
    r.ipAddress ?? '',
    r.wifiAllowlistStatus ?? '',
    r.deviceId ?? '',
    escapeCsv(r.notes ?? ''),
  ])
  const csv = [header, ...csvRows].map((r) => r.join(',')).join('\n') + '\n'

  return { csv, rows }
}

export async function runWeeklyReport(): Promise<{ ok: boolean; recipients: string[]; rangeStart: string; rangeEnd: string }> {
  const env = loadEnv()
  const recipientsRaw = env.STAFFING_REPORT_RECIPIENTS ?? ''
  const recipients = recipientsRaw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

  if (recipients.length === 0) throw new Error('No recipients configured (STAFFING_REPORT_RECIPIENTS).')

  const { rangeStart, rangeEnd } = getThisWeekRangeUTC()
  const [{ csv: summaryCsv, summaryRows }, { csv: exceptionsCsv, rows: exceptionRows }] = await Promise.all([
    buildWeeklyReport(rangeStart, rangeEnd),
    buildWeeklyExceptions(rangeStart, rangeEnd),
  ])

  const rangeLabel = `${rangeStart.toISOString().slice(0, 10)} to ${rangeEnd.toISOString().slice(0, 10)}`
  const subject = `JIM Staffing Weekly Exceptions: ${rangeLabel}`
  const count = (t: WeeklyExceptionRow['exceptionType']) => exceptionRows.filter((r) => r.exceptionType === t).length
  const text = `JIM Staffing weekly exceptions report for ${rangeLabel}.\n\n` +
    `Contractors: ${summaryRows.length}\n` +
    `Total hours (sum): ${summaryRows.reduce((a, r) => a + r.totalHours, 0).toFixed(2)}\n\n` +
    `Exceptions:\n` +
    `- Missing clock-out: ${count('MISSING_CLOCK_OUT')}\n` +
    `- Not on warehouse Wi-Fi attempts: ${count('NOT_ON_WAREHOUSE_WIFI')}\n` +
    `- Invalid sequence attempts: ${count('INVALID_STATE')}\n` +
    `- Rate-limited attempts: ${count('RATE_LIMITED')}\n` +
    `- Time drift flags: ${count('TIME_DRIFT_FLAG')}\n\n` +
    `See attached CSVs for details.`

  await sendEmail({
    to: recipients,
    subject,
    text,
    attachments: [
      {
        filename: `JIM_Staffing_TimeSummary_${rangeStart.toISOString().slice(0, 10)}_${rangeEnd.toISOString().slice(0, 10)}.csv`,
        content: summaryCsv,
        contentType: 'text/csv',
      },
      {
        filename: `JIM_Staffing_Exceptions_${rangeStart.toISOString().slice(0, 10)}_${rangeEnd.toISOString().slice(0, 10)}.csv`,
        content: exceptionsCsv,
        contentType: 'text/csv',
      },
    ],
  })

  return { ok: true, recipients, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() }
}

