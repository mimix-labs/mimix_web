import { Router, json, type ErrorRequestHandler, type Request, type Response, type NextFunction } from 'express'
import { LearningError } from '../learning/contract.js'
import type { User } from '../identity/identity.contract.js'
import { CampaignHttp, type CampaignAction } from './http.js'
import type { CampaignStore } from './store.js'
export function campaignRouter(store?: CampaignStore): ReturnType<typeof Router> {
  const router = Router(), http = new CampaignHttp(store)
  router.use('/api/campaigns', json({ limit: '16kb' }))
  const handler = (action: CampaignAction) => (req: Request & { user?: User }, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ error: 'invalid session' }); return }
    const params = { id: String(req.params.id ?? ''), version: String(req.params.version ?? ''), nodeId: String(req.params.nodeId ?? '') }
    void http.execute(action, req.user.id, params, req.query, req.body).then(result => { res.status(result.status).json(result.body) }).catch(next)
  }
  router.get('/api/campaigns', handler('list'))
  router.get('/api/campaigns/:id/versions/:version', handler('get'))
  router.get('/api/campaigns/:id/versions/:version/progress', handler('progress'))
  router.post('/api/campaigns/:id/versions/:version/nodes/:nodeId/attempts', handler('start'))
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next
    const parserStatus = (error as { status?: number })?.status
    const status = error instanceof LearningError ? error.status : parserStatus === 400 || parserStatus === 413 || parserStatus === 415 ? parserStatus : 503
    res.status(status).json({ error: error instanceof LearningError ? error.message : status < 500 ? 'invalid request' : 'campaign storage unavailable' })
  }
  router.use(errors)
  return router
}
