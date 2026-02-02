import 'dotenv/config'
import { buildApp } from './app.js'
import { loadEnv } from './env.js'

const env = loadEnv()
const app = buildApp()

async function main() {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  app.log.error(err)
  process.exitCode = 1
})

