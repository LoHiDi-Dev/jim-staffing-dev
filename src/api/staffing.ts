import { apiFetch } from './http'

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

export async function apiMyTimes(args: { week: 'this' | 'last' }): Promise<unknown> {
  return await apiFetch('/staffing/my-times', { method: 'GET', headers: { 'x-week': args.week } })
}

