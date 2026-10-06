import { Router, json, type ErrorRequestHandler, type Request, type Response, type NextFunction } from 'express'
import type { User } from '../identity/identity.contract.js'
import { SyncService, type LocalAction } from './service.js'
import { SyncError } from './contract.js'
export function syncRouter(service: SyncService): ReturnType<typeof Router> {
  const router = Router()
  router.use(json({ limit: '16kb' }))
  const local = (action: LocalAction) => (req: Request, res: Response, next: NextFunction) => {
    void service.localRequest(action, req.headers.authorization, req.get('x-mimix-sync-token'), req.body).then(result => res.status(result.status).json(result.body)).catch(next)
  }
  router.post('/api/offline/sessions', local('session'))
  router.post('/api/offline/attempts', local('attempt'))
  router.post('/api/offline/events', local('event'))
  router.get('/api/offline/status', local('status'))
  router.post('/api/offline/bind', local('bind'))
  router.post('/api/offline/sync', local('sync'))
  for (const action of ['bind', 'batch'] as const) router.post(`/api/sync/${action}`, (req: Request & { user?: User }, res, next) => {
    if (!req.user) { res.status(401).json({ error: 'invalid session' }); return }
    void service.cloudRequest(action, req.user.id, req.body).then(result => res.json(result)).catch(next)
  })
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next
    const raw = (error as { status?: number })?.status
    const status = error instanceof SyncError ? error.status : raw === 400 || raw === 413 || raw === 415 ? raw : 503
    res.status(status).json({ ...(error instanceof SyncError ? { state: error.state } : {}), error: error instanceof SyncError ? error.message : status < 500 ? 'invalid request' : 'sync unavailable' })
  }
  router.use(errors)
  return router
}
