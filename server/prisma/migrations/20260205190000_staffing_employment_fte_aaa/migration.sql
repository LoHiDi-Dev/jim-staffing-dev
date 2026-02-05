-- AlterEnum: add FTE and AAA to StaffingEmploymentType for consistent Site • Role • Employment type across platforms
ALTER TYPE "StaffingEmploymentType" ADD VALUE 'FTE';
ALTER TYPE "StaffingEmploymentType" ADD VALUE 'AAA';
