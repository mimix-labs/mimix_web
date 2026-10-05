import { z } from 'zod'

const text = (max: number) => z.string().min(1).max(max).refine(value => value.trim().length > 0)
const reference = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/)
/** Presentation data only. Asset/animation IDs are resolved by a trusted renderer. */
export const characterProfileSchema = z.strictObject({
  schemaVersion: z.literal(1), id: reference,
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/).max(80),
  displayName: text(80),
  persona: z.strictObject({ description: text(500), tone: z.enum(['warm', 'calm', 'playful']), locale: z.enum(['es', 'en']) }),
  appearance: z.strictObject({
    assetId: reference,
    animations: z.strictObject({ idle: reference, encourage: reference, celebrate: reference }),
  }),
})
export type CharacterProfile = z.infer<typeof characterProfileSchema>
