import { z } from 'zod'
import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger'
import { offlineAttemptSchema, offlineAppendSchema, syncBindSchema, syncBatchSchema } from '@mimix/contracts'
import type { ApiConfig } from '../../config/environment.js'
export function addSyncPaths(document: OpenAPIObject, config: Pick<ApiConfig, 'sync'>): void {
  for (const path of Object.keys(document.paths)) if (path.startsWith('/api/offline/') || path.startsWith('/api/sync/')) delete document.paths[path]
  document.components ??= {}; document.components.securitySchemes ??= {}
  document.components.securitySchemes.LocalToken = { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Local <opaque capability>; held only by the trusted host.' }
  document.components.securitySchemes.SyncToken = { type: 'apiKey', in: 'header', name: 'X-Mimix-Sync-Token', description: 'Ephemeral Clerk bearer for the configured cloud origin.' }
  const routes: [string, 'get' | 'post', z.ZodType | undefined, OperationObject['security']][] = []
  if (config.sync.offlineEnabled) routes.push(
    ['/api/offline/sessions', 'post', z.strictObject({}), []],
    ['/api/offline/attempts', 'post', offlineAttemptSchema, [{ LocalToken: [] }]],
    ['/api/offline/events', 'post', offlineAppendSchema, [{ LocalToken: [] }]],
    ['/api/offline/status', 'get', undefined, [{ LocalToken: [] }]],
    ...(['bind', 'sync'] as const).map(action => [`/api/offline/${action}`, 'post', z.strictObject({}), [{ LocalToken: [], SyncToken: [] }]] as typeof routes[number]),
  )
  if (config.sync.cloudEnabled) routes.push(['/api/sync/bind', 'post', syncBindSchema, [{ bearer: [] }]], ['/api/sync/batch', 'post', syncBatchSchema, [{ bearer: [] }]])
  for (const [path, method, schema, security] of routes) {
    const operation: OperationObject = { tags: ['sync'], security,
      description: 'Strict idempotent events. Bind seals the local session permanently; subsequent play uses a new session. Sync sends at most 50 events in one transaction. Only verified cloud receipts acknowledge pending events. Local clock is never ordering or retention authority. See docs/architecture/offline-sync.md.',
      responses: { '200': { description: 'Exact retry, status, immutable binding or committed receipt' }, '201': { description: 'Local session, attempt or event persisted' }, '400': { description: 'Invalid contract' }, '401': { description: 'Invalid local capability or missing/revoked Clerk login' }, '404': { description: 'Disabled or not owned' }, '409': { description: 'Owner, content, order, receipt or sealed-session conflict' }, '429': { description: 'Retry later' }, '503': { description: 'Explicit pending or storage_unavailable state; no acknowledgement' }, '507': { description: 'Storage full; pending events preserved' } } }
    if (schema) operation.requestBody = { required: true, content: { 'application/json': { schema: z.toJSONSchema(schema, { io: 'input', target: 'openapi-3.0', unrepresentable: 'any' }) as SchemaObject } } }
    document.paths[path] = { [method]: operation }
  }
}
