-- CreateEnum
CREATE TYPE "SiteRole" AS ENUM ('ADMIN', 'MANAGER', 'OPERATOR', 'REGIONAL_MANAGER');

-- CreateEnum
CREATE TYPE "StaffingEmploymentType" AS ENUM ('LTC', 'STC');

-- CreateEnum
CREATE TYPE "StaffingAgency" AS ENUM ('PROLOGISTIX', 'STAFF_FORCE', 'BLUECREW');

-- CreateEnum
CREATE TYPE "StaffingEventType" AS ENUM ('CLOCK_IN', 'LUNCH_START', 'LUNCH_END', 'CLOCK_OUT');

-- CreateEnum
CREATE TYPE "StaffingEventStatus" AS ENUM ('OK', 'BLOCKED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "StaffingBlockReason" AS ENUM ('OUT_OF_RANGE', 'PERMISSION_DENIED', 'LOCATION_UNAVAILABLE', 'ACCURACY_LOW', 'INVALID_STATE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "default_site_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "role" "SiteRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffing_contractor_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "employment_type" "StaffingEmploymentType" NOT NULL,
    "agency" "StaffingAgency" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffing_contractor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffing_time_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "site_id" TEXT,
    "agency" "StaffingAgency" NOT NULL,
    "type" "StaffingEventType" NOT NULL,
    "status" "StaffingEventStatus" NOT NULL DEFAULT 'OK',
    "reason" "StaffingBlockReason",
    "server_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geo_lat" DOUBLE PRECISION,
    "geo_lng" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "distance_meters" DOUBLE PRECISION,
    "in_range" BOOLEAN,
    "user_agent" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staffing_time_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_default_site_id_idx" ON "users"("default_site_id");

-- CreateIndex
CREATE INDEX "user_sites_site_id_idx" ON "user_sites"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sites_user_id_site_id_key" ON "user_sites"("user_id", "site_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "staffing_contractor_profiles_user_id_key" ON "staffing_contractor_profiles"("user_id");

-- CreateIndex
CREATE INDEX "staffing_time_events_user_id_server_timestamp_idx" ON "staffing_time_events"("user_id", "server_timestamp");

-- CreateIndex
CREATE INDEX "staffing_time_events_agency_server_timestamp_idx" ON "staffing_time_events"("agency", "server_timestamp");

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_contractor_profiles" ADD CONSTRAINT "staffing_contractor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_time_events" ADD CONSTRAINT "staffing_time_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_time_events" ADD CONSTRAINT "staffing_time_events_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
