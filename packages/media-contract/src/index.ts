import { z } from 'zod'
const id = z.uuid().transform(value => value.toLowerCase())
export const mediaTrackSchema = z.enum(['robot_camera', 'robot_microphone', 'robot_speaker'])
export type MediaTrack = z.infer<typeof mediaTrackSchema>
export const mediaTracksSchema = z.array(mediaTrackSchema).min(1).max(3).refine(values => new Set(values).size === values.length, 'Duplicate track')
export const mediaRequestSchema = z.strictObject({ schemaVersion: z.literal(1), deviceSessionId: id, tracks: mediaTracksSchema })
export const mediaTokenRequestSchema = z.strictObject({ schemaVersion: z.literal(1) })
export const mediaReasonSchema = z.enum(['NONE', 'PROVIDER_UNAVAILABLE', 'DEVICE_ENDED', 'SESSION_EXPIRED', 'USER_CLOSED', 'DISCONNECTED'])
export const mediaSessionSchema = z.strictObject({
  schemaVersion: z.literal(1), id, deviceSessionId: id, tracks: mediaTracksSchema,
  state: z.enum(['active', 'closing', 'closed']), reason: mediaReasonSchema,
  createdAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(), leaseExpiresAt: z.number().int().nonnegative(),
})
export const mjpegFallbackSchema = z.strictObject({ transport: z.literal('mjpeg'), scope: z.literal('lan'), streamPath: z.literal('/api/vision/video'), authentication: z.literal('operator'), audio: z.literal(false) })
export type MediaSession = z.infer<typeof mediaSessionSchema>
export type MediaRequest = z.infer<typeof mediaRequestSchema>
export type MediaReason = z.infer<typeof mediaReasonSchema>
export type MediaSource = 'camera' | 'microphone'
export interface MediaPermissions { publish: MediaSource[]; subscribe: boolean }
export function participantPermissions(tracks: MediaTrack[], participant: 'robot' | 'user'): MediaPermissions {
  mediaTracksSchema.parse(tracks)
  return participant === 'robot'
    ? { publish: [...(tracks.includes('robot_camera') ? ['camera' as const] : []), ...(tracks.includes('robot_microphone') ? ['microphone' as const] : [])], subscribe: tracks.includes('robot_speaker') }
    : { publish: tracks.includes('robot_speaker') ? ['microphone'] : [], subscribe: tracks.includes('robot_camera') || tracks.includes('robot_microphone') }
}
export function requiredDeviceCapabilities(tracks: MediaTrack[]): Array<'camera:webrtc' | 'microphone:publish' | 'speaker:subscribe'> {
  const mapping = { robot_camera: 'camera:webrtc', robot_microphone: 'microphone:publish', robot_speaker: 'speaker:subscribe' } as const
  return mediaTracksSchema.parse(tracks).map(track => mapping[track])
}
/** Consumers must stop capture/playback on loss and arm a local deadline watchdog. */
export function mediaOutputPolicy(tracks: MediaTrack[], state: 'connecting' | 'connected' | 'disconnected' | 'degraded', leaseExpiresAt: number, now: number) {
  const enabled = state === 'connected' && Number.isFinite(now) && Number.isFinite(leaseExpiresAt) && now < leaseExpiresAt
  return { camera: enabled && tracks.includes('robot_camera'), microphone: enabled && tracks.includes('robot_microphone'), speaker: enabled && tracks.includes('robot_speaker') }
}
export interface MediaJoin { room: string; identity: string; permissions: MediaPermissions; expiresAt: number }
/** Server-only adapter boundary. Client requests may never supply room/identity/grants. */
export interface MediaProvider {
  createRoom(room: string): Promise<void>
  issueToken(join: MediaJoin): Promise<{ token: string; expiresAt: number }>
  closeRoom(room: string, identities: string[]): Promise<void>
}
