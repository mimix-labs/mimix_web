import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import type { MediaJoin, MediaProvider } from '@mimix/media-contract'
import type { MediaConfig } from './config.js'
export class MediaProviderError extends Error { constructor() { super('media provider unavailable') } }
export class LiveKitMediaProvider implements MediaProvider {
  private readonly rooms: RoomServiceClient
  constructor(private readonly config: MediaConfig) {
    this.rooms = new RoomServiceClient(config.url.replace(/^ws/, 'http'), config.apiKey, config.apiSecret, { requestTimeout: config.timeoutMs / 1000, failover: false })
  }
  async createRoom(room: string): Promise<void> {
    try { await this.rooms.createRoom({ name: room, maxParticipants: 2, emptyTimeout: 30, departureTimeout: 10 }) }
    catch { throw new MediaProviderError() }
  }
  async issueToken(join: MediaJoin): Promise<{ token: string; expiresAt: number }> {
    const now = Math.floor(Date.now() / 1000)
    const expires = Math.min(Math.floor(join.expiresAt / 1000), now + 30)
    if (expires <= now) throw new MediaProviderError()
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, { identity: join.identity, ttl: expires - now })
    // AccessToken rewrites numeric constructor TTL to a relative string. Pin the
    // absolute JWT deadline so crossing a second while signing cannot extend it.
    token.ttl = expires
    token.addGrant({ room: join.room, roomJoin: true, roomAdmin: false, roomCreate: false, roomList: false, roomRecord: false,
      canPublish: join.permissions.publish.length > 0, canSubscribe: join.permissions.subscribe,
      canPublishSources: join.permissions.publish.map(source => source === 'camera' ? TrackSource.CAMERA : TrackSource.MICROPHONE),
      canPublishData: false, canUpdateOwnMetadata: false })
    try { return { token: await token.toJwt(), expiresAt: expires * 1000 } }
    catch { throw new MediaProviderError() }
  }
  async closeRoom(room: string, identities: string[]): Promise<void> {
    // Cloud's default cutoff includes a minute's tolerance; explicit +1s covers
    // tokens issued in this same second. Deployments must keep clocks synchronized.
    const options = this.config.mode === 'cloud' ? { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1) } : undefined
    const removal = await Promise.allSettled(identities.map(async identity => {
      try { await this.rooms.removeParticipant(room, identity, options) }
      catch (error) { if (this.config.mode !== 'self-hosted' || (error as { code?: string }).code !== 'not_found') throw error }
    }))
    let deleted = true
    try { await this.rooms.deleteRoom(room) } catch (error) { deleted = (error as { code?: string }).code === 'not_found' }
    if (!deleted || removal.some(result => result.status === 'rejected')) throw new MediaProviderError()
  }
}
