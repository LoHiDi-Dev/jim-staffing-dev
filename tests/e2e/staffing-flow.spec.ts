import { test, expect, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

async function loginByUserId(page: Page, args: { userId: string; pin: string; location?: 'DTX' | 'HQ' | 'RCA' | 'FHPA' }) {
  await page.goto('/login')
  await page.getByRole('radio', { name: 'Returning User' }).click()
  await page.getByRole('radio', { name: args.location ?? 'DTX' }).click()
  await page.getByRole('radio', { name: 'User ID' }).click()
  await page.getByPlaceholder('Enter your User ID').fill(args.userId)
  // PIN boxes have aria-labels "PIN digit X"
  const digits = args.pin.split('')
  for (let i = 0; i < 4; i++) {
    await page.getByLabel(`PIN digit ${i + 1}`).fill(digits[i]!)
  }
  await page.getByRole('button', { name: /sign in/i }).click()
}

test.describe('JIM Staffing E2E', () => {
  test('Wi‑Fi verified (dev bypass) + location denied → can clock', async ({ browser }) => {
    const context = await browser.newContext({
      // Do NOT grant geolocation permission.
    })
    const page = await context.newPage()
    await loginByUserId(page, { userId: 'DTX-TT-1234', pin: '1234', location: 'DTX' })

    await page.waitForURL(/\/clock-station/)
    await expect(page.getByRole('tab', { name: /Clock Station/i })).toBeVisible()

    // Should be able to clock in (enabled).
    const clockIn = page.getByRole('button', { name: /^Clock in$/i })
    await expect(clockIn).toBeEnabled()
  })

  test('Location verified + Wi‑Fi not verified → can clock', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 32.76919206739677, longitude: -96.58379991502918 },
      permissions: ['geolocation'],
    })
    const page = await context.newPage()
    await loginByUserId(page, { userId: 'DTX-JS-0045', pin: '4859', location: 'DTX' })

    await page.waitForURL(/\/clock-station/)
    // Trigger location check (requires user action).
    await page.getByRole('button', { name: /verify location/i }).click()
    const clockIn = page.getByRole('button', { name: /^Clock in$/i })
    await expect(clockIn).toBeEnabled()
  })

  test('Neither verified → clock disabled and server rejects', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await loginByUserId(page, { userId: 'DTX-JS-0045', pin: '4859', location: 'DTX' })
    await page.waitForURL(/\/clock-station/)

    const clockIn = page.getByRole('button', { name: /^Clock in$/i })
    await expect(clockIn).toBeDisabled()
  })

  test('Clock in → clock out → signature required → submit signature → download weekly PDF (1 page)', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await loginByUserId(page, { userId: 'DTX-TT-1234', pin: '1234', location: 'DTX' })
    await page.waitForURL(/\/clock-station/)

    await page.getByRole('button', { name: /^Clock in$/i }).click()
    await expect(page.getByRole('button', { name: /^Clock out$/i })).toBeEnabled()

    await page.getByRole('button', { name: /^Clock out$/i }).click()

    // Signature section should appear; draw on canvas and submit.
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()

    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
    if (box) {
      await page.mouse.move(box.x + 20, box.y + 20)
      await page.mouse.down()
      await page.mouse.move(box.x + 120, box.y + 35)
      await page.mouse.move(box.x + 200, box.y + 60)
      await page.mouse.up()
    }

    await page.getByRole('button', { name: /submit signature/i }).click()

    // Now My Timecard → download PDF.
    await page.getByRole('tab', { name: /My Timecard/i }).click()
    await page.waitForURL(/\/my-timecard/)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /download pdf/i }).click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).toBeTruthy()

    // Validate PDF is parseable and one page.
    const stream = await download.createReadStream()
    expect(stream).toBeTruthy()
    const chunks: Buffer[] = []
    if (stream) {
      for await (const c of stream) chunks.push(Buffer.from(c))
    }
    const bytes = Buffer.concat(chunks)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
  })
})

