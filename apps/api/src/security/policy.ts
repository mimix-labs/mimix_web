import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'
import type { ApiConfig } from '../config/environment.js'
import { ClerkIdentityProvider } from '../modules/identity/clerk.provider.js'
import { FileIdentityRepository } from '../modules/identity/identity.repository.js'
import { IdentityError, type IdentityProvider, type IdentityRepository, type User, type VerifiedIdentity } from '../modules/identity/identity.contract.js'

export interface IdentityDependencies { provider?: IdentityProvider; repository?: IdentityRepository; deviceAdmission?: (token: string) => string | undefined; deviceCredential?: (token: string) => Promise<string | undefined> }
export interface PolicyRequest { method: string; url: string; headers: IncomingHttpHeaders; ip: string }
export interface PolicyResult { status?: number; error?: string; headers: Record<string, string>; user?: User; identity?: VerifiedIdentity }
type Access = 'public' | 'user' | 'operator' | 'bridge' | 'device'
export const routeAccess: Record<string, Access> = {
  'POST /api/robot-control/leases': 'user', 'GET /api/robot-control/leases/:id': 'user', 'DELETE /api/robot-control/leases/:id': 'user',
  'POST /api/robot-control/leases/:id/heartbeat': 'user', 'POST /api/robot-control/intents': 'user', 'GET /api/robot-control/intents/:id': 'user', 'GET /api/robot-control/audit': 'user',
  'POST /api/media/sessions': 'user', 'GET /api/media/sessions': 'user',
  'GET /api/media/sessions/:id': 'user', 'DELETE /api/media/sessions/:id': 'user',
  'POST /api/media/sessions/:id/user-token': 'user', 'POST /api/media/sessions/:id/device-token': 'device',
  'POST /api/media/sessions/:id/disconnect': 'device',
  'POST /api/devices/pairings': 'user', 'DELETE /api/devices/pairings/:id': 'user',
  'POST /api/devices/exchange': 'public', 'GET /api/devices/sessions': 'user',
  'GET /api/devices/sessions/:id': 'user', 'DELETE /api/devices/sessions/:id': 'user',
  'POST /api/devices/sessions/:id/authorize': 'user', 'GET /api/devices/audit': 'user',
  'GET /api/devices/self': 'device', 'POST /api/devices/heartbeat': 'device', 'POST /api/devices/disconnect': 'device',
  'GET /api/health': 'public', 'GET /api/openapi.json': 'public', 'GET /api/vision/config': 'public',
  'POST /api/learning/attempts': 'user', 'GET /api/learning/progress': 'user',
  'GET /api/learning/attempts/:id': 'user', 'POST /api/learning/attempts/:id/events': 'user',
  'GET /api/campaigns': 'user', 'GET /api/campaigns/:id/versions/:version': 'user',
  'GET /api/campaigns/:id/versions/:version/progress': 'user', 'POST /api/campaigns/:id/versions/:version/nodes/:nodeId/attempts': 'user',
  'POST /api/voice/utterances': 'user', 'DELETE /api/voice/utterances/:id': 'user',
  'GET /api/identity/me': 'user', 'POST /api/challenges/events': 'user',
  'POST /api/vision/hand-landmarks': 'bridge', 'GET /api/robot/context': 'bridge',
  'POST /api/robot/commands': 'bridge', 'GET /api/robot/motion/stream': 'bridge',
  'GET /api/vision/status': 'operator', 'GET /api/vision/stream': 'operator', 'GET /api/vision/video': 'operator',
  'POST /api/robot/context': 'operator', 'GET /api/robot/commands/stream': 'operator',
  'GET /api/robot/status': 'operator', 'POST /api/robot/motion': 'operator',
}
export function requestPath(url: string): string { return url.split('?')[0].toLowerCase().replace(/\/+$/, '') || '/' }
export function policyPath(path: string): string {
  return path.replace(/^\/api\/robot-control\/(leases|intents)\/[0-9a-f-]{36}(?=\/heartbeat$|$)/, '/api/robot-control/$1/:id').replace(/^\/api\/media\/sessions\/[0-9a-f-]{36}(?=\/(user-token|device-token|disconnect)$|$)/, '/api/media/sessions/:id').replace(/^\/api\/devices\/(pairings|sessions)\/[0-9a-f-]{36}(?=\/authorize$|$)/, '/api/devices/$1/:id').replace(/^\/api\/voice\/utterances\/[0-9a-f-]{36}$/, '/api/voice/utterances/:id').replace(/^\/api\/campaigns\/[a-z0-9._-]{1,80}\/versions\/[a-z0-9._-]{1,80}(?=\/|$)/, '/api/campaigns/:id/versions/:version')
    .replace(/^(\/api\/campaigns\/:id\/versions\/:version)\/nodes\/[a-z0-9._-]{1,80}\/attempts$/, '$1/nodes/:nodeId/attempts')
    .replace(/^\/api\/learning\/attempts\/[0-9a-f-]{36}(?=\/events$|$)/, '/api/learning/attempts/:id')
}
const matches = (actual: string | string[] | undefined, expected: string): boolean => typeof actual === 'string' && timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest())

export class HttpSecurityPolicy {
  private readonly provider?: IdentityProvider
  private readonly repository?: IdentityRepository
  // Separate bounded pools: unauthenticated cardinality cannot fill an authenticated pool.
  private readonly buckets = {
    device: new Map<string, { count: number; reset: number }>(),
    anonymous: new Map<string, { count: number; reset: number }>(),
    legacy: new Map<string, { count: number; reset: number }>(),
    user: new Map<string, { count: number; reset: number }>(),
    operator: new Map<string, { count: number; reset: number }>(),
    bridge: new Map<string, { count: number; reset: number }>(),
  }
  private consume(pool: keyof HttpSecurityPolicy['buckets'], key: string, limit: number, headers: Record<string, string>): boolean {
    const now = Date.now()
    const buckets = this.buckets[pool]
    // Entries are inserted in expiry order; stop at the first live window.
    for (const [key, bucket] of buckets) {
      if (bucket.reset > now) break
      buckets.delete(key)
    }
    let bucket = buckets.get(key)
    if (!bucket) {
      if (buckets.size >= 10000) { headers['retry-after'] = '60'; return false }
      bucket = { count: 0, reset: now + 60000 }
      buckets.set(key, bucket)
    }
    if (bucket.count >= limit) {
      headers['retry-after'] = String(Math.max(1, Math.ceil((bucket.reset - now) / 1000)))
      return false
    }
    bucket.count++
    return true
  }
  constructor(private readonly config: ApiConfig, private readonly dependencies: IdentityDependencies = {}) {
    if (config.authMode === 'clerk') {
      this.provider = dependencies.provider ?? new ClerkIdentityProvider(config.clerk)
      this.repository = dependencies.repository ?? new FileIdentityRepository(config.identityFile)
    }
  }
  async authorize(request: PolicyRequest): Promise<PolicyResult> {
    const headers: Record<string, string> = { vary: 'Origin' }
    const reject = (status: number, error: string): PolicyResult => ({ status, error, headers })
    // Express accepts absolute-form request targets; never classify those as static assets.
    if (!request.url.startsWith('/')) return reject(400, 'invalid request target')
    const path = policyPath(requestPath(request.url))
    if (path.startsWith('/api/robot-control')) {
      headers['cache-control'] = 'no-store'
      if (this.config.robot.transport !== 'mqtt') return reject(404, 'not found')
    }
    if (this.config.robot.transport === 'mqtt' && ['/api/robot/motion', '/api/robot/motion/stream'].includes(path)) return reject(404, 'not found')
    if (path.startsWith('/api/media')) {
      headers['cache-control'] = 'no-store'
      if (this.config.media.provider === 'disabled') return reject(404, 'not found')
    }
    if (path.startsWith('/api/devices')) {
      headers['cache-control'] = 'no-store'
      if (!this.config.deviceSessionsEnabled) return reject(404, 'not found')
    }
    if (path.startsWith('/api/voice/') && this.config.authMode !== 'clerk') return reject(404, 'not found')
    if ((path.startsWith('/api/learning') || path.startsWith('/api/campaigns')) && this.config.dataStore !== 'postgres') return reject(404, 'not found')
    // Static frontend is explicitly public. API never falls through to SPA assets.
    const api = path === '/api' || path.startsWith('/api/')
    const origin = request.headers.origin
    if (origin) {
      if (!this.config.allowedOrigins.includes(origin)) return reject(403, 'origin not allowed')
      headers['access-control-allow-origin'] = origin
    }
    if (!api) return { headers }
    const quota = (pool: keyof HttpSecurityPolicy['buckets'], actor: string, route: string, limit: number): PolicyResult | undefined =>
      this.consume(pool, JSON.stringify([actor, route]), limit, headers) ? undefined : reject(429, 'rate limit exceeded')
    const anonymous = (route: string): PolicyResult | undefined => quota('anonymous', request.ip, route, this.config.rateLimits.anonymous)
    if (request.method === 'OPTIONS') {
      const requestedMethod = request.headers['access-control-request-method']
      const requestedHeaders = request.headers['access-control-request-headers'] ?? ''
      const allowedHeaders = ['authorization', 'content-type', 'x-mimix-control-token', 'x-mimix-robot-token']
      const validPreflight = origin && typeof requestedMethod === 'string'
        && routeAccess[`${requestedMethod === 'HEAD' ? 'GET' : requestedMethod} ${path}`]
        && typeof requestedHeaders === 'string'
        && requestedHeaders.split(',').every(header => !header.trim() || allowedHeaders.includes(header.trim().toLowerCase()))
      // A browser sends no actor credential on preflight. Charging it to the proxy's
      // shared IP would let anonymous traffic prevent authenticated requests entirely.
      if (!validPreflight) {
        const limited = anonymous('invalid-preflight')
        if (limited) return limited
      }
      headers['access-control-allow-methods'] = 'GET,HEAD,PUT,PATCH,POST,DELETE'
      headers['access-control-allow-headers'] = 'authorization,content-type,x-mimix-control-token,x-mimix-robot-token'
      return { status: 204, headers }
    }
    const method = request.method === 'HEAD' ? 'GET' : request.method
    const route = `${method} ${path}`
    const access = routeAccess[route]
    if (!access) return anonymous('unknown') ?? reject(404, 'not found')
    if (path.startsWith('/api/voice/') || path === '/api/identity/me' || path.startsWith('/api/learning/') || path === '/api/campaigns' || path.startsWith('/api/campaigns/')) headers['cache-control'] = 'no-store'
    if (path === '/api/health') return { headers }
    if (access === 'public') return anonymous(route) ?? { headers }
    if (access === 'device') {
      const credential = request.headers.authorization ?? ''
      if (!/^Device [^\s,]{1,128}$/.test(credential)) return anonymous('invalid-device') ?? reject(401, 'invalid device credential')
      if (!this.dependencies.deviceAdmission || !this.dependencies.deviceCredential) return reject(503, 'device service unavailable')
      // Authenticate the server signature without I/O, then budget all expensive lookups.
      // The shared key admits valid credentials on a cold replica without borrowing IP quota.
      const identity = this.dependencies.deviceAdmission(credential.slice(7))
      if (!identity) return anonymous('invalid-device') ?? reject(401, 'invalid device credential')
      const limited = quota('device', identity, 'all', this.config.rateLimits.machine)
      if (limited) return limited
      let sessionId
      try { sessionId = await this.dependencies.deviceCredential(credential.slice(7)) }
      catch { return reject(503, 'device service unavailable') }
      if (!sessionId) return reject(401, 'invalid device credential')
      return { headers }
    }

    const secret = access === 'bridge' ? this.config.bridgeToken : access === 'operator' ? this.config.controlToken : ''
    const credential = access === 'bridge' ? request.headers['x-mimix-robot-token'] : request.headers['x-mimix-control-token']
    // Valid machine credentials are isolated even in compatibility mode. Existing legacy
    // handlers still enforce their original bridge/control requirements afterwards.
    if ((access === 'bridge' || access === 'operator') && secret && matches(credential, secret)) {
      return quota(access, access, route, path === '/api/vision/hand-landmarks' ? this.config.rateLimits.landmarks : this.config.rateLimits.machine) ?? { headers }
    }
    if (this.config.authMode === 'legacy' && path !== '/api/identity/me') {
      return quota('legacy', request.ip, route, path === '/api/vision/hand-landmarks' ? this.config.rateLimits.landmarks : this.config.rateLimits.legacy) ?? { headers }
    }
    if (access === 'user') {
      const authorization = request.headers.authorization
      if (!authorization || !/^Bearer [^\s,]+$/i.test(authorization)) return anonymous('invalid-credential') ?? reject(401, 'invalid session')
      if (!this.provider || !this.repository) return reject(503, 'identity unavailable')
      let identity
      try { identity = await this.provider.verifyToken(authorization.slice(7)) } catch (error) {
        return anonymous('invalid-credential') ?? reject(error instanceof IdentityError ? error.status : 503, error instanceof IdentityError ? error.message : 'identity unavailable')
      }
      // Only cryptographically verified identity may select an actor quota. Neither raw
      // token rotation nor untrusted claims/IP headers can select another user's bucket.
      const actor = JSON.stringify([identity.provider, identity.issuer, identity.subject])
      const limited = quota('user', actor, route, route === 'POST /api/devices/pairings' ? Math.min(10, this.config.rateLimits.user) : this.config.rateLimits.user)
      if (limited) return limited
      try {
        await this.provider.verifySession(identity)
        return { headers, user: await this.repository.resolve(identity), identity }
      } catch (error) { return reject(error instanceof IdentityError ? error.status : 503, error instanceof IdentityError ? error.message : 'identity unavailable') }
    }
    return anonymous('invalid-credential') ?? reject(secret ? 401 : 503, secret ? 'invalid credential' : 'required credential is not configured')
  }
}
