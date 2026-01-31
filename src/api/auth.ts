import { apiFetch } from './http'
import { restoreAccessToken, setAccessToken } from './token'
import { setCurrentSiteId } from './config'

export type ServerSiteRole = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'REGIONAL_MANAGER'

export type ServerUser = {
  id: string
  email: string
  name: string
  siteId: string
  role: ServerSiteRole
  sites?: Array<{ id: string; name: string; role: ServerSiteRole }>
}

export async function apiHealth(): Promise<boolean> {
  try {
    const res = await apiFetch<{ ok: boolean }>('/health')
    return Boolean(res.ok)
  } catch {
    return false
  }
}

export async function apiLogin(args: { email: string; password: string; siteId?: string }): Promise<ServerUser> {
  const res = await apiFetch<{ accessToken: string; user: ServerUser }>('/auth/login', {
    method: 'POST',
    body: args,
  })
  setAccessToken(res.accessToken)
  // Regional Managers must explicitly choose a warehouse (site) via in-module gate.
  if (res.user?.siteId && res.user.role !== 'REGIONAL_MANAGER') setCurrentSiteId(res.user.siteId)
  return res.user
}

export async function apiLoginByName(args: { name: string; password: string; siteId?: string }): Promise<ServerUser> {
  const res = await apiFetch<{ accessToken: string; user: ServerUser }>('/auth/login-name', {
    method: 'POST',
    body: args,
  })
  setAccessToken(res.accessToken)
  // Regional Managers must explicitly choose a warehouse (site) via in-module gate.
  if (res.user?.siteId && res.user.role !== 'REGIONAL_MANAGER') setCurrentSiteId(res.user.siteId)
  return res.user
}

export async function apiRegister(args: {
  userId: string
  firstName: string
  lastName: string
  pin: string
  siteId: string
}): Promise<ServerUser> {
  const res = await apiFetch<{ accessToken: string; user: ServerUser }>('/auth/register', {
    method: 'POST',
    body: args,
  })
  setAccessToken(res.accessToken)
  // New users are created site-scoped; set the site header immediately.
  if (res.user?.siteId && res.user.role !== 'REGIONAL_MANAGER') setCurrentSiteId(res.user.siteId)
  return res.user
}

export async function apiRefresh(): Promise<string | null> {
  restoreAccessToken()
  try {
    const res = await apiFetch<{ accessToken: string }>('/auth/refresh', { method: 'POST' })
    setAccessToken(res.accessToken)
    return res.accessToken
  } catch {
    setAccessToken(null)
    return null
  }
}

export async function apiLogout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } finally {
    setAccessToken(null)
  }
}

export async function apiMe(): Promise<ServerUser | null> {
  try {
    const res = await apiFetch<{ user: ServerUser }>('/auth/me')
    // Regional Managers must explicitly choose a warehouse (site) via in-module gate.
    if (res.user?.siteId && res.user.role !== 'REGIONAL_MANAGER') setCurrentSiteId(res.user.siteId)
    return res.user
  } catch {
    return null
  }
}

