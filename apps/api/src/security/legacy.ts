import { voiceRouter } from '../modules/voice/express.js'
import { createVoiceService } from '../modules/voice/factory.js'
import { addVoicePaths } from '../modules/voice/openapi.js'
import type { VoiceService } from '../modules/voice/service.js'
import { createLegacyApp } from 'mimix-server/legacy'
import type { ApiConfig } from '../config/environment.js'
import { legacyEnvironment } from '../config/environment.js'
import { HttpSecurityPolicy, requestPath, type IdentityDependencies } from './policy.js'
import { dataServices } from '../database/services.js'
import { campaignRouter } from '../modules/campaigns/express.js'
import { addCampaignPaths } from '../modules/campaigns/openapi.js'
import { learningRouter } from '../modules/learning/express.js'
import { addLearningPaths } from '../modules/learning/openapi.js'
import { addLegacyPaths } from '../openapi.js'

export function createSecuredLegacy(config: ApiConfig, dependencies: IdentityDependencies & { voice?: VoiceService } = {}) {
  const services = dataServices(config, dependencies)
  const voice = dependencies.voice ?? createVoiceService(config.voice), voiceRoutes = voiceRouter(voice)
  const policy = new HttpSecurityPolicy(config, services.identity)
  const learning = learningRouter(services.learning), campaigns = campaignRouter(services.campaigns)
  const document = addLearningPaths(addLegacyPaths({ openapi: '3.0.0', info: { title: 'Mimix API', version: '0.3.0' }, paths: {}, components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' }, BridgeToken: { type: 'apiKey', in: 'header', name: 'X-Mimix-Robot-Token' }, ControlToken: { type: 'apiKey', in: 'header', name: 'X-Mimix-Control-Token' } } } }, config), config)
  addCampaignPaths(document, config)
  addVoicePaths(document, config)
  const legacy = createLegacyApp({ env: legacyEnvironment(config), corsEnabled: false, beforeRoutes: (req, res, next) => {
    void policy.authorize({ method: req.method, url: req.url, headers: req.headers, ip: req.socket.remoteAddress ?? 'unknown' }).then(result => {
      for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
      if (result.status) { res.status(result.status); if (result.status === 204) res.end(); else res.json({ error: result.error }); return }
      const path = requestPath(req.url)
      if (path.startsWith('/api/voice/')) { Object.assign(req, { user: result.user }); voiceRoutes(req, res, next); return }
      if (path === '/api/identity/me') { res.json(result.user); return }
      if (path === '/api/openapi.json') { res.json(document); return }
      if (path.startsWith('/api/learning/')) { Object.assign(req, { user: result.user }); learning(req, res, next); return }
      if (path === '/api/campaigns' || path.startsWith('/api/campaigns/')) { Object.assign(req, { user: result.user }); campaigns(req, res, next); return }
      next()
    }).catch(() => { res.status(503).json({ error: 'identity unavailable' }) })
  } })
  return { ...legacy, close: async () => { voice.close(); legacy.close(); await services.close() } }
}
