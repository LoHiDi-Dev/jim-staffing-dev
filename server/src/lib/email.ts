import nodemailer from 'nodemailer'
import { loadEnv } from '../env.js'

export async function sendEmail(args: {
  to: string[]
  subject: string
  text: string
  attachments?: Array<{ filename: string; content: string; contentType?: string }>
}): Promise<void> {
  const env = loadEnv()
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM) {
    throw new Error('SMTP not configured (SMTP_HOST, SMTP_PORT, SMTP_FROM).')
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  })

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: args.to.join(','),
    subject: args.subject,
    text: args.text,
    attachments: (args.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })
}

