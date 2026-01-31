const env = import.meta.env as {
  VITE_STAFFING_SITE_LAT?: string
  VITE_STAFFING_SITE_LNG?: string
  VITE_STAFFING_RADIUS_METERS?: string
}

const toNumber = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export const STAFFING_SITE = {
  address: '1130 E Kearney St, Mesquite, TX 75149',
  lat: toNumber(env.VITE_STAFFING_SITE_LAT, 32.76919206739677),
  lng: toNumber(env.VITE_STAFFING_SITE_LNG, -96.58379991502918),
  radiusMeters: toNumber(env.VITE_STAFFING_RADIUS_METERS, 1609.344),
} as const

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sin1 = Math.sin(dLat / 2)
  const sin2 = Math.sin(dLng / 2)
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function metersToMiles(m: number): number {
  return m / 1609.344
}

