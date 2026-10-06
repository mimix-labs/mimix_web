import { LocalStore } from '../modules/sync/local-store.js'
import { CloudSyncStore } from '../modules/sync/cloud-store.js'
import { SyncService } from '../modules/sync/service.js'
import { BackendMqttTransport } from '@mimix/robot-mqtt'
import type { RobotControlTransport } from '@mimix/robot-protocol'
import { RobotControlService } from '../modules/robot-control/service.js'
import { createVoiceService } from '../modules/voice/factory.js'
import type { VoiceService } from '../modules/voice/service.js'
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
export function dataServices(config: ApiConfig, dependencies: IdentityDependencies & { mediaProvider?: MediaProvider; voice?: VoiceService; robotTransport?: RobotControlTransport }) {
  const database = config.dataStore === 'postgres' ? new Database(config.databaseUrl) : undefined
  let local: LocalStore | undefined
  if (config.sync.offlineEnabled) {
    try { local = new LocalStore(config.sync.path) }
    catch { console.error(JSON.stringify({ event: 'offline-storage-unavailable' })) }
  }
  const sync = new SyncService(local, config.sync.cloudEnabled && database ? new CloudSyncStore(database) : undefined, config.sync.cloudOrigin)
  const provider = dependencies.provider ?? (config.authMode === 'clerk' ? new ClerkIdentityProvider(config.clerk) : undefined)
  const devices = config.deviceSessionsEnabled && database && provider ? new DeviceStore(database, identity => provider.verifySession(identity), new DeviceTokens(config.deviceTokenKey)) : undefined
  const media = config.media.provider === 'livekit' && database && devices ? new MediaService(database, devices, dependencies.mediaProvider ?? new LiveKitMediaProvider(config.media), config.media) : undefined
  const voice = dependencies.voice ?? createVoiceService(config.voice)
  const robot = config.robot.transport === 'mqtt' && database && devices ? new RobotControlService(database, devices, voice.embodiments, dependencies.robotTransport ?? new BackendMqttTransport(config.robot.mqtt), () => voice.close()) : undefined
  const ready = robot?.start() ?? Promise.resolve()
  void ready.catch(() => { voice.close() })
  media?.start()
  devices?.start()
  return { sync, database, devices, media, robot, voice, ready, campaigns: database ? new CampaignStore(database) : undefined, learning: database ? new LearningStore(database) : undefined,
    identity: { ...dependencies, provider, deviceAdmission: devices ? (token: string) => devices.credentialIdentity(token) : undefined, deviceCredential: devices ? (token: string) => devices.credentialSessionId(token) : undefined, repository: dependencies.repository ?? (database ? new PostgresIdentityRepository(database) : undefined) },
    close: async () => { local?.close(); await robot?.shutdown(); voice.close(); await media?.shutdown(); await devices?.close(); await database?.close() },
  }
}
