import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function emailForUserId(userId) {
  const raw = String(userId ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('@')) return raw
  const key = String(userId).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const m = /^([A-Z]{3})([A-Z]{2})(\d{4})$/.exec(key)
  const canonical = m ? `${m[1]}-${m[2]}-${m[3]}` : key
  return `${canonical.toLowerCase()}@jillamy.local`
}

async function main() {
  const [hq, rca, fhpa, dtx] = await Promise.all([
    prisma.site.upsert({
      where: { id: 'site_seed_main' },
      update: { name: 'Headquarters' },
      create: { id: 'site_seed_main', name: 'Headquarters' },
    }),
    prisma.site.upsert({
      where: { id: 'site_rca' },
      update: { name: 'RCA – Riverside' },
      create: { id: 'site_rca', name: 'RCA – Riverside' },
    }),
    prisma.site.upsert({
      where: { id: 'site_phpa' },
      update: { name: 'FHPA – Fairless Hills' },
      create: { id: 'site_phpa', name: 'FHPA – Fairless Hills' },
    }),
    prisma.site.upsert({
      where: { id: 'site_dtx' },
      update: { name: 'DTX – Dallas' },
      create: { id: 'site_dtx', name: 'DTX – Dallas' },
    }),
  ])

  const users = [
    // Administrator (all locations)
    {
      name: 'Joel Premier',
      userId: 'DTX-JP-1234',
      pin: '5696',
      role: 'ADMIN',
      siteIds: [hq.id, rca.id, fhpa.id, dtx.id],
      staffingEmploymentType: 'STC',
    },
    // HQS user (shared identity across apps)
    { name: 'Tyler Blackmore', userId: 'HQS-TB-0001', pin: '1234', role: 'ADMIN', siteIds: [hq.id], staffingEmploymentType: 'STC' },
    // DTX users
    { name: 'Test Test', userId: 'DTX-JP-8910', pin: '1234', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'STC' },
    { name: 'Ryan Kelly', userId: 'DTX-RK-0042', pin: '1299', role: 'MANAGER', siteIds: [dtx.id], staffingEmploymentType: 'STC' },
    { name: 'Cedric Ross', userId: 'DTX-CR-0043', pin: '4827', role: 'MANAGER', siteIds: [dtx.id], staffingEmploymentType: 'STC' },
    { name: 'Cathy Bramble', userId: 'DTX-CB-0044', pin: '9136', role: 'MANAGER', siteIds: [dtx.id], staffingEmploymentType: 'STC' },
    { name: 'Jocelyn Silva', userId: 'DTX-JS-0045', pin: '4859', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'STC' },
    { name: 'Antoine Crockett', userId: 'DTX-AC-0046', pin: '6054', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'STC' },
    { name: 'Bradley Butler', userId: 'DTX-BB-0047', pin: '1749', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'LTC' },
    { name: 'Adrian Barrera', userId: 'DTX-AB-0048', pin: '7382', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'LTC' },
    { name: 'Johnathan Coleman', userId: 'DTX-JC-0049', pin: '2965', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'LTC' },
    { name: 'Tarkeitta Clark', userId: 'DTX-TC-0050', pin: '8501', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'LTC' },
    { name: 'Deontay Walker', userId: 'DTX-DW-0051', pin: '4318', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'LTC' },
    { name: 'Dee Brooks', userId: 'DTX-DB-0052', pin: '4783', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'LTC' },
    { name: 'Au Niya Clark', userId: 'DTX-AC-0053', pin: '9673', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'LTC' },
    { name: 'Amber Griffin', userId: 'DTX-AG-0054', pin: '5209', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'LTC' },
    { name: 'Sarena Elliott', userId: 'DTX--0055', pin: '3859', role: 'OPERATOR', siteIds: [dtx.id], staffingEmploymentType: 'LTC' },
  ]

  for (const u of users) {
    const email = emailForUserId(u.userId)
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: u.name, defaultSiteId: u.siteIds[0] },
      create: {
        email,
        name: u.name,
        passwordHash: await bcrypt.hash(u.pin, 12),
        defaultSiteId: u.siteIds[0],
      },
    })

    for (const siteId of u.siteIds) {
      await prisma.userSite.upsert({
        where: { userId_siteId: { userId: user.id, siteId } },
        update: { role: u.role },
        create: { userId: user.id, siteId, role: u.role },
      })
    }

    // Staffing eligibility/profile (so all listed users can clock in/out in Staffing).
    await prisma.staffingContractorProfile.upsert({
      where: { userId: user.id },
      update: { employmentType: u.staffingEmploymentType, agency: 'PROLOGISTIX', isActive: true },
      create: {
        userId: user.id,
        employmentType: u.staffingEmploymentType,
        agency: 'PROLOGISTIX',
        isActive: true,
      },
    })
  }

  console.log('Seed complete.')
  console.log('Seeded DTX user list (Staffing).')
  console.log(`Sites: ${hq.name} (${hq.id}), ${rca.name} (${rca.id}), ${fhpa.name} (${fhpa.id}), ${dtx.name} (${dtx.id})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

