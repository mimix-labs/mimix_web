import { z } from 'zod'

export const ROBOT_PROTOCOL_VERSION = 1 as const
const deviceId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._-]+$/)
const timestamp = z.number().int().nonnegative()
const uuid = z.uuid()
const base = { schemaVersion: z.literal(ROBOT_PROTOCOL_VERSION), deviceId }
export const behaviorSchema = z.enum(['greet', 'celebrate', 'attend', 'stop'])
const unique = <T>(values: T[]) => new Set(values).size === values.length
export const robotCapabilitiesSchema = z.strictObject({
  ...base,
  behaviors: z.array(behaviorSchema).max(4).refine(unique, 'Duplicate behavior'),
  camera: z.array(z.enum(['mjpeg', 'webrtc'])).max(2).refine(unique, 'Duplicate transport'),
  handLandmarks: z.boolean(), speech: z.boolean(),
})
/** Receiver-clock observation. Not an authenticated heartbeat or an embodiment lease. */
export const robotPresenceSchema = z.strictObject({
  ...base, connectionId: uuid, sequence: z.number().int().positive(),
  state: z.enum(['online', 'offline', 'degraded']),
  observedAt: timestamp, expiresAt: timestamp,
}).refine(value => value.expiresAt > value.observedAt && value.expiresAt - value.observedAt <= 60000, 'Presence TTL must be 1–60000 ms')
export const robotCameraSchema = z.union([
  z.strictObject({ ...base, state: z.literal('unavailable') }),
  z.strictObject({ ...base, state: z.literal('available'), transport: z.literal('mjpeg'), streamPath: z.literal('/api/vision/video') }),
  z.strictObject({ ...base, state: z.literal('available'), transport: z.literal('webrtc'), trackId: z.string().min(1).max(128) }),
])
/** Parsing is NOT authorization. Backend must check ownership, lease, TTL and capability. */
export const behaviorIntentSchema = z.strictObject({
  ...base, intentId: uuid, conversationId: uuid, leaseId: uuid,
  behavior: behaviorSchema, issuedAt: timestamp, expiresAt: timestamp,
}).refine(value => value.expiresAt > value.issuedAt && value.expiresAt - value.issuedAt <= 10000, 'Intent TTL must be 1–10000 ms')
export type RobotCapabilities = z.infer<typeof robotCapabilitiesSchema>
export type RobotPresence = z.infer<typeof robotPresenceSchema>
export type RobotCamera = z.infer<typeof robotCameraSchema>
export type BehaviorIntent = z.infer<typeof behaviorIntentSchema>
