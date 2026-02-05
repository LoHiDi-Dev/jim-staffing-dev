import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'
import { prisma } from '../prisma.js'
import { verifyPassword } from '../security.js'

const LoginBody = z.object({
  email: z.string().email(),
  // JIM supports 4-digit PIN-style passwords for seeded/demo accounts.
  password: z.string().min(4),
  siteId: z.string().optional(),
})

const LoginByNameBody = z.object({
  name: z.string().min(1),
  // JIM supports 4-digit PIN-style passwords for seeded/demo accounts.
  password: z.string().min(4),
  siteId: z.string().optional(),
})

const RegisterBody = z.object({
  userId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  // 4-digit PIN (frontend enforces digits; backend enforces minimum length for safety)
  pin: z.string().min(4),
  siteId: z.string().min(1),
})

const normalizeUserIdToEmail = (userId: string): string => {
  const norm = userId.trim().toLowerCase()
  if (!norm) return ''
  // If the user already provided an email, keep it.
  if (norm.includes('@')) return norm
  // Allow userId entry with/without hyphens/spaces (e.g. DTX-RK-0042 == DTXRK0042)
  // Canonicalize to AAA-BB-1234 when possible so we match seeded accounts.
  const key = userId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const m = /^([A-Z]{3})([A-Z]{2})(\d{4})$/.exec(key)
  const canonical = m ? `${m[1]}-${m[2]}-${m[3]}` : key
  return `${canonical.toLowerCase()}@jillamy.local`
}

function cookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    // Must be `none` in production because Vercel (frontend) != Render (API) domains.
    sameSite: (isProd ? ('none' as const) : ('lax' as const)),
    path: '/',
  }
}

function hashRefreshToken(token: string): string {
  // Refresh tokens are high-entropy JWTs; use SHA-256 for fast server-side hashing.
  return `sha256:${createHash('sha256').update(token).digest('hex')}`
}

async function verifyRefreshTokenHash(token: string, stored: string): Promise<boolean> {
  // Backwards compatible: older sessions stored bcrypt hashes.
  if (stored.startsWith('sha256:')) return stored === hashRefreshToken(token)
  return await bcrypt.compare(token, stored)
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production'

  app.post('/auth/login', async (req, reply) => {
    const body = LoginBody.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) throw app.httpErrors.unauthorized('Invalid email or password.')

    const ok = await verifyPassword(body.password, user.passwordHash)
    if (!ok) throw app.httpErrors.unauthorized('Invalid email or password.')

    // If a staffing profile exists, enforce active status.
    const profile = await prisma.staffingContractorProfile.findUnique({ where: { userId: user.id } })
    if (profile && !profile.isActive) throw app.httpErrors.forbidden('User inactive or blocked.')

    // Determine site + role: prefer requested site, else user's default, else first membership.
    const memberships = await prisma.userSite.findMany({ where: { userId: user.id }, include: { site: true } })
    if (!memberships.length) throw app.httpErrors.forbidden('No site access configured for this user.')
    const desiredSiteId = body.siteId || user.defaultSiteId || memberships[0]!.siteId
    const membership = memberships.find((m) => m.siteId === desiredSiteId) ?? memberships[0]!

    const ctx = { userId: user.id, email: user.email, siteId: membership.siteId, role: membership.role }
    const accessToken = await app.signAccessToken(ctx)

    // Refresh token rotation: create a session and store hashed refresh token.
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'pending',
        userAgent: String(req.headers['user-agent'] ?? ''),
        ip: req.ip,
        expiresAt,
      },
    })
    const refreshToken = await app.signRefreshToken({ userId: user.id, sessionId: session.id })
    const refreshTokenHash = hashRefreshToken(refreshToken)
    await prisma.session.update({ where: { id: session.id }, data: { refreshTokenHash } })

    reply.setCookie('jim_refresh', refreshToken, cookieOptions(isProd))
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        siteId: membership.siteId,
        role: membership.role,
        sites: memberships.map((m) => ({ id: m.siteId, name: m.site.name, role: m.role })),
      },
    }
  })

  // Convenience login for PIN-based kiosks: identify by full name instead of email/userId.
  // Note: name is not guaranteed unique; if duplicates exist, first match wins.
  app.post('/auth/login-name', async (req, reply) => {
    const body = LoginByNameBody.parse(req.body)
    const name = body.name.trim()
    const user = await prisma.user.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
    if (!user) throw app.httpErrors.unauthorized('Invalid name or PIN.')

    const ok = await verifyPassword(body.password, user.passwordHash)
    if (!ok) throw app.httpErrors.unauthorized('Invalid name or PIN.')

    const profile = await prisma.staffingContractorProfile.findUnique({ where: { userId: user.id } })
    if (profile && !profile.isActive) throw app.httpErrors.forbidden('User inactive or blocked.')

    const memberships = await prisma.userSite.findMany({ where: { userId: user.id }, include: { site: true } })
    if (!memberships.length) throw app.httpErrors.forbidden('No site access configured for this user.')
    const desiredSiteId = body.siteId || user.defaultSiteId || memberships[0]!.siteId
    const membership = memberships.find((m) => m.siteId === desiredSiteId) ?? memberships[0]!

    const ctx = { userId: user.id, email: user.email, siteId: membership.siteId, role: membership.role }
    const accessToken = await app.signAccessToken(ctx)

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'pending',
        userAgent: String(req.headers['user-agent'] ?? ''),
        ip: req.ip,
        expiresAt,
      },
    })
    const refreshToken = await app.signRefreshToken({ userId: user.id, sessionId: session.id })
    const refreshTokenHash = hashRefreshToken(refreshToken)
    await prisma.session.update({ where: { id: session.id }, data: { refreshTokenHash } })

    reply.setCookie('jim_refresh', refreshToken, cookieOptions(isProd))
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        siteId: membership.siteId,
        role: membership.role,
        sites: memberships.map((m) => ({ id: m.siteId, name: m.site.name, role: m.role })),
      },
    }
  })

  // First-time user registration (server mode).
  // Creates a user with an internal email derived from userId, and assigns them to the selected site as OPERATOR.
  app.post('/auth/register', async (req, reply) => {
    await app.requireOrigin(req)
    const body = RegisterBody.parse(req.body)

    const email = normalizeUserIdToEmail(body.userId)
    if (!email || !email.includes('@')) throw app.httpErrors.badRequest('Invalid userId.')

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) throw app.httpErrors.conflict('User ID already exists.')

    const name = `${body.firstName.trim()} ${body.lastName.trim()}`.trim()
    const passwordHash = await bcrypt.hash(body.pin, 12)

    const created = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        defaultSiteId: body.siteId,
      },
    })

    await prisma.userSite.create({ data: { userId: created.id, siteId: body.siteId, role: 'OPERATOR' } })

    // Issue tokens immediately (auto-login).
    const memberships = await prisma.userSite.findMany({ where: { userId: created.id }, include: { site: true } })
    const membership = memberships.find((m) => m.siteId === body.siteId) ?? memberships[0]!
    const ctx = { userId: created.id, email: created.email, siteId: membership.siteId, role: membership.role }
    const accessToken = await app.signAccessToken(ctx)

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const session = await prisma.session.create({
      data: {
        userId: created.id,
        refreshTokenHash: 'pending',
        userAgent: String(req.headers['user-agent'] ?? ''),
        ip: req.ip,
        expiresAt,
      },
    })
    const refreshToken = await app.signRefreshToken({ userId: created.id, sessionId: session.id })
    const refreshTokenHash = hashRefreshToken(refreshToken)
    await prisma.session.update({ where: { id: session.id }, data: { refreshTokenHash } })

    reply.setCookie('jim_refresh', refreshToken, cookieOptions(isProd))
    return {
      accessToken,
      user: {
        id: created.id,
        email: created.email,
        name: created.name,
        siteId: membership.siteId,
        role: membership.role,
        sites: memberships.map((m) => ({ id: m.siteId, name: m.site.name, role: m.role })),
      },
    }
  })

  app.post('/auth/logout', async (req, reply) => {
    await app.requireOrigin(req)
    const token = req.cookies?.jim_refresh
    if (token) {
      try {
        const decoded = await app.verifyRefreshToken(token)
        await prisma.session.updateMany({
          where: { id: decoded.sessionId, userId: decoded.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      } catch {
        // ignore invalid token
      }
    }
    reply.clearCookie('jim_refresh', cookieOptions(isProd))
    return { ok: true }
  })

  app.post('/auth/refresh', async (req, reply) => {
    await app.requireOrigin(req)
    const token = req.cookies?.jim_refresh
    if (!token) throw app.httpErrors.unauthorized('Missing refresh token.')

    const decoded = await app.verifyRefreshToken(token)
    const session = await prisma.session.findUnique({ where: { id: decoded.sessionId } })
    if (!session || session.userId !== decoded.userId) throw app.httpErrors.unauthorized('Invalid session.')
    if (session.revokedAt) throw app.httpErrors.unauthorized('Session revoked.')
    if (session.expiresAt.getTime() < Date.now()) throw app.httpErrors.unauthorized('Session expired.')

    const hashOk = await verifyRefreshTokenHash(token, session.refreshTokenHash)
    if (!hashOk) throw app.httpErrors.unauthorized('Invalid session.')

    const user = await prisma.user.findUnique({ where: { id: session.userId } })
    if (!user) throw app.httpErrors.unauthorized('Invalid session.')

    const memberships = await prisma.userSite.findMany({ where: { userId: user.id }, include: { site: true } })
    if (!memberships.length) throw app.httpErrors.forbidden('No site access configured for this user.')
    const desiredSiteId = String(req.headers['x-site-id'] ?? '').trim() || user.defaultSiteId || memberships[0]!.siteId
    const membership = memberships.find((m) => m.siteId === desiredSiteId) ?? memberships[0]!

    // Rotate refresh token.
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const newRefresh = await app.signRefreshToken({ userId: user.id, sessionId: session.id })
    const newHash = hashRefreshToken(newRefresh)
    await prisma.session.update({ where: { id: session.id }, data: { refreshTokenHash: newHash, expiresAt: newExpiresAt } })

    reply.setCookie('jim_refresh', newRefresh, cookieOptions(isProd))
    const ctx = { userId: user.id, email: user.email, siteId: membership.siteId, role: membership.role }
    const accessToken = await app.signAccessToken(ctx)
    return { accessToken }
  })

  app.get('/auth/me', async (req) => {
    const ctx = await app.requireSiteRole(req)
    const user = await prisma.user.findUnique({ where: { id: ctx.userId } })
    if (!user) throw app.httpErrors.unauthorized('Invalid token.')
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        siteId: ctx.siteId,
        role: ctx.role,
      },
    }
  })
}

