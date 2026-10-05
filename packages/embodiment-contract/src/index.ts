import { z } from 'zod'

export const embodimentIdSchema = z.uuid().transform(value => value.toLowerCase())
export const embodimentKindSchema = z.enum(['web', 'robot'])
export const embodimentLeaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  conversationId: embodimentIdSchema,
  leaseId: embodimentIdSchema,
  holderId: embodimentIdSchema,
  kind: embodimentKindSchema,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  expiresAt: z.number().finite().nonnegative(),
})
export const embodimentStateSchema = z.discriminatedUnion('phase', [
  z.strictObject({ schemaVersion: z.literal(1), phase: z.literal('virtual'), lease: embodimentLeaseSchema.extend({ kind: z.literal('web') }), webMuted: z.literal(false) }),
  z.strictObject({ schemaVersion: z.literal(1), phase: z.literal('robot'), lease: embodimentLeaseSchema.extend({ kind: z.literal('robot') }), webMuted: z.literal(true) }),
  z.strictObject({ schemaVersion: z.literal(1), phase: z.literal('closed'), lease: z.null(), webMuted: z.literal(true) }),
])
export type EmbodimentKind = z.infer<typeof embodimentKindSchema>
export type EmbodimentLease = z.infer<typeof embodimentLeaseSchema>
export type EmbodimentState = z.infer<typeof embodimentStateSchema>
/** Process-local permission, never a serialized device credential. */
export interface EmbodimentPermit {
  readonly leaseId: string
  readonly signal: AbortSignal
  isCurrent(): boolean
}
/** A real output adapter must stop synchronously when its permission is aborted. */
export interface EmbodimentOutput { stop(): void }
