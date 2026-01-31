import { API_BASE_URL, getCurrentSiteId } from './config'
import { getAccessToken } from './token'

export type ApiError = {
  status: number
  message: string
  body?: unknown
}

type FetchOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export async function apiFetch<T>(
  path: string,
  opts?: FetchOpts,
): Promise<T> {
  if (!API_BASE_URL) throw new Error('API base URL not configured')
  const token = getAccessToken()
  const siteId = getCurrentSiteId()

  const headers: Record<string, string> = {
    ...(opts?.headers ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (siteId) headers['x-site-id'] = siteId

  let body: BodyInit | undefined
  if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: opts?.method ?? 'GET',
    headers,
    body,
    credentials: 'include',
    signal: opts?.signal,
  })

  const text = await res.text()
  const parsed = text ? (safeJsonParse(text) ?? text) : null
  const parsedMessage =
    parsed && typeof parsed === 'object' && 'message' in parsed ? (parsed as { message?: unknown }).message : undefined

  if (!res.ok) {
    const err: ApiError = {
      status: res.status,
      message: typeof parsedMessage === 'string' ? parsedMessage : res.statusText,
      body: parsed,
    }
    throw err
  }

  return parsed as T
}

export async function apiFetchBlob(path: string, opts?: FetchOpts): Promise<Blob> {
  if (!API_BASE_URL) throw new Error('API base URL not configured')
  const token = getAccessToken()
  const siteId = getCurrentSiteId()

  const headers: Record<string, string> = {
    ...(opts?.headers ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (siteId) headers['x-site-id'] = siteId

  let body: BodyInit | undefined
  if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: opts?.method ?? 'GET',
    headers,
    body,
    credentials: 'include',
    signal: opts?.signal,
  })

  if (!res.ok) {
    const text = await res.text()
    const parsed = text ? (safeJsonParse(text) ?? text) : null
    const parsedMessage =
      parsed && typeof parsed === 'object' && 'message' in parsed ? (parsed as { message?: unknown }).message : undefined
    const err: ApiError = {
      status: res.status,
      message: typeof parsedMessage === 'string' ? parsedMessage : res.statusText,
      body: parsed,
    }
    throw err
  }

  return await res.blob()
}

function safeJsonParse(s: string): unknown | null {
  try {
    return JSON.parse(s) as unknown
  } catch {
    return null
  }
}

