import type { FastifyPluginAsync } from 'fastify'
import { loadEnv } from '../env'
import { runWeeklyReport } from '../lib/staffingWeeklyReport'

/**
 * Cron endpoint for weekly staffing report. Secured by STAFFING_REPORT_CRON_SECRET.
 * Platform cron (e.g. Vercel Cron) should call POST /api/v1/staffing/cron/weekly-report
 * with header: Authorization: Bearer <STAFFING_REPORT_CRON_SECRET>
 * or x-cron-secret: <STAFFING_REPORT_CRON_SECRET>
 */
export const staffingCronRoutes: FastifyPluginAsync = async (app) => {
  app.post('/staffing/cron/weekly-report', async (req, reply) => {
    const env = loadEnv()
    const secret = env.STAFFING_REPORT_CRON_SECRET ?? ''
    const auth = String(req.headers.authorization ?? '')
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
    const headerSecret = String(req.headers['x-cron-secret'] ?? '')
    const provided = bearer || headerSecret

    if (!secret || provided !== secret) {
      throw app.httpErrors.unauthorized('Invalid or missing cron secret.')
    }

    const result = await runWeeklyReport()
    return reply.send(result)
  })
}

