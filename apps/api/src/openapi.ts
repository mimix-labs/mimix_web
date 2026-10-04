import type { ApiConfig } from './config/environment.js'
import { routeAccess } from './security/policy.js'
import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger'

// Transitional routes still run in Express, so they are documented explicitly.
// Their behavior is pinned by the same contract suite used for both runtimes.
export function addLegacyPaths(document: OpenAPIObject, config: Pick<ApiConfig, 'authMode' | 'rateLimits'>): OpenAPIObject {
  const object = (properties: SchemaObject['properties'], required: string[] = []): SchemaObject => ({ type: 'object', properties, required })
  const string: SchemaObject = { type: 'string' }
  const routes: Array<[string, 'get' | 'post', string, number, SchemaObject?, string?]> = [
    ['/api/vision/config', 'get', 'Configured vision mode', 200],
    ['/api/vision/status', 'get', 'Vision connection status', 200],
    ['/api/vision/hand-landmarks', 'post', 'Publish hand landmarks', 202, object({ landmarks: { type: 'array', items: {} }, handedness: { type: 'array', items: {} }, timestamp: { type: 'number' }, source: string }, ['landmarks', 'handedness'])],
    ['/api/vision/stream', 'get', 'Hand landmarks SSE', 200, undefined, 'sse'],
    ['/api/vision/video', 'get', 'Legacy HTTP MJPEG proxy', 200, undefined, 'mjpeg'],
    ['/api/robot/context', 'get', 'Latest learning context (optional bridge credential)', 200, undefined, 'optional-bridge'],
    ['/api/robot/context', 'post', 'Publish learning context', 202, object({ page: { type: 'string', enum: ['world', 'challenge'] }, challenge: { type: 'string', nullable: true, enum: ['mathematics', 'science', null] }, selectedObject: { type: 'string', nullable: true, maxLength: 80 } }, ['page'])],
    ['/api/robot/commands', 'post', 'Navigate a connected browser (optional bridge credential)', 202, object({ action: { type: 'string', enum: ['navigate_to'] }, destination: { type: 'string', enum: ['world', 'mathematics', 'science'] } }, ['action', 'destination']), 'optional-bridge'],
    ['/api/robot/commands/stream', 'get', 'Browser navigation SSE', 200, undefined, 'sse'],
    ['/api/robot/status', 'get', 'Robot connection and control status', 200],
    ['/api/robot/motion', 'post', 'Bounded robot motion intent', 202, object({ action: { type: 'string', enum: ['forward', 'backward', 'left', 'right', 'stop'] }, controllerId: { type: 'string', minLength: 8, maxLength: 80 }, sequence: { type: 'integer', minimum: 1 } }, ['action', 'controllerId', 'sequence']), 'control'],
    ['/api/robot/motion/stream', 'get', 'Robot motion SSE', 200, undefined, 'bridge'],
    ['/api/challenges/events', 'post', 'Accept a legacy challenge event (not persisted)', 202, object({ challenge: string, type: string, payload: { type: 'object', additionalProperties: true } }, ['challenge', 'type'])],
  ]
  for (const [path, method, summary, status, schema, kind] of routes) {
    const operation: OperationObject = {
      summary, tags: ['legacy'],
      description: 'Temporary Express compatibility adapter. See the backend migration runbook before replacing this route.',
      responses: { [status]: { description: status === 202 ? 'Accepted' : 'OK' }, '400': { description: 'Invalid payload' } },
    }
    if (schema) operation.requestBody = { required: true, content: { 'application/json': { schema } } }
    if (kind === 'sse' || kind === 'bridge') operation.responses['200'] = { description: 'SSE stream; events and heartbeat preserved', content: { 'text/event-stream': { schema: string } } }
    if (kind === 'mjpeg') operation.responses['200'] = { description: 'Upstream MJPEG stream', content: { 'multipart/x-mixed-replace': { schema: { type: 'string', format: 'binary' } } } }
    if (kind === 'optional-bridge' || kind === 'bridge') operation.security = kind === 'optional-bridge' ? [{ BridgeToken: [] }, {}] : [{ BridgeToken: [] }]
    if (kind === 'control') operation.security = [{ ControlToken: [] }]
    if (kind?.includes('bridge') || kind === 'control') {
      operation.responses['401'] = { description: 'Invalid credential' }
      operation.responses['503'] = { description: 'Required bridge/control credential is not configured' }
      operation.description += ' Shared-secret authentication is deprecated; DeviceSession grants will replace it in a later phase. No removal date is set.'
    }
    if (path.includes('/commands') || path === '/api/robot/motion') operation.responses['409'] = { description: 'No eligible connected recipient' }
    if (path === '/api/robot/motion') operation.responses['423'] = { description: 'Lease held by another controller' }
    if (config.authMode === 'clerk') {
      const access = routeAccess[`${method.toUpperCase()} ${path}`]
      operation.security = access === 'public' ? [] : [{ [access === 'user' ? 'bearer' : access === 'bridge' ? 'BridgeToken' : 'ControlToken']: [] }]
      operation.description = `Clerk mode. Access: ${access}. Shared robot/vision state remains restricted to bridge or operator credentials until DeviceSession. No Clerk token is sent to a robot.`
      if (access !== 'public') {
        operation.responses['401'] = { description: 'Missing, invalid or revoked credential' }
        operation.responses['503'] = { description: 'Identity provider or required credential unavailable' }
      }
    }
    document.paths[path] = { ...document.paths[path], [method]: operation }
  }
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of ['get', 'post'] as const) {
      const operation = item[method]
      const access = routeAccess[`${method.toUpperCase()} ${path}`]
      if (!operation || !access || path === '/api/health') continue
      const landmarks = path === '/api/vision/hand-landmarks'
      const legacy = config.authMode === 'legacy' && access !== 'public' && path !== '/api/identity/me'
      const limit = landmarks ? config.rateLimits.landmarks : access === 'public' ? config.rateLimits.anonymous : legacy ? config.rateLimits.legacy : access === 'user' ? config.rateLimits.user : config.rateLimits.machine
      operation.responses['429'] = {
        description: 'Actor and canonical route quota exceeded. Anonymous failures/unknown routes do not consume authenticated quotas.',
        headers: { 'Retry-After': { description: 'Seconds until retry', schema: { type: 'integer', minimum: 1 } } },
      }
      Object.assign(operation, { 'x-rate-limit': {
        windowSeconds: 60, limit, validCorsPreflightExempt: true, anonymousFailureLimit: config.rateLimits.anonymous,
        actor: access === 'public' || legacy ? 'socket IP + canonical route' : access === 'user' ? 'verified provider/issuer/subject + canonical route' : `${access} credential + canonical route`,
        ...(legacy && (access === 'operator' || access === 'bridge') ? { validCredentialLimit: landmarks ? config.rateLimits.landmarks : config.rateLimits.machine } : {}),
      } })
    }
  }
  return document
}
