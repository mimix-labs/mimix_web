import { once } from 'node:events'
import { getPort } from './helpers.js'

if (process.env.MIMIX_CONTRACT_RUNTIME === 'nest') {
  const { createApi } = await import('../../apps/api/dist/app.js')
  const { parseEnvironment } = await import('../../apps/api/dist/config/environment.js')
  const app = await createApi(parseEnvironment({ ...process.env, LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent' }))
  await app.listen(0, '127.0.0.1')
  process.send?.({ port: getPort(app.getHttpServer()) })
  process.on('SIGTERM', () => { void app.close().then(() => process.exit(0)) })
} else {
  const { createLegacyApp } = await import('../../server/src/legacy.js')
  const legacy = createLegacyApp()
  const server = legacy.app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  process.send?.({ port: getPort(server) })
  process.on('SIGTERM', () => {
    legacy.close()
    server.closeAllConnections()
    server.close(() => process.exit(0))
  })
}
