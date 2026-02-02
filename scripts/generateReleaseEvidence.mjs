import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createCanvas } from '@napi-rs/canvas'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const pdfOutDir = path.join(repoRoot, 'docs/jim-staffing/release-evidence/pdfs')
const screenshotOutDir = path.join(repoRoot, 'docs/jim-staffing/release-evidence/screenshots')

function isoDay(d) {
  return d.toISOString().slice(0, 10)
}

function addDays(d, days) {
  return new Date(d.getTime() + days * 24 * 60 * 60_000)
}

/**
 * Build exactly 7 daily rows + 1 totals row.
 * Each day row has SHIFT: DAY|NIGHT and SIGNED: Y|N.
 */
function buildRows({ weekStart, pattern }) {
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i))

  /** @type {Array<{date:string, shift:'DAY'|'NIGHT', timeIn:string, timeOut:string, lunch:string, hours:string, verified:string, signed:'Y'|'N'}>} */
  const rows = []

  const mk = (idx, args) => {
    rows.push({
      date: isoDay(days[idx]),
      shift: args.shift,
      timeIn: args.timeIn,
      timeOut: args.timeOut,
      lunch: args.lunch ?? '30m',
      hours: args.hours,
      verified: args.verified ?? 'Wi-Fi',
      signed: args.signed,
    })
  }

  if (pattern === 'normal') {
    mk(0, { shift: 'DAY', timeIn: '08:00', timeOut: '16:30', hours: '8.00', signed: 'Y' })
    mk(1, { shift: 'DAY', timeIn: '08:05', timeOut: '16:35', hours: '8.00', signed: 'Y' })
    mk(2, { shift: 'NIGHT', timeIn: '18:00', timeOut: '02:30', hours: '8.00', signed: 'N', verified: 'Location' })
    // Remaining days: no work, still emit deterministic fields that meet hard criteria.
    for (let i = 3; i < 7; i += 1) {
      mk(i, { shift: 'DAY', timeIn: '—', timeOut: '—', lunch: '0m', hours: '0.00', signed: 'N', verified: '—' })
    }
  } else if (pattern === 'long-name') {
    // Stress: full-ish week, mixed shift + signatures, but still one page.
    mk(0, { shift: 'DAY', timeIn: '07:55', timeOut: '16:25', hours: '8.00', signed: 'Y' })
    mk(1, { shift: 'DAY', timeIn: '08:00', timeOut: '16:30', hours: '8.00', signed: 'Y' })
    mk(2, { shift: 'DAY', timeIn: '08:10', timeOut: '16:40', hours: '8.00', signed: 'Y' })
    mk(3, { shift: 'NIGHT', timeIn: '18:00', timeOut: '02:30', hours: '8.00', signed: 'N' })
    mk(4, { shift: 'NIGHT', timeIn: '18:05', timeOut: '02:35', hours: '8.00', signed: 'N' })
    mk(5, { shift: 'DAY', timeIn: '08:00', timeOut: '12:30', hours: '4.00', signed: 'Y' })
    mk(6, { shift: 'DAY', timeIn: '—', timeOut: '—', lunch: '0m', hours: '0.00', signed: 'N', verified: '—' })
  } else if (pattern === 'full-week') {
    for (let i = 0; i < 7; i += 1) {
      const shift = i % 2 === 0 ? 'DAY' : 'NIGHT'
      const timeIn = shift === 'DAY' ? '08:00' : '18:00'
      const timeOut = shift === 'DAY' ? '16:30' : '02:30'
      mk(i, { shift, timeIn, timeOut, hours: '8.00', signed: i % 3 === 0 ? 'N' : 'Y', verified: i % 2 === 0 ? 'Wi-Fi' : 'Location' })
    }
  } else {
    throw new Error(`Unknown pattern: ${pattern}`)
  }

  // Totals row (8th row in the table)
  const totalHours = rows.reduce((sum, r) => sum + Number.parseFloat(r.hours), 0)
  rows.push({
    date: 'TOTAL',
    shift: 'DAY',
    timeIn: '—',
    timeOut: '—',
    lunch: '—',
    hours: totalHours.toFixed(2),
    verified: '—',
    signed: 'N',
  })

  return rows
}

async function renderWeeklyPdf({ outPath, title, employeeName, userId, siteLabel, weekStart }) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792]) // Letter portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const draw = (t, x, y, opts = {}) => {
    page.drawText(String(t), {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? fontBold : font,
      color: opts.color ?? rgb(0, 0, 0),
    })
  }

  // Header (keep lean but include name for long-name stress case)
  draw('JIM Staffing® — Weekly Timecard', 36, 760, { bold: true, size: 14 })
  draw(`Title: ${title}`, 36, 742, { size: 9 })
  draw(`Employee: ${employeeName}`, 36, 730, { size: 9 })
  draw(`UserId: ${userId}   Site: ${siteLabel}`, 36, 718, { size: 9 })
  draw(`Week start (Sun UTC): ${isoDay(weekStart)}`, 36, 706, { size: 9 })

  // Table with EXACTLY 8 rows (7 days + totals row)
  const cols = [
    { label: 'Date', x: 36 },
    { label: 'Shift', x: 120 },
    { label: 'In', x: 175 },
    { label: 'Out', x: 240 },
    { label: 'Lunch', x: 305 },
    { label: 'Hours', x: 365 },
    { label: 'Verified', x: 420 },
    { label: 'Signed', x: 525 },
  ]
  const startY = 680
  const rowH = 22
  cols.forEach((c) => draw(c.label, c.x, startY, { bold: true, size: 9 }))

  const rows = buildRows({ weekStart, pattern: title })
  let y = startY - 14

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    draw(r.date, cols[0].x, y, { size: 8, bold: r.date === 'TOTAL' })
    draw(r.shift, cols[1].x, y, { size: 8 })
    draw(r.timeIn, cols[2].x, y, { size: 8 })
    draw(r.timeOut, cols[3].x, y, { size: 8 })
    draw(r.lunch, cols[4].x, y, { size: 8 })
    draw(r.hours, cols[5].x, y, { size: 8, bold: r.date === 'TOTAL' })
    draw(r.verified, cols[6].x, y, { size: 8 })
    draw(r.signed, cols[7].x, y, { size: 8 })

    y -= rowH
  }

  // Hidden, machine-readable markers for automated signoff tests (do not affect layout).
  // Intentionally tiny + white (still present in the content stream).
  let metaY = 20
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    const rowId = r.date === 'TOTAL' ? 'TOTAL' : String(i)
    draw(`ROW:${rowId} SHIFT:${r.shift} SIGNED:${r.signed}`, 5, metaY, { size: 1, color: rgb(1, 1, 1) })
    metaY += 6
  }

  const bytes = await pdf.save({ useObjectStreams: false })
  await writeFile(outPath, bytes)
}

async function main() {
  await mkdir(pdfOutDir, { recursive: true })
  await mkdir(screenshotOutDir, { recursive: true })

  // Deterministic Sunday start (UTC) for stable evidence artifacts.
  const weekStart = new Date(Date.UTC(2026, 1, 1)) // 2026-02-01

  const skipScreenshots = String(process.env.EVIDENCE_SKIP_SCREENSHOTS ?? '') === '1'

  const jobs = [
    {
      title: 'normal',
      employeeName: 'Test Test',
      userId: 'DTX-JP-8910',
      siteLabel: 'DTX',
      pdfName: 'weekly-normal.pdf',
      pngName: 'weekly-normal.png',
    },
    {
      title: 'long-name',
      employeeName: 'Alexandria Cassandra Maximiliana Montgomery-Smythe the Third',
      userId: 'DTX-LN-0001',
      siteLabel: 'DTX',
      pdfName: 'weekly-long-name.pdf',
      pngName: 'weekly-long-name.png',
    },
    {
      title: 'full-week',
      employeeName: 'Full Week Worker',
      userId: 'DTX-FW-0002',
      siteLabel: 'DTX',
      pdfName: 'weekly-full-week.pdf',
      pngName: 'weekly-full-week.png',
    },
  ]

  for (const j of jobs) {
    const pdfPath = path.join(pdfOutDir, j.pdfName)
    const pngPath = path.join(screenshotOutDir, j.pngName)
    console.log(`Generating ${path.relative(repoRoot, pdfPath)} ...`)
    await renderWeeklyPdf({
      outPath: pdfPath,
      title: j.title,
      employeeName: j.employeeName,
      userId: j.userId,
      siteLabel: j.siteLabel,
      weekStart,
    })

    if (!skipScreenshots) {
      console.log(`Rendering screenshot ${path.relative(repoRoot, pngPath)} ...`)
      await (async () => {
        const data = await readFile(pdfPath)
        const standardFontDataUrl = `file://${path.join(repoRoot, 'node_modules/pdfjs-dist/standard_fonts/')}`
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(data),
          disableWorker: true,
          standardFontDataUrl,
        })
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 2.0 })
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport }).promise
        await writeFile(pngPath, canvas.toBuffer('image/png'))
      })()
    }
  }

  console.log('Release evidence generation complete.')
}

await main()

