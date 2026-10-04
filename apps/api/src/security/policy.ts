import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'
import type { ApiConfig } from '../config/environment.js'
import { ClerkIdentityProvider } from '../modules/identity/clerk.provider.js'
import { FileIdentityRepository } from '../modules/identity/identity.repository.js'
import { IdentityError, type IdentityProvider, type IdentityRepository, type User } from '../modules/identity/identity.contract.js'

export interface IdentityDependencies { provider?: IdentityProvider; repository?: IdentityRepository }
export interface PolicyRequest { method: string; url: string; headers: IncomingHttpHeaders; ip: string }
export interface PolicyResult { status?: number; error?: string; headers: Record<string, string>; user?: User }
type Access = 'public' | 'user' | 'operator' | 'bridge'
export const routeAccess: Record<string, Access> = {
  'GET /api/health': 'public', 'GET /api/openapi.json': 'public', 'GET /api/vision/config': 'public',
  'GET /api/identity/me': 'user', 'POST /api/challenges/events': 'user',
  'POST /api/vision/hand-landmarks': 'bridge', 'GET /api/robot/context': 'bridge',
  'POST /api/robot/commands': 'bridge', 'GET /api/robot/motion/stream': 'bridge',
  'GET /api/vision/status': 'operator', 'GET /api/vision/stream': 'operator', 'GET /api/vision/video': 'operator',
  'POST /api/robot/context': 'operator', 'GET /api/robot/commands/stream': 'operator',
  'GET /api/robot/status': 'operator', 'POST /api/robot/motion': 'operator',
}
export function requestPath(url: string): string { return url.split('?')[0].toLowerCase().replace(/\/+$/, '') || '/' }
const matches = (actual: string | string[] | undefined, expected: string): boolean => typeof actual === 'string' && timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest())

export class HttpSecurityPolicy {
  private readonly provider?: IdentityProvider
  private readonly repository?: IdentityRepository
  // Separate bounded pools: unauthenticated cardinality cannot fill an authenticated pool.
  private readonly buckets = {
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
  constructor(private readonly config: ApiConfig, dependencies: IdentityDependencies = {}) {
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
    const path = requestPath(request.url)
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
    if (path === '/api/identity/me') headers['cache-control'] = 'no-store'
    if (path === '/api/health') return { headers }
    if (access === 'public') return anonymous(route) ?? { headers }

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
      const limited = quota('user', actor, route, this.config.rateLimits.user)
      if (limited) return limited
      try {
        await this.provider.verifySession(identity)
        return { headers, user: this.repository.resolve(identity) }
      } catch (error) { return reject(error instanceof IdentityError ? error.status : 503, error instanceof IdentityError ? error.message : 'identity unavailable') }
    }
    return anonymous('invalid-credential') ?? reject(secret ? 401 : 503, secret ? 'invalid credential' : 'required credential is not configured')
  }
}
