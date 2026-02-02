-- Add shift classification fields for worked segments (stored on CLOCK_OUT events).
-- Safe to run multiple times (IF NOT EXISTS checks).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'StaffingShiftType'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "StaffingShiftType" AS ENUM ('DAY', 'NIGHT');
  END IF;
END
$$;

ALTER TABLE "staffing_time_events"
  ADD COLUMN IF NOT EXISTS "shift_type" "StaffingShiftType",
  ADD COLUMN IF NOT EXISTS "shift_window_label" TEXT,
  ADD COLUMN IF NOT EXISTS "cross_shift" BOOLEAN;

