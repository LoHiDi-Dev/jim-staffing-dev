import { apiFetch, apiFetchBlob } from './http'

export type StaffingAgency = 'PROLOGISTIX' | 'STAFF_FORCE' | 'BLUECREW'
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
  return await apiFetch<{ ok: boolean }>('/staffing/events', { method: 'POST', body: args })
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

