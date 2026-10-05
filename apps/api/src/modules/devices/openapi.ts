import { z } from 'zod'
import { devicePairingRequestSchema, deviceExchangeRequestSchema, deviceHeartbeatSchema, deviceAuthorizationSchema, deviceSessionSchema } from '@mimix/robot-protocol'
import type { OpenAPIObject, SchemaObject, OperationObject } from '@nestjs/swagger'
import type { ApiConfig } from '../../config/environment.js'
export function addDevicePaths(document: OpenAPIObject, config: Pick<ApiConfig, 'deviceSessionsEnabled'>): OpenAPIObject {
  for (const path of Object.keys(document.paths)) if (path.startsWith('/api/devices/')) delete document.paths[path]
  if (!config.deviceSessionsEnabled) return document
  document.components ??= {}
  document.components.securitySchemes ??= {}
  document.components.securitySchemes.DeviceToken = { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Device <opaque token>. Never a user JWT, bridge token or control token.' }
  const schema = (value: z.ZodType) => z.toJSONSchema(value, { io: 'input', target: 'openapi-3.0', unrepresentable: 'any' }) as SchemaObject
  const response = (description: string, value?: z.ZodType) => ({ description, ...(value ? { content: { 'application/json': { schema: schema(value) } } } : {}) })
  const session = deviceSessionSchema
  const page = z.object({ items: z.array(session), nextCursor: z.string().nullable() })
  const routes: Array<[string, 'get' | 'post' | 'delete', 'user' | 'device' | 'public', string, z.ZodType | undefined, z.ZodType | undefined, number]> = [
    ['pairings', 'post', 'user', 'Approve a trusted robot challenge and capabilities; code lives five minutes', devicePairingRequestSchema, z.object({ schemaVersion: z.literal(1), id: z.uuid(), code: z.string(), createdAt: z.number(), expiresAt: z.number() }), 201],
    ['pairings/{id}', 'delete', 'user', 'Cancel an owned pending pairing', undefined, z.object({ cancelled: z.boolean() }), 200],
    ['exchange', 'post', 'public', 'Consume code and verifier once; return a 15-minute device token', deviceExchangeRequestSchema, z.object({ token: z.string(), session }), 201],
    ['sessions', 'get', 'user', 'List owned sessions, 50 per page', undefined, page, 200],
    ['sessions/{id}', 'get', 'user', 'Inspect an owned session', undefined, session, 200],
    ['sessions/{id}', 'delete', 'user', 'Revoke an owned session, including from a new owner login', undefined, session, 200],
    ['sessions/{id}/authorize', 'post', 'user', 'Check owner, originating login, capability and live presence; observation only, no dispatch permit', deviceAuthorizationSchema, z.object({ authorized: z.literal(true), sessionId: z.uuid(), deviceId: z.uuid(), capability: z.string(), expiresAt: z.number() }), 200],
    ['self', 'get', 'device', 'Inspect authenticated device session and next sequence', undefined, session, 200],
    ['heartbeat', 'post', 'device', 'Accept the exact next sequence and refresh presence for at most 30 seconds', deviceHeartbeatSchema, session, 200],
    ['disconnect', 'post', 'device', 'Accept the exact next sequence and terminate the session', deviceHeartbeatSchema, session, 200],
    ['audit', 'get', 'user', 'Read owned append-only audit events, 50 per page', undefined, z.object({ items: z.array(z.object({ id: z.number(), pairingId: z.uuid().nullable(), sessionId: z.uuid().nullable(), event: z.string(), reason: z.string(), sequence: z.number().nullable(), observedAt: z.number() })), nextCursor: z.string().nullable() }), 200],
  ]
  for (const [path, method, access, summary, input, output, status] of routes) {
    const operation: OperationObject = { tags: ['devices'], summary, security: access === 'public' ? [] : [{ [access === 'user' ? 'bearer' : 'DeviceToken']: [] }],
      description: 'Opt-in with Clerk and PostgreSQL. All responses no-store. Re-pair after expiry, disconnect or lost exchange response. User credentials never reach the robot. Remote identity outages fail closed. Heartbeats never extend absolute lifetime.',
      responses: { [status]: response('Success', output), '400': response('Invalid input'), '401': response('Invalid, expired or revoked credential'), '403': response('Scope or origin denied'), '404': response('Not found'), '409': response('Sequence conflict; inspect self, never reset sequence'), '413': response('Body exceeds 16 KiB'), '429': response('Rate or session limit'), '503': response('Identity or storage unavailable') },
    }
    if (input) operation.requestBody = { required: true, content: { 'application/json': { schema: schema(input) } } }
    if (path.includes('{id}')) operation.parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }]
    if (path === 'audit' || path === 'sessions') operation.parameters = [{ name: 'after', in: 'query', schema: { type: 'string' }, description: 'Use the previous nextCursor; omit for first page.' }]
    document.paths[`/api/devices/${path}`] ??= {}
    document.paths[`/api/devices/${path}`][method] = operation
  }
  return document
}
