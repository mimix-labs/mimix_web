import { Router, json, type ErrorRequestHandler, type Request } from 'express'
import type { User } from '../identity/identity.contract.js'
import { VoiceHttp, VoiceHttpError } from './http.js'
import type { VoiceService } from './service.js'
export function voiceRouter(service: VoiceService): ReturnType<typeof Router> {
  const router = Router(), http = new VoiceHttp(service)
  router.use('/api/voice', json({ limit: '16kb' }))
  router.post('/api/voice/utterances', (req: Request & { user?: User }, res, next) => {
    if (!req.user) { res.status(401).json({ error: 'invalid session' }); return }
    if (!req.is('application/json')) { next(new VoiceHttpError(415)); return }
    const controller = new AbortController(), disconnect = () => controller.abort()
    res.once('close', disconnect)
    if (req.aborted || res.destroyed) controller.abort()
    Promise.resolve().then(() => http.speak(req.user!.id, req.body, req.query, controller.signal))
      .then(result => { if (!res.destroyed) res.json(result) }).catch(next).finally(() => res.off('close', disconnect))
  })
  router.delete('/api/voice/utterances/:id', (req: Request & { user?: User }, res, next) => {
    if (!req.user) { res.status(401).json({ error: 'invalid session' }); return }
    try { res.json(http.cancel(req.user.id, req.params.id, req.query)) } catch (error) { next(error) }
  })
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next
    const parserStatus = (error as { status?: number })?.status
    const status = error instanceof VoiceHttpError ? error.status : [400, 413, 415].includes(parserStatus ?? 0) ? parserStatus! : 500
    if (!res.destroyed) res.status(status).json({ error: status < 500 ? 'invalid voice request' : 'voice unavailable' })
  }
  router.use(errors)
  return router
}
