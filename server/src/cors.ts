export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isOriginAllowed(origin: string, allowed: string[]): boolean {
  if (!origin) return false
  // exact match only (non-negotiable)
  return allowed.includes(origin)
}

