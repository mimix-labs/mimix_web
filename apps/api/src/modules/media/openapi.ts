import { z } from 'zod'
import { mediaRequestSchema, mediaTokenRequestSchema, mediaSessionSchema } from '@mimix/media-contract'
import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger'
import type { ApiConfig } from '../../config/environment.js'
export function addMediaPaths(document: OpenAPIObject, config: Pick<ApiConfig, 'media'>): OpenAPIObject {
  for (const path of Object.keys(document.paths)) if (path.startsWith('/api/media/')) delete document.paths[path]
  if (config.media.provider === 'disabled') return document
  const schema = (value: z.ZodType) => z.toJSONSchema(value, { io: 'input', target: 'openapi-3.0', unrepresentable: 'any' }) as SchemaObject
  const routes: Array<[string, 'get' | 'post' | 'delete', string, z.ZodType | undefined]> = [
    ['sessions', 'post', 'Create one owned room with explicitly approved camera, microphone and speaker tracks', mediaRequestSchema],
    ['sessions', 'get', 'List owned media sessions', undefined],
    ['sessions/{id}', 'get', 'Read live lease and terminal state', undefined],
    ['sessions/{id}', 'delete', 'Close an owned room, including from a new owner login', undefined],
    ['sessions/{id}/user-token', 'post', 'Issue short admission credentials to the originating user login', mediaTokenRequestSchema],
    ['sessions/{id}/device-token', 'post', 'Issue short admission credentials to the paired device', mediaTokenRequestSchema],
    ['sessions/{id}/disconnect', 'post', 'Report robot disconnect and close the room', mediaTokenRequestSchema],
  ]
  for (const [path, method, summary, input] of routes) {
    const operation: OperationObject = { tags: ['media'], summary,
      security: [{ [path.endsWith('/device-token') || path.endsWith('/disconnect') ? 'DeviceToken' : 'bearer']: [] }],
      description: 'Opt-in with Clerk, PostgreSQL and DeviceSessions. No-store. Tokens authorize only server-selected room, identity and track sources. Ready responses include session and connection credentials; provider failures return status=degraded without credentials. Clients must stop capture/playback at leaseExpiresAt or disconnect. Token expiry only limits admission; active-room cleanup is separate. Self-hosted LiveKit revocation is best-effort.',
      responses: { '200': { description: 'Session, page, ready credentials, or degraded provider status' }, '201': { description: 'New ready media session' }, '202': { description: 'Closing; remote cleanup pending' }, '400': { description: 'Invalid input' }, '401': { description: 'Expired or invalid credential/lease' }, '403': { description: 'Origin, login or capability denied' }, '404': { description: 'Not found' }, '409': { description: 'Device already has an open media session' }, '429': { description: 'Rate limited' }, '503': { description: 'Identity or storage unavailable' } },
    }
    if (input) operation.requestBody = { required: true, content: { 'application/json': { schema: schema(input) } } }
    if (path.includes('{id}')) operation.parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }]
    if (path === 'sessions' && method === 'get') operation.parameters = [{ name: 'after', in: 'query', schema: { type: 'string', format: 'uuid' } }]
    if (path === 'sessions/{id}') operation.responses['200'] = { description: 'Media session', content: { 'application/json': { schema: schema(mediaSessionSchema) } } }
    document.paths[`/api/media/${path}`] ??= {}
    document.paths[`/api/media/${path}`][method] = operation
  }
  return document
}
