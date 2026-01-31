import { z } from 'zod'

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.string().optional(),

  // Staffing agency API keys (env-based MVP)
  STAFFING_API_KEY_PROLOGISTIX: z.string().optional(),
  STAFFING_API_KEY_STAFF_FORCE: z.string().optional(),
  STAFFING_API_KEY_BLUECREW: z.string().optional(),

  // Staffing weekly report (optional)
  STAFFING_REPORT_RECIPIENTS: z.string().optional(),
  STAFFING_REPORT_CRON_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment:\n${msg}`)
  }
  return parsed.data
}

