import { z } from 'zod'

/** Profile name, not a field inserted into existing Python payloads. */
export const LEGACY_PROFILE = 'mimix-http-sse/legacy' as const
const timestamp = z.number().int().nonnegative()
export const legacyDestinationSchema = z.enum(['world', 'mathematics', 'science'])
export const legacyContextSchema = z.looseObject({
  page: z.enum(['world', 'challenge']),
  challenge: z.enum(['mathematics', 'science']).nullable(),
  selectedObject: z.string().max(80).nullable(),
  updatedAt: timestamp,
})
export const legacyNavigationSchema = z.looseObject({
  action: z.literal('navigate_to'), destination: legacyDestinationSchema,
})
export const legacyNavigationEventSchema = legacyNavigationSchema.extend({ id: z.string().min(1), issuedAt: timestamp })
export const legacyMotionSchema = z.looseObject({
  id: z.string().min(1),
  action: z.enum(['forward', 'backward', 'left', 'right', 'stop']),
  maxDurationMs: z.number().int().min(100).max(500),
  expiresAt: timestamp,
  // Python does not inspect issuedAt. Preserve it as an extension if present.
})
export type LegacyMotion = z.infer<typeof legacyMotionSchema>
export function parseLegacyMotion(value: unknown, now: number): LegacyMotion {
  const motion = legacyMotionSchema.parse(value)
  if (!Number.isFinite(now) || motion.expiresAt < now) throw new Error('Expired robot motion')
  return motion
}
const point = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
/** Producer shape, intentionally narrower than the legacy server's array-only check. */
export const legacyHandFrameSchema = z.looseObject({
  landmarks: z.array(z.array(point).length(21)).max(2),
  handedness: z.array(z.array(z.object({ categoryName: z.enum(['Left', 'Right']), score: z.number().min(0).max(1) })).length(1)).max(2),
  timestamp,
  source: z.literal('jetson-native'),
}).refine(frame => frame.landmarks.length === frame.handedness.length, 'Each hand needs handedness')
export type LegacyHandFrame = z.infer<typeof legacyHandFrameSchema>
