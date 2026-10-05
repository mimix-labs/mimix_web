import { z } from 'zod'
import { robotControlRequestSchema, robotLeaseRequestSchema, robotLeaseHeartbeatSchema, robotControlSessionSchema, robotCommandViewSchema } from '@mimix/robot-protocol'
import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger'
import type { ApiConfig } from '../../config/environment.js'
export function addRobotControlPaths(document: OpenAPIObject, config: Pick<ApiConfig, 'robot'>): OpenAPIObject {
  for (const path of Object.keys(document.paths)) if (path.startsWith('/api/robot-control/')) delete document.paths[path]
  if (config.robot.transport !== 'mqtt') return document
  delete document.paths['/api/robot/motion']
  delete document.paths['/api/robot/motion/stream']
  const schema = (value: z.ZodType) => z.toJSONSchema(value, { io: 'input', target: 'openapi-3.0', unrepresentable: 'any' }) as SchemaObject
  const routes: Array<[string, 'post' | 'get' | 'delete', string, z.ZodType | undefined, z.ZodType | undefined]> = [
    ['leases', 'post', 'Acquire the shared embodiment lease for an authorized DeviceSession', robotLeaseRequestSchema, robotControlSessionSchema],
    ['leases/{id}', 'get', 'Read owned control lease', undefined, robotControlSessionSchema],
    ['leases/{id}', 'delete', 'Release owned lease and request stop', undefined, robotControlSessionSchema],
    ['leases/{id}/heartbeat', 'post', 'Renew lease from the original owner login', robotLeaseHeartbeatSchema, robotControlSessionSchema],
    ['intents', 'post', 'Dispatch an idempotent permitted semantic intention', robotControlRequestSchema, robotCommandViewSchema],
    ['intents/{id}', 'get', 'Read intention delivery outcome', undefined, robotCommandViewSchema],
    ['audit', 'get', 'Page append-only owned audit', undefined, undefined],
  ]
  for (const [path, method, summary, input, output] of routes) {
    const status = path === 'intents' ? '202' : path === 'leases' ? '201' : '200'
    const operation: OperationObject = { tags: ['robot-control'], summary, security: [{ bearer: [] }],
      description: 'No-store. MQTT credentials stay on backend/gateway. TTL <= 2000ms. ACK means semantic handoff, not physical completion. Unknown delivery must never be retried with a new ID automatically. Owner/login, live DeviceSession, presence, capability and lease are checked on dispatch. Legacy motion routes are disabled while MQTT is enabled.',
      responses: { [status]: { description: 'Current state', ...(output ? { content: { 'application/json': { schema: schema(output) } } } : {}) },
        '400': { description: 'Invalid request' }, '401': { description: 'Invalid or expired identity' }, '403': { description: 'Login or capability denied' }, '404': { description: 'Not found' }, '409': { description: 'Lease, presence or idempotency conflict' }, '429': { description: 'Rate limited' }, '503': { description: 'Control unavailable' } } }
    if (input) operation.requestBody = { required: true, content: { 'application/json': { schema: schema(input) } } }
    if (path.includes('{id}')) operation.parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }]
    if (path === 'audit') operation.parameters = [{ name: 'after', in: 'query', schema: { type: 'string', pattern: '^[0-9]{1,16}$' } }]
    document.paths[`/api/robot-control/${path}`] ??= {}; document.paths[`/api/robot-control/${path}`][method] = operation
  }
  return document
}
