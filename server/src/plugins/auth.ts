import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthContext, AuthedUser } from '../types.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthContext
    user: AuthContext
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext
    authedUser?: AuthedUser
  }
}

const SITE_HEADER = 'x-site-id'

export const authPlugin: FastifyPluginAsync<{
  accessSecret: string
  refreshSecret: string
  corsOrigin?: string
}> = fp(async (app: FastifyInstance, opts: { accessSecret: string; refreshSecret: string; corsOrigin?: string }) => {
  await app.register(cookie, {
    hook: 'onRequest',
  })

  // Access tokens (Authorization: Bearer ...)
  await app.register(jwt, { secret: opts.accessSecret })
  // Refresh tokens (httpOnly cookie), namespaced so secrets are isolated.
  await app.register(jwt, { secret: opts.refreshSecret, namespace: 'refresh' })

  const refreshJwt = app.jwt as unknown as {
    refresh: {
      sign: (payload: { userId: string; sessionId: string }, options: { expiresIn: string }) => string
      verify: (token: string) => unknown
    }
  }

  app.decorate('signAccessToken', async (ctx: AuthContext) => {
    return app.jwt.sign(ctx, { expiresIn: '15m' })
  })

  app.decorate('signRefreshToken', async (payload: { userId: string; sessionId: string }) => {
    return refreshJwt.refresh.sign(payload, { expiresIn: '30d' })
  })

  app.decorate('verifyRefreshToken', async (token: string) => {
    const verified = refreshJwt.refresh.verify(token)
    return verified as { userId: string; sessionId: string; iat: number; exp: number }
  })

  app.decorate('requireAuth', async (req: FastifyRequest) => {
    await req.jwtVerify()
    const ctx = req.user as AuthContext
    req.auth = ctx
    req.authedUser = { userId: ctx.userId, email: ctx.email }
    return ctx
  })

  app.decorate('requireSiteRole', async (req: FastifyRequest) => {
    const auth = req.auth ?? (await app.requireAuth(req))
    const headerSiteId = String(req.headers[SITE_HEADER] ?? '').trim()
    const siteId = headerSiteId || auth.siteId
    const userSite = await prisma.userSite.findUnique({
      where: { userId_siteId: { userId: auth.userId, siteId } },
    })
    if (!userSite) {
      throw app.httpErrors.forbidden('Not authorized for this site.')
    }
    const ctx: AuthContext = { ...auth, siteId, role: userSite.role }
    req.auth = ctx
    return ctx
  })

  app.decorate('requireRoleAtLeast', async (req: FastifyRequest, minRole: 'OPERATOR' | 'MANAGER' | 'ADMIN') => {
    const ctx = await app.requireSiteRole(req)
    const rank = (r: string) => (r === 'ADMIN' ? 3 : r === 'MANAGER' ? 2 : 1)
    if (rank(ctx.role) < rank(minRole)) {
      throw app.httpErrors.forbidden('Not authorized.')
    }
    return ctx
  })

  app.decorate('requireOrigin', async (req: FastifyRequest) => {
    const origin = String(req.headers.origin ?? '')
    if (!origin) return
    // CORS already blocks browser calls; this protects refresh/logout from CSRF via same-site checks.
    const raw = z.string().min(1).parse(opts.corsOrigin ?? process.env.CORS_ORIGIN)
    const allowedList = raw.split(',').map((s) => s.trim()).filter(Boolean)
    if (!allowedList.includes(origin)) {
      throw app.httpErrors.forbidden('Invalid origin.')
    }
  })
})

declare module 'fastify' {
  interface FastifyInstance {
    signAccessToken: (ctx: AuthContext) => Promise<string>
    signRefreshToken: (payload: { userId: string; sessionId: string }) => Promise<string>
    verifyRefreshToken: (token: string) => Promise<{ userId: string; sessionId: string; iat: number; exp: number }>
    requireAuth: (req: FastifyRequest) => Promise<AuthContext>
    requireSiteRole: (req: FastifyRequest) => Promise<AuthContext>
    requireRoleAtLeast: (req: FastifyRequest, minRole: 'OPERATOR' | 'MANAGER' | 'ADMIN') => Promise<AuthContext>
    requireOrigin: (req: FastifyRequest) => Promise<void>
  }
}

