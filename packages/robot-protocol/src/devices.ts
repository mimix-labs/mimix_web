import { z } from 'zod'
import { robotCapabilitiesSchema, robotPresenceSchema, type RobotCapabilities } from './v1.js'

export const deviceCapabilitySchema = z.enum([
  'presence:heartbeat', 'context:read', 'vision:publish', 'speech:play',
  'camera:mjpeg', 'camera:webrtc', 'microphone:publish', 'speaker:subscribe', 'behavior:greet', 'behavior:celebrate', 'behavior:attend', 'behavior:stop',
])
export type DeviceCapability = z.infer<typeof deviceCapabilitySchema>
export const deviceCapabilitiesSchema = z.array(deviceCapabilitySchema).min(1).max(12)
  .refine(values => new Set(values).size === values.length && values.includes('presence:heartbeat'), 'Unique capabilities including heartbeat are required')
export const devicePairingRequestSchema = z.strictObject({
  schemaVersion: z.literal(1), challenge: z.string().regex(/^[a-f0-9]{64}$/), capabilities: deviceCapabilitiesSchema,
})
export const deviceExchangeRequestSchema = z.strictObject({
  schemaVersion: z.literal(1), pairingId: z.uuid(), code: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/), capabilities: robotCapabilitiesSchema,
})
export const deviceHeartbeatSchema = z.strictObject({ schemaVersion: z.literal(1), sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1) })
export const deviceAuthorizationSchema = z.strictObject({ schemaVersion: z.literal(1), capability: deviceCapabilitySchema })
export const deviceSessionSchema = z.strictObject({
  schemaVersion: z.literal(1), id: z.uuid(), deviceId: z.uuid(), capabilities: deviceCapabilitiesSchema,
  status: z.enum(['active', 'revoked', 'expired', 'disconnected']),
  createdAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(),
  nextSequence: z.number().int().positive(), presence: robotPresenceSchema.nullable(),
})
export type DeviceSession = z.infer<typeof deviceSessionSchema>
export function supportedDeviceCapabilities(value: RobotCapabilities): DeviceCapability[] {
  const offered = robotCapabilitiesSchema.parse(value)
  return ['presence:heartbeat', 'context:read', ...(offered.handLandmarks ? ['vision:publish' as const] : []),
    ...(offered.speech ? ['speech:play' as const] : []),
    ...(offered.audio?.microphone ? ['microphone:publish' as const] : []), ...(offered.audio?.speaker ? ['speaker:subscribe' as const] : []), ...offered.camera.map(type => `camera:${type}` as const),
    ...offered.behaviors.map(behavior => `behavior:${behavior}` as const)]
}
