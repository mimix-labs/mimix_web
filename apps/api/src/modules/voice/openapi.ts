import { z } from 'zod'
import { voiceRequestSchema, voiceResultSchema } from '@mimix/voice-contract'
import type { OpenAPIObject, SchemaObject } from '@nestjs/swagger'
import type { ApiConfig } from '../../config/environment.js'
export function addVoicePaths(document: OpenAPIObject, config: Pick<ApiConfig, 'authMode'>): OpenAPIObject {
  for (const path of Object.keys(document.paths)) if (path.startsWith('/api/voice/')) delete document.paths[path]
  if (config.authMode !== 'clerk') return document
  const schema = (value: z.ZodType) => z.toJSONSchema(value, { io: 'input', target: 'openapi-3.0', unrepresentable: 'any' }) as SchemaObject
  const errors = { '400': { description: 'Invalid request' }, '401': { description: 'Invalid or revoked session' }, '413': { description: 'Body exceeds 16 KiB' }, '429': { description: 'HTTP user quota exceeded' } }
  document.paths['/api/voice/utterances'] = { post: {
    tags: ['voice'], summary: 'Synthesize bounded speech or return text-only fallback', security: [{ bearer: [] }],
    description: 'No-store. Requires Clerk. New admitted utterance interrupts the same user. Subtitle is untimed original text. Audio is bounded base64 MP3, buffered before response. Provider failures and generation quotas return text_only. An active robot lease or a lease change during synthesis returns text_only with EMBODIMENT_MUTED. No automatic retries; repeated completed IDs may incur charges. Clients must stop prior playback and ignore stale results.',
    requestBody: { required: true, content: { 'application/json': { schema: schema(voiceRequestSchema) } } },
    responses: { ...errors, '200': { description: 'Voice result', content: { 'application/json': { schema: schema(voiceResultSchema) } } } },
  } }
  document.paths['/api/voice/utterances/{id}'] = { delete: {
    tags: ['voice'], summary: 'Cancel the authenticated user’s active utterance', security: [{ bearer: [] }],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
    responses: { ...errors, '200': { description: 'Whether an owned active utterance was cancelled', content: { 'application/json': { schema: { type: 'object', properties: { cancelled: { type: 'boolean' } }, required: ['cancelled'] } } } } },
  } }
  return document
}
