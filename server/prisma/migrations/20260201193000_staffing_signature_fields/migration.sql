-- Add signature fields to staffing time events.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE "staffing_time_events"
  ADD COLUMN IF NOT EXISTS "signed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signature_png_base64" TEXT;

