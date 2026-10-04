import { createLegacyApp } from 'mimix-server/legacy'
import type { ApiConfig } from '../config/environment.js'
import { legacyEnvironment } from '../config/environment.js'
import { HttpSecurityPolicy, requestPath, type IdentityDependencies } from './policy.js'

export function createSecuredLegacy(config: ApiConfig, dependencies: IdentityDependencies = {}) {
  const policy = new HttpSecurityPolicy(config, dependencies)
  return createLegacyApp({ env: legacyEnvironment(config), corsEnabled: false, beforeRoutes: (req, res, next) => {
    void policy.authorize({ method: req.method, url: req.url, headers: req.headers, ip: req.socket.remoteAddress ?? 'unknown' }).then(result => {
      for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
      if (result.status) { res.status(result.status); if (result.status === 204) res.end(); else res.json({ error: result.error }); return }
      if (requestPath(req.url) === '/api/identity/me') { res.json(result.user); return }
      next()
    }).catch(() => { res.status(503).json({ error: 'identity unavailable' }) })
  } })
}
