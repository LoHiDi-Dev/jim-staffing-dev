import { prisma } from '../prisma'
import { loadEnv } from '../env'
import { sendEmail } from './email'

export type WeeklyReportSummaryRow = {
  userId: string
  userName: string
  agency: string
  totalHours: number
  daysWorked: number
  eventCount: number
}

/**
 * Returns the previous week range in UTC: Monday 00:00:00 to next Monday 00:00:00 (exclusive).
 */
export function getLastWeekRangeUTC(): { rangeStart: Date; rangeEnd: Date } {
  const now = new Date()
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = day.getUTCDay()
  const mondayOffset = (dow + 6) % 7
  const thisMonday = new Date(day)
  thisMonday.setUTCDate(day.getUTCDate() - mondayOffset)
  const lastMonday = new Date(thisMonday)
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7)
  const rangeEnd = new Date(lastMonday)
  rangeEnd.setUTCDate(lastMonday.getUTCDate() + 7)
  return { rangeStart: lastMonday, rangeEnd }
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

export async function runWeeklyReport(): Promise<{ ok: boolean; recipients: string[]; rangeStart: string; rangeEnd: string }> {
  const env = loadEnv()
  const recipientsRaw = env.STAFFING_REPORT_RECIPIENTS ?? ''
  const recipients = recipientsRaw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

  if (recipients.length === 0) throw new Error('No recipients configured (STAFFING_REPORT_RECIPIENTS).')

  const { rangeStart, rangeEnd } = getLastWeekRangeUTC()
  const { csv, summaryRows } = await buildWeeklyReport(rangeStart, rangeEnd)

  const rangeLabel = `${rangeStart.toISOString().slice(0, 10)} to ${rangeEnd.toISOString().slice(0, 10)}`
  const subject = `JIM Staffing Weekly Report: ${rangeLabel}`
  const text = `JIM Staffing weekly time report for ${rangeLabel}.\n\nContractors: ${summaryRows.length}\nTotal hours (sum): ${summaryRows
    .reduce((a, r) => a + r.totalHours, 0)
    .toFixed(2)}\n\nSee attached CSV for details.`

  await sendEmail({
    to: recipients,
    subject,
    text,
    attachments: [
      {
        filename: `JIM_Staffing_Weekly_${rangeStart.toISOString().slice(0, 10)}_${rangeEnd.toISOString().slice(0, 10)}.csv`,
        content: csv,
        contentType: 'text/csv',
      },
    ],
  })

  return { ok: true, recipients, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() }
}

