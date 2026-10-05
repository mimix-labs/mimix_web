import type { ApiConfig } from '../config/environment.js'
import type { IdentityDependencies } from '../security/policy.js'
import { DeviceStore } from '../modules/devices/store.js'
import { ClerkIdentityProvider } from '../modules/identity/clerk.provider.js'
import { Database } from './database.js'
import { PostgresIdentityRepository } from '../modules/identity/postgres.repository.js'
import { CampaignStore } from '../modules/campaigns/store.js'
import { LearningStore } from '../modules/learning/store.js'
export function dataServices(config: ApiConfig, dependencies: IdentityDependencies) {
  const database = config.dataStore === 'postgres' ? new Database(config.databaseUrl) : undefined
  const provider = dependencies.provider ?? (config.authMode === 'clerk' ? new ClerkIdentityProvider(config.clerk) : undefined)
  const devices = config.deviceSessionsEnabled && database && provider ? new DeviceStore(database, identity => provider.verifySession(identity)) : undefined
  devices?.start()
  return { database, devices, campaigns: database ? new CampaignStore(database) : undefined, learning: database ? new LearningStore(database) : undefined,
    identity: { ...dependencies, provider, deviceCredential: devices ? (token: string) => devices.credentialSessionId(token) : undefined, repository: dependencies.repository ?? (database ? new PostgresIdentityRepository(database) : undefined) },
    close: async () => { await devices?.close(); await database?.close() },
  }
}
