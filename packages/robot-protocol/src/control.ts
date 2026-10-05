import { z } from 'zod'
import { behaviorIntentSchema, behaviorSchema } from './v1.js'
const uuid = z.uuid().transform(value => value.toLowerCase())
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1)
const timestamp = z.number().int().nonnegative()
export const robotControlEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1), sessionId: uuid, connectionId: uuid, sequence,
  leaseExpiresAt: timestamp, intent: behaviorIntentSchema,
}).refine(value => value.intent.expiresAt - value.intent.issuedAt <= 2000 && value.intent.expiresAt <= value.leaseExpiresAt
  && value.leaseExpiresAt - value.intent.issuedAt <= 15000, 'Control requires a short intent within its lease')
export const robotControlRequestSchema = z.strictObject({
  schemaVersion: z.literal(1), id: uuid, controlSessionId: uuid, behavior: behaviorSchema, ttlMs: z.number().int().min(1).max(2000).default(2000),
})
export const robotLeaseRequestSchema = z.strictObject({ schemaVersion: z.literal(1), deviceSessionId: uuid })
export const robotLeaseHeartbeatSchema = z.strictObject({ schemaVersion: z.literal(1) })
export const robotAckReasonSchema = z.enum(['ACCEPTED', 'STOPPED', 'EXPIRED', 'FUTURE', 'OUT_OF_ORDER', 'CONFLICT', 'CAPACITY', 'UNSUPPORTED', 'DRIVER_FAILED'])
export const robotControlAckSchema = z.strictObject({
  schemaVersion: z.literal(1), sessionId: uuid, connectionId: uuid, intentId: uuid, leaseId: uuid, sequence,
  status: z.enum(['accepted', 'rejected', 'stopped']), reason: robotAckReasonSchema,
}).refine(value => value.status === 'accepted' ? value.reason === 'ACCEPTED' : value.status === 'stopped' ? value.reason === 'STOPPED' : !['ACCEPTED', 'STOPPED'].includes(value.reason), 'ACK status/reason mismatch')
export const robotGatewayPresenceSchema = z.strictObject({
  schemaVersion: z.literal(1), sessionId: uuid, deviceId: uuid, connectionId: uuid,
  sequence, state: z.enum(['online', 'offline']), issuedAt: timestamp,
})
export const robotControlSessionSchema = z.strictObject({
  schemaVersion: z.literal(1), id: uuid, deviceSessionId: uuid, leaseId: uuid,
  state: z.enum(['active', 'closed']), expiresAt: timestamp, reason: z.enum(['NONE', 'RELEASED', 'EXPIRED', 'DEVICE_ENDED', 'GATEWAY_LOST', 'BROKER_LOST', 'ACK_TIMEOUT', 'RESTART', 'LEADER_LOST']),
})
export const robotCommandViewSchema = z.strictObject({
  schemaVersion: z.literal(1), id: uuid, controlSessionId: uuid, sequence, behavior: behaviorSchema,
  state: z.enum(['prepared', 'published', 'accepted', 'rejected', 'unknown', 'cancelled']), issuedAt: timestamp, expiresAt: timestamp,
  reason: z.enum(['NONE', 'ACCEPTED', 'STOPPED', 'EXPIRED', 'FUTURE', 'OUT_OF_ORDER', 'CONFLICT', 'CAPACITY', 'UNSUPPORTED', 'DRIVER_FAILED', 'BROKER_LOST', 'ACK_TIMEOUT', 'RESTART', 'AUTHORIZATION_LOST', 'RELEASED']),
})
export type RobotControlEnvelope = z.infer<typeof robotControlEnvelopeSchema>
export type RobotControlAck = z.infer<typeof robotControlAckSchema>
export type RobotGatewayPresence = z.infer<typeof robotGatewayPresenceSchema>
export type RobotAckReason = z.infer<typeof robotAckReasonSchema>
export type RobotControlSession = z.infer<typeof robotControlSessionSchema>
export type RobotCommandView = z.infer<typeof robotCommandViewSchema>
export type RobotChannel = 'intents' | 'ack' | 'presence'
export function robotTopic(sessionId: string, channel: RobotChannel): string {
  return `mimix/v1/devices/${uuid.parse(sessionId)}/${z.enum(['intents', 'ack', 'presence']).parse(channel)}`
}
export function parseRobotTopic(topic: string): { sessionId: string; channel: RobotChannel } | undefined {
  const match = /^mimix\/v1\/devices\/([0-9a-f-]{36})\/(intents|ack|presence)$/.exec(topic)
  return match && uuid.safeParse(match[1]).success ? { sessionId: match[1], channel: match[2] as RobotChannel } : undefined
}
export type RobotTransportEvent = { kind: 'connection'; online: boolean } | { kind: 'ack'; value: RobotControlAck } | { kind: 'presence'; value: RobotGatewayPresence }
/** Server-only transport. PUBACK is not gateway acceptance or physical execution. */
export interface RobotControlTransport {
  readonly online: boolean
  start(listener: (event: RobotTransportEvent) => void): void
  publish(envelope: RobotControlEnvelope): Promise<void>
  close(): Promise<void>
}
