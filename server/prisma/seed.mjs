import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

  // JIM Staffing test contractor: Full name "Test test", PIN 1234 (LTC @ DTX).
  const testTestEmail = 'test-test@jillamy.local'
  const testTestPin = '1234'
  const testTest = await prisma.user.upsert({
    where: { email: testTestEmail },
    update: { name: 'Test test' },
    create: {
      email: testTestEmail,
      name: 'Test test',
      passwordHash: await bcrypt.hash(testTestPin, 12),
      defaultSiteId: dtx.id,
    },
  })

  await prisma.userSite.upsert({
    where: { userId_siteId: { userId: testTest.id, siteId: dtx.id } },
    update: { role: 'OPERATOR' },
    create: { userId: testTest.id, siteId: dtx.id, role: 'OPERATOR' },
  })

  await prisma.staffingContractorProfile.upsert({
    where: { userId: testTest.id },
    update: { employmentType: 'LTC', agency: 'PROLOGISTIX', isActive: true },
    create: {
      userId: testTest.id,
      employmentType: 'LTC',
      agency: 'PROLOGISTIX',
      isActive: true,
    },
  })

  console.log('Seed complete.')
  console.log(`JIM Staffing test user: "Test test" (Full Name) / PIN ${testTestPin} @ DTX`)
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

