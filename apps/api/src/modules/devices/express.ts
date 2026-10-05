import { Router, json, type ErrorRequestHandler, type Request, type Response, type NextFunction } from 'express'
import { DeviceError } from './contract.js'
import { DeviceHttp, type DeviceAction, type DeviceRequest } from './http.js'
import type { DeviceStore } from './store.js'
export function devicesRouter(store?: DeviceStore): ReturnType<typeof Router> {
  const router = Router(), http = new DeviceHttp(store)
  router.use('/api/devices', json({ limit: '16kb' }))
  const handler = (action: DeviceAction) => (req: Request & DeviceRequest, res: Response, next: NextFunction) => {
    void http.execute(action, req, action === 'audit' || action === 'list' ? req.query : req.body, String(req.params.id ?? ''))
      .then(result => { res.status(result.status).json(result.body) }).catch(next)
  }
  router.post('/api/devices/pairings', handler('pair'))
  router.delete('/api/devices/pairings/:id', handler('cancel'))
  router.post('/api/devices/exchange', handler('exchange'))
  router.get('/api/devices/sessions', handler('list'))
  router.get('/api/devices/sessions/:id', handler('get'))
  router.delete('/api/devices/sessions/:id', handler('revoke'))
  router.post('/api/devices/sessions/:id/authorize', handler('authorize'))
  router.get('/api/devices/self', handler('self'))
  router.post('/api/devices/heartbeat', handler('heartbeat'))
  router.post('/api/devices/disconnect', handler('disconnect'))
  router.get('/api/devices/audit', handler('audit'))
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next
    const parserStatus = (error as { status?: number })?.status
    const status = error instanceof DeviceError ? error.status : parserStatus === 400 || parserStatus === 413 || parserStatus === 415 ? parserStatus : 503
    res.status(status).json({ error: error instanceof DeviceError ? error.message : status < 500 ? 'invalid request' : 'device service unavailable' })
  }
  router.use(errors)
  return router
}
