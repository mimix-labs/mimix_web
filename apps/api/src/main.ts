import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { createSecuredLegacy } from './security/legacy.js'
import { createApi } from './app.js'
import { parseEnvironment } from './config/environment.js'

loadEnv({ path: fileURLToPath(new URL('../../../server/.env', import.meta.url)) })
try {
  const config = parseEnvironment(process.env)
  if (config.runtime === 'express') {
    const legacy = createSecuredLegacy(config)
    const server = legacy.app.listen(config.port, config.host)
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
      legacy.close()
      server.close(() => process.exit(0))
    })
    server.on('error', () => { console.error(JSON.stringify({ event: 'startup-failed' })); process.exitCode = 1 })
    server.on('listening', () => console.log(JSON.stringify({ event: 'listening', runtime: 'express', port: config.port })))
  } else {
    const app = await createApi(config)
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
      void app.close().then(() => process.exit(0))
    })
    await app.listen(config.port, config.host)
  }
} catch (error) {
  // Configuration errors contain field names only, never supplied values.
  const message = error instanceof Error && error.message.startsWith('Invalid configuration:') ? error.message : 'API startup failed'
  console.error(JSON.stringify({ event: 'startup-failed', message }))
  process.exitCode = 1
}
