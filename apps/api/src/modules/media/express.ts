import { Router, json, type ErrorRequestHandler, type Request, type Response, type NextFunction } from 'express'
import { DeviceError } from '../devices/contract.js'
import { MediaError, type MediaService } from './service.js'
import { MediaHttp, type MediaAction } from './http.js'
import type { DeviceRequest } from '../devices/http.js'
export function mediaRouter(store?: MediaService): ReturnType<typeof Router> {
  const router = Router(), http = new MediaHttp(store)
  router.use('/api/media', json({ limit: '16kb' }))
  const handler = (action: MediaAction) => (req: Request & DeviceRequest, res: Response, next: NextFunction) => {
    void http.execute(action, req, action === 'list' ? req.query : req.body, String(req.params.id ?? ''))
      .then(result => { res.status(result.status).json(result.body) }).catch(next)
  }
  router.post('/api/media/sessions', handler('create'))
  router.get('/api/media/sessions', handler('list'))
  router.get('/api/media/sessions/:id', handler('get'))
  router.delete('/api/media/sessions/:id', handler('close'))
  router.post('/api/media/sessions/:id/user-token', handler('user-token'))
  router.post('/api/media/sessions/:id/device-token', handler('device-token'))
  router.post('/api/media/sessions/:id/disconnect', handler('disconnect'))
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next
    const parserStatus = (error as { status?: number })?.status
    const status = (error instanceof DeviceError || error instanceof MediaError) ? error.status : parserStatus === 400 || parserStatus === 413 || parserStatus === 415 ? parserStatus : 503
    res.status(status).json({ error: (error instanceof DeviceError || error instanceof MediaError) ? error.message : status < 500 ? 'invalid request' : 'media service unavailable' })
  }
  router.use(errors)
  return router
}
