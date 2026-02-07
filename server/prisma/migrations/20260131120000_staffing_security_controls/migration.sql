-- Staffing security controls + audit fields
-- - Add Wi‑Fi allowlist status enum
-- - Add punch token table
-- - Add idempotency + IP + device + drift fields to staffing_time_events
-- - Extend block reasons
-- - Remove BLUECREW from StaffingAgency (mapped to STAFF_FORCE if present)

-- Extend existing enum for block reasons
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StaffingBlockReason') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'StaffingBlockReason' AND e.enumlabel = 'NOT_ON_WAREHOUSE_WIFI'
    ) THEN
      ALTER TYPE "StaffingBlockReason" ADD VALUE 'NOT_ON_WAREHOUSE_WIFI';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'StaffingBlockReason' AND e.enumlabel = 'INVALID_PUNCH_TOKEN'
    ) THEN
      ALTER TYPE "StaffingBlockReason" ADD VALUE 'INVALID_PUNCH_TOKEN';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'StaffingBlockReason' AND e.enumlabel = 'MISSING_IDEMPOTENCY_KEY'
    ) THEN
      ALTER TYPE "StaffingBlockReason" ADD VALUE 'MISSING_IDEMPOTENCY_KEY';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'StaffingBlockReason' AND e.enumlabel = 'REUSED_IDEMPOTENCY_KEY'
    ) THEN
      ALTER TYPE "StaffingBlockReason" ADD VALUE 'REUSED_IDEMPOTENCY_KEY';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'StaffingBlockReason' AND e.enumlabel = 'RATE_LIMITED'
    ) THEN
      ALTER TYPE "StaffingBlockReason" ADD VALUE 'RATE_LIMITED';
    END IF;
  END IF;
END $$;

-- Create enum for Wi‑Fi allowlist
DO $$
BEGIN
  -- Note: pg_type.typname is not unique across schemas. Ensure we create the enum in the current schema
  -- (Prisma uses `?schema=...` for isolated environments like Playwright).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'StaffingWifiAllowlistStatus' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "StaffingWifiAllowlistStatus" AS ENUM ('PASS', 'FAIL', 'DEV_BYPASS');
  END IF;
END $$;

-- Create punch token table (append-only issuance, revocable)
CREATE TABLE IF NOT EXISTS "staffing_punch_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "user_agent_hash" TEXT,
  "token_hash" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "last_seen_at" TIMESTAMP(3),
  CONSTRAINT "staffing_punch_tokens_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staffing_punch_tokens_user_id_fkey'
  ) THEN
    ALTER TABLE "staffing_punch_tokens"
      ADD CONSTRAINT "staffing_punch_tokens_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "staffing_punch_tokens_user_id_device_id_idx" ON "staffing_punch_tokens"("user_id", "device_id");
CREATE INDEX IF NOT EXISTS "staffing_punch_tokens_expires_at_idx" ON "staffing_punch_tokens"("expires_at");

-- Add missing columns to staffing_time_events
ALTER TABLE "staffing_time_events"
  ADD COLUMN IF NOT EXISTS "client_reported_timestamp" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "client_time_drift_ms" INTEGER,
  ADD COLUMN IF NOT EXISTS "client_time_drift_flag" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "ip_address" TEXT,
  ADD COLUMN IF NOT EXISTS "wifi_allowlist_status" "StaffingWifiAllowlistStatus",
  ADD COLUMN IF NOT EXISTS "device_id" TEXT,
  ADD COLUMN IF NOT EXISTS "punch_token_id" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

CREATE INDEX IF NOT EXISTS "staffing_time_events_idempotency_key_idx" ON "staffing_time_events"("idempotency_key");

-- Remove Bluecrew from supported agencies (map any existing data to STAFF_FORCE)
UPDATE "staffing_contractor_profiles" SET "agency" = 'STAFF_FORCE' WHERE "agency" = 'BLUECREW';
UPDATE "staffing_time_events" SET "agency" = 'STAFF_FORCE' WHERE "agency" = 'BLUECREW';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'StaffingAgency' AND e.enumlabel = 'BLUECREW'
  ) THEN
    -- PostgreSQL cannot DROP VALUE from an enum; recreate the enum without BLUECREW.
    CREATE TYPE "StaffingAgency_new" AS ENUM ('PROLOGISTIX', 'STAFF_FORCE');
    ALTER TABLE "staffing_contractor_profiles" ALTER COLUMN "agency" TYPE "StaffingAgency_new" USING ("agency"::text::"StaffingAgency_new");
    ALTER TABLE "staffing_time_events" ALTER COLUMN "agency" TYPE "StaffingAgency_new" USING ("agency"::text::"StaffingAgency_new");
    DROP TYPE "StaffingAgency";
    ALTER TYPE "StaffingAgency_new" RENAME TO "StaffingAgency";
  END IF;
END $$;

