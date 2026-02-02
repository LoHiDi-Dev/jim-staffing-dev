import type { FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'
import { randomToken } from '../security.js'
import { loadEnv } from '../env.js'

export type WifiAllowlistStatus = 'PASS' | 'FAIL' | 'DEV_BYPASS'

export type WifiAllowlistResult = {
  ipAddress: string | null
  status: WifiAllowlistStatus
}

function truthy(s: string | undefined | null): boolean {
  const v = String(s ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function getClientIp(req: FastifyRequest): string | null {
  // Fastify will set req.ip correctly when trustProxy=true, but we still prefer the first XFF hop when present.
  const xff = String(req.headers['x-forwarded-for'] ?? '').trim()
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const ip = String((req as unknown as { ip?: unknown }).ip ?? '').trim()
  return ip || null
}

export function evalWifiAllowlist(req: FastifyRequest): WifiAllowlistResult {
  const env = loadEnv()
  const ipAddress = getClientIp(req)
  const disabled = truthy(env.STAFFING_WIFI_ALLOWLIST_DISABLED)

  if (disabled) {
    return { ipAddress, status: 'DEV_BYPASS' }
  }

  const raw = String(env.STAFFING_ALLOWED_EGRESS_IPS ?? '')
  const allow = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // Empty allowlist is treated as fail-closed. Local dev should use STAFFING_WIFI_ALLOWLIST_DISABLED=true.
  if (allow.length === 0) return { ipAddress, status: 'FAIL' }

  if (!ipAddress) return { ipAddress: null, status: 'FAIL' }
  return { ipAddress, status: allow.includes(ipAddress) ? 'PASS' : 'FAIL' }
}

export function shouldBypassWifiAllowlistForUser(userId: string, email?: string | null): boolean {
  const env = loadEnv()
  const raw = String(env.STAFFING_WIFI_ALLOWLIST_BYPASS_USER_IDS ?? '')
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.includes(userId)) return true
  if (email && list.includes(email)) return true
  return false
}

export function newPunchTokenSecret(): { token: string; tokenHash: string } {
  const token = randomToken(32)
  return { token, tokenHash: sha256Hex(token) }
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export function userAgentHash(req: FastifyRequest): string {
  const ua = String(req.headers['user-agent'] ?? '')
  return sha256Hex(ua)
}

