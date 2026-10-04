import { Router, json, type ErrorRequestHandler, type Request, type Response, type NextFunction } from 'express'
import { LearningError } from './contract.js'
import { LearningHttp } from './http.js'
import type { LearningStore } from './store.js'
import type { User } from '../identity/identity.contract.js'
export function learningRouter(store?: LearningStore): ReturnType<typeof Router> {
  const router = Router(), http = new LearningHttp(store)
  router.use('/api/learning', json({ limit: '16kb' }))
  const handler = (action: 'create' | 'append' | 'get' | 'progress') => (req: Request & { user?: User }, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ error: 'invalid session' }); return }
    void http.execute(action, req.user.id, action === 'progress' ? req.query : req.body, String(req.params.id ?? '')).then(result => { res.status(result.status).json(result.body) }).catch(next)
  }
  router.post('/api/learning/attempts', handler('create'))
  router.post('/api/learning/attempts/:id/events', handler('append'))
  router.get('/api/learning/attempts/:id', handler('get'))
  router.get('/api/learning/progress', handler('progress'))
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next // Four arguments are required for Express error middleware.
    const parserStatus = (error as { status?: number })?.status
    const status = error instanceof LearningError ? error.status : parserStatus === 400 || parserStatus === 413 || parserStatus === 415 ? parserStatus : 503
    res.status(status).json({ error: error instanceof LearningError ? error.message : status < 500 ? 'invalid request' : 'learning storage unavailable' })
  }
  router.use(errors)
  return router
}
