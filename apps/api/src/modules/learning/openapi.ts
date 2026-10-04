import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger'
import { z } from 'zod'
import type { ApiConfig } from '../../config/environment.js'
import { createInput, eventInput } from './contract.js'
export function addLearningPaths(document: OpenAPIObject, config: Pick<ApiConfig, 'dataStore' | 'rateLimits'>): OpenAPIObject {
  // Native controller exists for flag transitions but disabled routes are not advertised.
  for (const path of Object.keys(document.paths)) if (path.startsWith('/api/learning/')) delete document.paths[path]
  if (config.dataStore !== 'postgres') return document
  const routes = [
    ['/api/learning/attempts', 'post', 'Start an owned attempt', createInput],
    ['/api/learning/attempts/{id}/events', 'post', 'Append an ordered learning fact', eventInput],
    ['/api/learning/attempts/{id}', 'get', 'Read owned attempt and progress'],
    ['/api/learning/progress', 'get', 'Page through owned attempt progress'],
  ] as const
  for (const [path, method, summary, schema] of routes) {
    const operation: OperationObject & Record<string, unknown> = { summary, tags: ['learning'], security: [{ bearer: [] }],
      description: 'Requires active Clerk session and internal owner. No-store. Learning facts are client-reported; they do not grant achievements. Events use schemaVersion 1. Sequence 1 is server-generated; later events must be contiguous. Exact retries return the original object with duplicate=true, including retries after completion.',
      responses: { '200': { description: method === 'post' ? 'Exact retry; original attempt/event and duplicate=true' : 'Owned attempt/progress or page {items,nextCursor}' },
        '400': { description: 'Strict contract validation failed' }, '401': { description: 'Missing, invalid or revoked session' }, '404': { description: 'Unknown or unowned attempt' }, '409': { description: 'Conflicting idempotency key, sequence or closed attempt' }, '429': { description: 'Per-user route-template quota exceeded', headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds to wait' } } }, '503': { description: 'Identity or learning storage unavailable' } },
      'x-rate-limit': { limit: config.rateLimits.user, windowSeconds: 60, actor: 'verified provider/issuer/subject and route template', validCorsPreflightExempt: true },
    }
    if (schema) {
      operation.responses['201'] = { description: 'Atomically persisted attempt/event and projection; duplicate=false' }
      const json = z.toJSONSchema(schema, { io: 'input', target: 'openapi-3.0', unrepresentable: 'any' })
      operation.requestBody = { required: true, content: { 'application/json': { schema: json as SchemaObject } } }
    }
    if (path.includes('{id}')) operation.parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }]
    if (path.endsWith('/progress')) operation.parameters = [{ name: 'after', in: 'query', required: false, description: 'Exclusive UUID cursor from nextCursor. Page size 50, sorted by attempt UUID.', schema: { type: 'string', format: 'uuid' } }]
    document.paths[path] = { ...document.paths[path], [method]: operation }
  }
  return document
}
