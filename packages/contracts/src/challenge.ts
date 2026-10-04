import { z } from 'zod'

const text = (max: number) => z.string().min(1).max(max).refine(value => value.trim().length > 0, 'Must contain text')
const reference = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/)
// SemVer without build metadata: learning references do not accept '+'.
const version = z.string().max(80).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/)
export const capabilitySchema = z.enum(['agent', 'progress', 'embodiment', 'camera', 'hand-tracking'])
export type Capability = z.infer<typeof capabilitySchema>
const capabilities = z.strictObject({
  required: z.array(capabilitySchema).max(5),
  optional: z.array(capabilitySchema).max(5),
}).refine(value => {
  const all = [...value.required, ...value.optional]
  return new Set(all).size === all.length
}, 'Capabilities must be unique across required and optional')

export const challengeManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  apiVersion: z.literal(1),
  id: reference,
  version,
  title: text(120),
  description: text(2000),
  entrypoint: z.string().max(240).regex(/^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.js$/),
  objectives: z.array(z.strictObject({ id: reference, description: text(500) })).min(1).max(50)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Objective IDs must be unique'),
  completion: z.strictObject({ description: text(1000) }),
  capabilities,
})
export type ChallengeManifest = z.infer<typeof challengeManifestSchema>

export const speakInputSchema = z.strictObject({ text: text(2000) })
export type SpeakInput = z.infer<typeof speakInputSchema>
export const behaviorIntentSchema = z.strictObject({ intent: z.enum(['celebrate', 'encourage', 'acknowledge']) })
export type BehaviorIntent = z.infer<typeof behaviorIntentSchema>
export const challengeErrorSchema = z.strictObject({
  code: z.enum(['INVALID_MANIFEST', 'UNSUPPORTED_VERSION', 'INVALID_INPUT', 'CAPABILITY_DENIED',
    'CAPABILITY_UNAVAILABLE', 'INVALID_LIFECYCLE', 'ABORTED', 'HOST_UNAVAILABLE']),
  message: text(500),
})
export type ChallengeError = z.infer<typeof challengeErrorSchema>
