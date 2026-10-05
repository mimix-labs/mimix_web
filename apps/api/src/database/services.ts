import type { ApiConfig } from '../config/environment.js'
import type { IdentityDependencies } from '../security/policy.js'
import { Database } from './database.js'
import { PostgresIdentityRepository } from '../modules/identity/postgres.repository.js'
import { CampaignStore } from '../modules/campaigns/store.js'
import { LearningStore } from '../modules/learning/store.js'
export function dataServices(config: ApiConfig, dependencies: IdentityDependencies) {
  const database = config.dataStore === 'postgres' ? new Database(config.databaseUrl) : undefined
  return { database, campaigns: database ? new CampaignStore(database) : undefined, learning: database ? new LearningStore(database) : undefined,
    identity: { ...dependencies, repository: dependencies.repository ?? (database ? new PostgresIdentityRepository(database) : undefined) },
    close: () => database?.close(),
  }
}
