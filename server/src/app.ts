import Fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { loadEnv } from './env'
import { authPlugin } from './plugins/auth'
import { healthRoutes } from './routes/health'
import { authRoutes } from './routes/auth'
import { staffingRoutes } from './routes/staffing'
import { staffingAgencyApiRoutes } from './routes/staffingAgencyApi'
import { staffingCronRoutes } from './routes/staffingCron'

export function buildApp() {
  const env = loadEnv()

  const app = Fastify({
    logger: true,
    trustProxy: true,
  })

  app.register(sensible)

  const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  app.register(cors, {
    origin: corsOrigins.length === 1 ? corsOrigins[0]! : corsOrigins,
    credentials: true,
  })

  app.register(swagger, {
    openapi: {
      info: {
        title: 'JIM Staffing API',
        version: '1.0.0',
      },
    },
  })
  app.register(swaggerUi, { routePrefix: '/docs' })

  app.register(authPlugin, {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    corsOrigin: env.CORS_ORIGIN,
  })

  app.register(healthRoutes, { prefix: '/api/v1' })
  app.register(authRoutes, { prefix: '/api/v1' })
  app.register(staffingRoutes, { prefix: '/api/v1' })
  app.register(staffingCronRoutes, { prefix: '/api/v1' })
  app.register(staffingAgencyApiRoutes, { prefix: '/api/staffing/v1' })

  return app
}

