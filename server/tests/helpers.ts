import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { prisma } from '../src/prisma'

export async function buildTestApp(env?: Record<string, string | undefined>): Promise<FastifyInstance> {
  const original: Record<string, string | undefined> = {}
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      original[k] = process.env[k]
      if (typeof v === 'undefined') delete process.env[k]
      else process.env[k] = v
    }
  }
  const app = buildApp()
  await app.ready()
  ;(app as unknown as { __testEnvOriginal?: Record<string, string | undefined> }).__testEnvOriginal = original
  return app
}

export async function closeTestApp(app: FastifyInstance): Promise<void> {
  const original = (app as unknown as { __testEnvOriginal?: Record<string, string | undefined> }).__testEnvOriginal
  await app.close()
  if (original) {
    for (const [k, v] of Object.entries(original)) {
      if (typeof v === 'undefined') delete process.env[k]
      else process.env[k] = v
    }
  }
}

export async function createTestUser(args: {
  email: string
  name: string
  pin: string
  siteName?: string
  role: any
  agency?: 'PROLOGISTIX' | 'STAFF_FORCE'
}) {
  const siteName = args.siteName ?? `DTX – Dallas (test) ${args.email}`
  const site = await prisma.site.create({ data: { name: siteName } })

  const passwordHash = await bcrypt.hash(args.pin, 10)
  const user = await prisma.user.create({
    data: {
      email: args.email,
      name: args.name,
      passwordHash,
      defaultSiteId: site.id,
      staffingContractorProfile: {
        create: { employmentType: 'STC', agency: args.agency ?? 'PROLOGISTIX', isActive: true },
      },
      userSites: {
        create: [{ siteId: site.id, role: args.role }],
      },
    },
  })
  return { user, site }
}

export async function cleanupTestUser(email: string, siteId?: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return
  await prisma.session.deleteMany({ where: { userId: user.id } })
  await prisma.staffingTimeEvent.deleteMany({ where: { userId: user.id } })
  await prisma.userSite.deleteMany({ where: { userId: user.id } })
  await prisma.staffingContractorProfile.deleteMany({ where: { userId: user.id } })
  await prisma.user.delete({ where: { id: user.id } })
  if (siteId) {
    await prisma.site.deleteMany({ where: { id: siteId } })
  }
}

export async function login(app: FastifyInstance, args: { email: string; pin: string; siteId: string }) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: args.email, password: args.pin, siteId: args.siteId },
  })
  if (res.statusCode !== 200) {
    throw new Error(`Login failed (${res.statusCode}): ${res.body}`)
  }
  const parsed = res.json() as { accessToken: string; user: { id: string; email: string; role: string; siteId: string } }
  return parsed.accessToken
}

export async function getPunchToken(app: FastifyInstance, accessToken: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staffing/punch-token',
    headers: { authorization: `Bearer ${accessToken}`, 'x-staffing-device-id': 'test-device' },
  })
  if (res.statusCode !== 200) throw new Error(`Punch token failed (${res.statusCode}): ${res.body}`)
  return res.json() as { token: string; expiresAt: string }
}

