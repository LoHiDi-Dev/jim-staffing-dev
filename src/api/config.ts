const env = import.meta.env as { VITE_API_BASE_URL?: string }
export const API_BASE_URL = env.VITE_API_BASE_URL ? String(env.VITE_API_BASE_URL).replace(/\/+$/, '') : ''

export const SITE_ID_STORAGE_KEY = 'jim.server.siteId'

export const getCurrentSiteId = (): string | null => {
  try {
    const v = localStorage.getItem(SITE_ID_STORAGE_KEY)
    return v ? v.trim() : null
  } catch {
    return null
  }
}

export const setCurrentSiteId = (siteId: string | null) => {
  try {
    if (!siteId) localStorage.removeItem(SITE_ID_STORAGE_KEY)
    else localStorage.setItem(SITE_ID_STORAGE_KEY, siteId)
  } catch {
    // ignore
  }
}

