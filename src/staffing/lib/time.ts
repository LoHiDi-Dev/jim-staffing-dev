import type { StaffingEventType } from '../../api/staffing'

export type StaffingEvent = { type: StaffingEventType; timestamp: string }

export type DayTimeRecord = {
  dayKey: string // YYYY-MM-DD (local)
  dayLabel: string
  firstInAt?: string
  lastOutAt?: string
  workedHours: number
  lunchMinutes: number
  status: 'COMPLETE' | 'IN_PROGRESS' | 'NO_CLOCK_OUT' | 'NO_CLOCK_IN'
}

export type WeeklySummary = {
  totalHours: number
  daysWorked: number
  avgHoursPerDay: number
  status: 'OK' | 'INCOMPLETE'
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const dayKeyLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

export function computeWeeklyTimes(events: StaffingEvent[]): { days: DayTimeRecord[]; summary: WeeklySummary } {
  const sorted = [...events]
    .map((e) => ({ ...e, t: new Date(e.timestamp) }))
    .filter((e) => !Number.isNaN(e.t.getTime()))
    .sort((a, b) => a.t.getTime() - b.t.getTime())

  // Aggregate per day, scanning session state (CLOCK_IN → CLOCK_OUT), subtract lunch.
  const byDay = new Map<string, DayTimeRecord & { _totalMs: number; _openIn: Date | null; _lunchStart: Date | null }>()

  const ensureDay = (d: Date) => {
    const key = dayKeyLocal(d)
    const existing = byDay.get(key)
    if (existing) return existing
    const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    const rec: DayTimeRecord & { _totalMs: number; _openIn: Date | null; _lunchStart: Date | null } = {
      dayKey: key,
      dayLabel: label,
      workedHours: 0,
      lunchMinutes: 0,
      status: 'NO_CLOCK_IN',
      _totalMs: 0,
      _openIn: null,
      _lunchStart: null,
    }
    byDay.set(key, rec)
    return rec
  }

  for (const e of sorted) {
    const rec = ensureDay(e.t)
    if (e.type === 'CLOCK_IN') {
      rec.status = 'IN_PROGRESS'
      rec._openIn = e.t
      rec._lunchStart = null
      if (!rec.firstInAt) rec.firstInAt = e.t.toISOString()
    } else if (e.type === 'LUNCH_START' && rec._openIn) {
      rec._lunchStart = e.t
    } else if (e.type === 'LUNCH_END' && rec._openIn && rec._lunchStart) {
      const lunchMs = Math.max(0, e.t.getTime() - rec._lunchStart.getTime())
      rec._totalMs -= lunchMs
      rec.lunchMinutes += lunchMs / 60000
      rec._lunchStart = null
    } else if (e.type === 'CLOCK_OUT' && rec._openIn) {
      rec._totalMs += Math.max(0, e.t.getTime() - rec._openIn.getTime())
      // If lunch started but no end, default 30m.
      if (rec._lunchStart) {
        rec._totalMs -= 30 * 60 * 1000
        rec.lunchMinutes += 30
      }
      rec._openIn = null
      rec._lunchStart = null
      rec.lastOutAt = e.t.toISOString()
      rec.status = 'COMPLETE'
    }
  }

  // Finalize + compute summary.
  const days = Array.from(byDay.values())
    .map((d) => {
      const workedHours = Math.max(0, d._totalMs) / 3600000
      const status: DayTimeRecord['status'] = d.firstInAt
        ? d.lastOutAt
          ? 'COMPLETE'
          : 'NO_CLOCK_OUT'
        : 'NO_CLOCK_IN'
      return {
        dayKey: d.dayKey,
        dayLabel: d.dayLabel,
        firstInAt: d.firstInAt,
        lastOutAt: d.lastOutAt,
        workedHours,
        lunchMinutes: Math.round(d.lunchMinutes),
        status,
      } satisfies DayTimeRecord
    })
    .sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1)) // newest first

  const totalHours = days.reduce((sum, d) => sum + d.workedHours, 0)
  const daysWorked = days.filter((d) => d.firstInAt).length
  const avgHoursPerDay = daysWorked ? totalHours / daysWorked : 0
  const status: WeeklySummary['status'] = days.some((d) => d.status !== 'COMPLETE' && d.firstInAt) ? 'INCOMPLETE' : 'OK'

  return {
    days,
    summary: {
      totalHours,
      daysWorked,
      avgHoursPerDay,
      status,
    },
  }
}

