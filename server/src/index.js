import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import { createLegacyApp } from './legacy.js'

export { createLegacyApp } from './legacy.js'
const legacy = createLegacyApp()
export const app = legacy.app

export function startServer({ port = Number(process.env.PORT ?? 4000), host = process.env.HOST || '0.0.0.0' } = {}) {
  return app.listen(port, host)
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const server = startServer()
  process.on('SIGTERM', () => {
    legacy.close()
    server.close(() => process.exit(0))
  })
}
