// Vitest setup: ensure required env is present before app/prisma imports.
process.env.DATABASE_URL ||= 'postgresql://jim:jim@localhost:5432/jim?schema=public'
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-which-is-long'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-which-is-long'
process.env.CORS_ORIGIN ||= 'http://localhost:5174'
process.env.PORT ||= '8787'
process.env.STAFFING_API_KEY_PROLOGISTIX ||= 'test-prologistix'
process.env.STAFFING_API_KEY_STAFF_FORCE ||= 'test-staff-force'

