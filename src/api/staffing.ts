import { apiFetch, apiFetchBlob } from './http'

export type StaffingAgency = 'PROLOGISTIX' | 'STAFF_FORCE'
export type StaffingEmploymentType = 'LTC' | 'STC'

export type StaffingMe = {
  eligible: boolean
  reason?: string
  employmentType?: StaffingEmploymentType
  agency?: StaffingAgency
}

export type StaffingClockState = {
  clockedIn: boolean
  onLunch: boolean
  lastActionLabel?: string
  lastSyncAt?: string
}

export type StaffingEventType = 'CLOCK_IN' | 'LUNCH_START' | 'LUNCH_END' | 'CLOCK_OUT'

type PunchTokenResponse = {
  token: string
  expiresAt: string
  wifiAllowlistStatus: 'PASS' | 'FAIL' | 'DEV_BYPASS'
}

const DEVICE_ID_KEY = 'jim.staffing.deviceId'
const PUNCH_TOKEN_KEY = 'jim.staffing.punchToken'

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `dev-${Math.random().toString(16).slice(2)}`
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `dev-${Math.random().toString(16).slice(2)}`
  }
}

function getCachedPunchToken(): { token: string; expiresAtMs: number } | null {
  try {
    const raw = sessionStorage.getItem(PUNCH_TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown }
    const token = typeof parsed.token === 'string' ? parsed.token : ''
    const expiresAt = typeof parsed.expiresAt === 'string' ? Date.parse(parsed.expiresAt) : NaN
    if (!token || !Number.isFinite(expiresAt)) return null
    return { token, expiresAtMs: expiresAt }
  } catch {
    return null
  }
}

function setCachedPunchToken(token: string, expiresAt: string) {
  try {
    sessionStorage.setItem(PUNCH_TOKEN_KEY, JSON.stringify({ token, expiresAt }))
  } catch {
    // ignore
  }
}

async function getValidPunchToken(): Promise<string> {
  const cached = getCachedPunchToken()
  if (cached && cached.expiresAtMs - Date.now() > 2 * 60 * 1000) return cached.token

  const deviceId = getOrCreateDeviceId()
  const res = await apiFetch<PunchTokenResponse>('/staffing/punch-token', {
    method: 'POST',
    headers: {
      'x-staffing-device-id': deviceId,
    },
  })
  setCachedPunchToken(res.token, res.expiresAt)
  return res.token
}

export async function apiStaffingMe(): Promise<StaffingMe> {
  return await apiFetch<StaffingMe>('/staffing/me')
}

export async function apiStaffingState(): Promise<StaffingClockState> {
  return await apiFetch<StaffingClockState>('/staffing/me/state')
}

export async function apiStaffingEvent(args: {
  type: StaffingEventType
  geo?: { lat: number; lng: number; accuracyMeters?: number }
  notes?: string
}): Promise<{ ok: boolean }> {
  const deviceId = getOrCreateDeviceId()
  const punchToken = await getValidPunchToken()
  const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

  return await apiFetch<{ ok: boolean }>('/staffing/events', {
    method: 'POST',
    headers: {
      'x-staffing-device-id': deviceId,
      'x-staffing-punch-token': punchToken,
      'x-idempotency-key': idempotencyKey,
    },
    body: {
      ...args,
      clientReportedTimestamp: new Date().toISOString(),
    },
  })
}

export type StaffingMyTimesResponse = {
  range: { from: string; to: string }
  events: Array<{ type: StaffingEventType; timestamp: string }>
}

export async function apiMyTimes(args: { week: 'this' | 'last' }): Promise<StaffingMyTimesResponse> {
  const q = new URLSearchParams({ week: args.week })
  return await apiFetch<StaffingMyTimesResponse>(`/staffing/my-times?${q.toString()}`)
}

export async function apiMyTimesExportCsv(args: { week: 'this' | 'last' }): Promise<Blob> {
  const q = new URLSearchParams({ week: args.week })
  return await apiFetchBlob(`/staffing/my-times/export.csv?${q.toString()}`, { method: 'GET' })
}

