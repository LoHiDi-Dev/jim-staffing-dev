import type { SiteRole } from '@prisma/client'

export type AuthedUser = {
  userId: string
  email: string
}

export type AuthContext = {
  userId: string
  email: string
  siteId: string
  role: SiteRole
}

