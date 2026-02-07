-- Add verification method + boolean verification flags for staffing time events.
-- This migration is written to be safe to run multiple times (IF NOT EXISTS checks).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'StaffingVerificationMethod'
      AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "StaffingVerificationMethod" AS ENUM ('wifi', 'location', 'both', 'none');
  END IF;
END
$$;

ALTER TABLE "staffing_time_events"
  ADD COLUMN IF NOT EXISTS "wifi_verified" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "location_verified" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "verification_method" "StaffingVerificationMethod";

