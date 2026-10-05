import { MediaService } from '../modules/media/service.js'
import { LiveKitMediaProvider } from '../modules/media/livekit.js'
import type { MediaProvider } from '@mimix/media-contract'
import { DeviceTokens } from '../modules/devices/tokens.js'
import type { ApiConfig } from '../config/environment.js'
import type { IdentityDependencies } from '../security/policy.js'
import { DeviceStore } from '../modules/devices/store.js'
import { ClerkIdentityProvider } from '../modules/identity/clerk.provider.js'
import { Database } from './database.js'
import { PostgresIdentityRepository } from '../modules/identity/postgres.repository.js'
import { CampaignStore } from '../modules/campaigns/store.js'
import { LearningStore } from '../modules/learning/store.js'
export function dataServices(config: ApiConfig, dependencies: IdentityDependencies & { mediaProvider?: MediaProvider }) {
  const database = config.dataStore === 'postgres' ? new Database(config.databaseUrl) : undefined
  const provider = dependencies.provider ?? (config.authMode === 'clerk' ? new ClerkIdentityProvider(config.clerk) : undefined)
  const devices = config.deviceSessionsEnabled && database && provider ? new DeviceStore(database, identity => provider.verifySession(identity), new DeviceTokens(config.deviceTokenKey)) : undefined
  const media = config.media.provider === 'livekit' && database && devices ? new MediaService(database, devices, dependencies.mediaProvider ?? new LiveKitMediaProvider(config.media), config.media) : undefined
  media?.start()
  devices?.start()
  return { database, devices, media, campaigns: database ? new CampaignStore(database) : undefined, learning: database ? new LearningStore(database) : undefined,
    identity: { ...dependencies, provider, deviceAdmission: devices ? (token: string) => devices.credentialIdentity(token) : undefined, deviceCredential: devices ? (token: string) => devices.credentialSessionId(token) : undefined, repository: dependencies.repository ?? (database ? new PostgresIdentityRepository(database) : undefined) },
    close: async () => { await media?.shutdown(); await devices?.close(); await database?.close() },
  }
}
