const ACCESS_TOKEN_KEY = 'jim.server.accessToken'

let accessToken: string | null = null

export const getAccessToken = (): string | null => accessToken

export const setAccessToken = (token: string | null) => {
  accessToken = token
  try {
    if (!token) sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    else sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
  } catch {
    // ignore
  }
}

export const restoreAccessToken = (): string | null => {
  if (accessToken) return accessToken
  try {
    const v = sessionStorage.getItem(ACCESS_TOKEN_KEY)
    accessToken = v ? v : null
    return accessToken
  } catch {
    return null
  }
}

