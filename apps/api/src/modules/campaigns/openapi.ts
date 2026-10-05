import { z } from 'zod'
import { campaignDefinitionSchema, campaignStartSchema } from '@mimix/contracts'
import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger'
import type { ApiConfig } from '../../config/environment.js'
const text: SchemaObject = { type: 'string' }, count: SchemaObject = { type: 'integer', minimum: 0 }
const uuid: SchemaObject = { type: 'string', format: 'uuid' }
const object = (properties: Record<string, SchemaObject>, required = Object.keys(properties)): SchemaObject => ({ type: 'object', additionalProperties: false, properties, required })
const progress = object({
  campaignId: text, campaignVersion: text, status: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] }, completedNodes: count, totalNodes: count,
  nodes: { type: 'array', items: object({ id: text, status: { type: 'string', enum: ['locked', 'available', 'in_progress', 'completed'] }, canStart: { type: 'boolean' }, blockedBy: { type: 'array', items: text }, attempts: count, completedAttempts: count, activeAttemptId: { ...uuid, nullable: true } }) },
})
const creation = object({ duplicate: { type: 'boolean' }, attempt: object({ id: uuid, userId: uuid, idempotencyKey: uuid, challengeId: text, challengeVersion: text, createdAt: { type: 'string', format: 'date-time' } }) })
const page = object({ items: { type: 'array', maxItems: 50, items: object({ id: text, version: text, title: text }) }, nextCursor: { ...object({ afterId: text, afterVersion: text }), nullable: true } })
const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', target: 'openapi-3.0', unrepresentable: 'any' }) as SchemaObject
export function addCampaignPaths(document: OpenAPIObject, config: Pick<ApiConfig, 'dataStore' | 'rateLimits'>): OpenAPIObject {
  for (const path of Object.keys(document.paths)) if (path.startsWith('/api/campaigns')) delete document.paths[path]
  if (config.dataStore !== 'postgres') return document
  const base = '/api/campaigns/{id}/versions/{version}'
  const routes: Array<[string, 'get' | 'post', string, SchemaObject]> = [
    ['/api/campaigns', 'get', 'List immutable campaign versions', page],
    [base, 'get', 'Read an exact immutable campaign version', jsonSchema(campaignDefinitionSchema)],
    [base + '/progress', 'get', 'Derive own campaign progress from learning events', progress],
    [base + '/nodes/{nodeId}/attempts', 'post', 'Start or retry an unlocked campaign node', creation],
  ]
  for (const [path, method, summary, schema] of routes) {
    const operation: OperationObject & Record<string, unknown> = { summary, tags: ['campaigns'], security: [{ bearer: [] }],
      description: 'Active Clerk session; internal owner only; no-store. Exact immutable versions, no latest alias or automatic transfer of credit. All prerequisites require a completed node in this campaign version. All nodes are required. Completion is client-reported, not certified mastery. One active attempt per owner/node/version; unlimited retries after completion or abandonment. Earlier completion remains valid during retries. Progress is derived from bound learning events, never editable. Append through /api/learning/attempts/{id}/events. Exact start retries return 200 even after termination; keys cannot cross standalone/campaign/node/version contexts. Unknown query fields are rejected.',
      responses: {
        '200': { description: method === 'post' ? 'Exact retry, duplicate=true' : 'Current catalog or own derived progress', content: { 'application/json': { schema } } },
        '400': { description: 'Strict contract or paired cursor validation failed' }, '401': { description: 'Invalid or revoked session' },
        '404': { description: 'Unknown version/node or feature disabled' }, '409': { description: 'Prerequisites unmet, active attempt, or idempotency context conflict' },
        '429': { description: 'User route-template quota exceeded', headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds to wait' } } },
        '503': { description: 'Identity or campaign storage unavailable' },
      },
      'x-rate-limit': { limit: config.rateLimits.user, windowSeconds: 60, actor: 'verified provider/issuer/subject and route template', validCorsPreflightExempt: true },
    }
    operation.parameters = ['id', 'version', 'nodeId'].filter(name => path.includes(`{${name}}`)).map(name => ({ name, in: 'path', required: true, description: name === 'version' ? 'Exact SemVer without build metadata' : 'Case-sensitive catalog identifier', schema: text }))
    if (path === '/api/campaigns') operation.parameters = ['afterId', 'afterVersion'].map(name => ({ name, in: 'query', required: false, description: 'Supply both fields from nextCursor. 50 summaries per page, lexicographic database order by id then version (not SemVer precedence).', schema: text }))
    if (method === 'post') {
      operation.responses['201'] = { description: 'Attempt, initial event and immutable campaign binding committed atomically; duplicate=false', content: { 'application/json': { schema } } }
      operation.requestBody = { required: true, content: { 'application/json': { schema: jsonSchema(campaignStartSchema) } } }
    }
    document.paths[path] = { [method]: operation }
  }
  return document
}
