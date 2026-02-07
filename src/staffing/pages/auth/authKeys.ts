export type AuthLoginPreference = 'FULL_NAME' | 'USER_ID'

export type AuthLocationCode = 'HQs' | 'DTX' | 'RCA' | 'FHPA'

export const AUTH_STORAGE_KEYS = {
  loginPreference: 'jim.auth.loginPreference',
  lastLocation: 'jim.auth.lastLocation',
  provisionedUserId: 'jim.auth.provisionedUserId',
} as const

export const AUTH_LOCATIONS: Array<{ code: AuthLocationCode; label: string; siteId: string }> = [
  { code: 'HQs', label: 'HQs — Headquarters', siteId: 'site_seed_main' },
  { code: 'DTX', label: 'DTX — Dallas Warehouse', siteId: 'site_dtx' },
  { code: 'RCA', label: 'RCA — Packaging & Warehouse', siteId: 'site_rca' },
  { code: 'FHPA', label: 'FHPA — E-Commerce Fulfillment', siteId: 'site_phpa' },
]

export function loadLoginPreference(): AuthLoginPreference | null {
  try {
    const v =
      sessionStorage.getItem(AUTH_STORAGE_KEYS.loginPreference) ??
      localStorage.getItem(AUTH_STORAGE_KEYS.loginPreference)
    return v === 'FULL_NAME' || v === 'USER_ID' ? v : null
  } catch {
    return null
  }
}

export function saveLoginPreference(pref: AuthLoginPreference, storage: 'local' | 'session') {
  try {
    const st = storage === 'session' ? sessionStorage : localStorage
    st.setItem(AUTH_STORAGE_KEYS.loginPreference, pref)
    if (storage === 'session') {
      // Ensure it doesn't persist on shared devices.
      localStorage.removeItem(AUTH_STORAGE_KEYS.loginPreference)
    }
  } catch {
    // ignore
  }
}

export function loadLastLocation(): AuthLocationCode | null {
  try {
    const v =
      sessionStorage.getItem(AUTH_STORAGE_KEYS.lastLocation) ??
      localStorage.getItem(AUTH_STORAGE_KEYS.lastLocation)
    return v === 'HQs' || v === 'DTX' || v === 'RCA' || v === 'FHPA' ? v : null
  } catch {
    return null
  }
}

export function saveLastLocation(loc: AuthLocationCode, storage: 'local' | 'session') {
  try {
    const st = storage === 'session' ? sessionStorage : localStorage
    st.setItem(AUTH_STORAGE_KEYS.lastLocation, loc)
    if (storage === 'session') {
      localStorage.removeItem(AUTH_STORAGE_KEYS.lastLocation)
    }
  } catch {
    // ignore
  }
}

