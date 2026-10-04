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
  private readonly buckets = new Map<string, { count: number; reset: number }>()
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
    if (path !== '/api/health') {
      const now = Date.now()
      for (const [key, bucket] of this.buckets) if (bucket.reset <= now) this.buckets.delete(key)
      let bucket = this.buckets.get(request.ip)
      if (!bucket) {
        if (this.buckets.size >= 10000) return reject(429, 'rate limit exceeded')
        bucket = { count: 0, reset: now + 60000 }; this.buckets.set(request.ip, bucket)
      }
      if (++bucket.count > this.config.rateLimit) { headers['retry-after'] = String(Math.ceil((bucket.reset - now) / 1000)); return reject(429, 'rate limit exceeded') }
    }
    if (request.method === 'OPTIONS') {
      headers['access-control-allow-methods'] = 'GET,HEAD,PUT,PATCH,POST,DELETE'
      headers['access-control-allow-headers'] = 'authorization,content-type,x-mimix-control-token,x-mimix-robot-token'
      return { status: 204, headers }
    }
    const method = request.method === 'HEAD' ? 'GET' : request.method
    const access = routeAccess[`${method} ${path}`]
    if (!access) return reject(404, 'not found')
    if (path === '/api/identity/me') headers['cache-control'] = 'no-store'
    if (this.config.authMode === 'legacy' && path !== '/api/identity/me') return { headers }
    if (access === 'public') return { headers }
    if (access === 'user') {
      const authorization = request.headers.authorization
      if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) return reject(401, 'invalid session')
      if (!this.provider || !this.repository) return reject(503, 'identity unavailable')
      try {
        const identity = await this.provider.authenticate(authorization.slice(7))
        return { headers, user: this.repository.resolve(identity) }
      } catch (error) { return reject(error instanceof IdentityError ? error.status : 503, error instanceof IdentityError ? error.message : 'identity unavailable') }
    }
    const secret = access === 'bridge' ? this.config.bridgeToken : this.config.controlToken
    if (!secret) return reject(503, 'required credential is not configured')
    const header = access === 'bridge' ? 'x-mimix-robot-token' : 'x-mimix-control-token'
    return matches(request.headers[header], secret) ? { headers } : reject(401, 'invalid credential')
  }
}
