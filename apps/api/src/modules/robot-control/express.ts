import { Router, json, type ErrorRequestHandler, type Request, type Response, type NextFunction } from 'express'
import { DeviceError } from '../devices/contract.js'
import type { DeviceRequest } from '../devices/http.js'
import { RobotControlHttp, type ControlAction } from './http.js'
import type { RobotControlService } from './service.js'
export function robotControlRouter(service?: RobotControlService): ReturnType<typeof Router> {
  const router = Router(), http = new RobotControlHttp(service)
  router.use('/api/robot-control', json({ limit: '16kb' }))
  const handler = (action: ControlAction) => (req: Request & DeviceRequest, res: Response, next: NextFunction) => {
    void http.execute(action, req, action === 'audit' ? req.query : req.body, String(req.params.id ?? ''))
      .then(result => { res.status(result.status).json(result.body) }).catch(next)
  }
  router.post('/api/robot-control/leases', handler('acquire'))
  router.post('/api/robot-control/leases/:id/heartbeat', handler('heartbeat'))
  router.delete('/api/robot-control/leases/:id', handler('release'))
  router.get('/api/robot-control/leases/:id', handler('session'))
  router.post('/api/robot-control/intents', handler('dispatch'))
  router.get('/api/robot-control/intents/:id', handler('command'))
  router.get('/api/robot-control/audit', handler('audit'))
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next
    const parserStatus = (error as { status?: number })?.status
    const status = error instanceof DeviceError ? error.status : [400, 413, 415].includes(parserStatus ?? 0) ? parserStatus! : 503
    res.status(status).json({ error: error instanceof DeviceError ? error.message : status < 500 ? 'invalid request' : 'robot control unavailable' })
  }
  router.use(errors)
  return router
}
