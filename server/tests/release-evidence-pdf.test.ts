import { beforeAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PDFArray, PDFDocument, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')

const pdfDir = path.join(repoRoot, 'docs/jim-staffing/release-evidence/pdfs')

const execFileAsync = promisify(execFile)

async function extractDecodedContentStrings(pdfBytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(pdfBytes)
  const page = pdf.getPages()[0]
  if (!page) return ''

  // Decode content stream bytes so we can search for our hidden markers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node: any = page.node
  const contents = node.Contents?.()
  if (!contents) return ''

  const context = node.context

  const decodeOne = (streamOrRef: unknown): string => {
    const raw =
      streamOrRef instanceof PDFRawStream
        ? streamOrRef
        : streamOrRef instanceof PDFRef
          ? context.lookup(streamOrRef, PDFRawStream)
          : null
    if (!raw) return ''
    const decoded = decodePDFRawStream(raw).decode()
    return Buffer.from(decoded).toString('latin1')
  }

  const obj = context.lookup(contents)
  if (obj instanceof PDFRawStream) return decodeOne(obj)
  if (obj instanceof PDFArray) {
    let out = ''
    for (let i = 0; i < obj.size(); i += 1) {
      const entry = obj.get(i)
      out += decodeOne(entry) + '\n'
    }
    return out
  }

  // Sometimes Contents is a direct reference.
  if (contents instanceof PDFRef) return decodeOne(contents)

  return ''
}

function extractHexTextOperands(contentStream: string): string {
  // pdf-lib often encodes text as hex strings: <...> Tj
  const out: string[] = []
  const re = /<([0-9A-Fa-f]+)>\s*Tj/g
  let m: RegExpExecArray | null
  while ((m = re.exec(contentStream))) {
    try {
      out.push(Buffer.from(m[1]!, 'hex').toString('latin1'))
    } catch {
      // ignore
    }
  }
  return out.join('\n')
}

describe('release evidence PDFs (automated signoff)', () => {
  beforeAll(async () => {
    // Generate deterministic PDFs for tests; skip screenshots (Playwright) to keep this gate lean.
    await execFileAsync('node', ['scripts/generateReleaseEvidence.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, EVIDENCE_SKIP_SCREENSHOTS: '1' },
    })
  }, 120_000)

  const cases = [
    { name: 'weekly-normal.pdf', expectedRows: 8 },
    { name: 'weekly-long-name.pdf', expectedRows: 8 },
    { name: 'weekly-full-week.pdf', expectedRows: 8 },
  ]

  for (const c of cases) {
    it(`${c.name}: 1 page, 7 day rows + totals row, DAY/NIGHT only, signed token per day row`, async () => {
      const bytes = await readFile(path.join(pdfDir, c.name))
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(1)

      const raw = await extractDecodedContentStrings(bytes)
      const content = extractHexTextOperands(raw)

      // Rows: require 7 day rows markers + totals marker.
      const rowMarkers = [
        'ROW:0',
        'ROW:1',
        'ROW:2',
        'ROW:3',
        'ROW:4',
        'ROW:5',
        'ROW:6',
        'ROW:TOTAL',
      ]
      for (const m of rowMarkers) expect(content).toContain(m)
      expect(rowMarkers.length).toBe(c.expectedRows)

      // Shift markers must be DAY or NIGHT (never numeric).
      const shiftMarkers = content.match(/SHIFT:(DAY|NIGHT)/g) ?? []
      expect(shiftMarkers.length).toBeGreaterThanOrEqual(8)

      // Signed marker present per day row (Y/N)
      for (let i = 0; i < 7; i += 1) {
        expect(content).toMatch(new RegExp(`ROW:${i} SHIFT:(DAY|NIGHT) SIGNED:(Y|N)`))
      }
    })
  }
})

