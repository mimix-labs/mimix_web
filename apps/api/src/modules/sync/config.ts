import { isAbsolute } from 'node:path'
export interface SyncConfig { offlineEnabled: boolean; cloudEnabled: boolean; path: string; cloudOrigin: string }
export function parseSyncEnvironment(env: NodeJS.ProcessEnv, authMode: string, dataStore: string): SyncConfig {
  const flag = (name: string) => {
    const value = env[name] ?? 'false'
    if (!['true', 'false'].includes(value)) throw new Error(`Invalid configuration: ${name}`)
    return value === 'true'
  }
  const offlineEnabled = flag('MIMIX_OFFLINE_ENABLED'), cloudEnabled = flag('MIMIX_SYNC_ENABLED')
  const allowLoopback = flag('MIMIX_SYNC_ALLOW_LOOPBACK')
  if (offlineEnabled && (authMode !== 'legacy' || dataStore !== 'file' || cloudEnabled)) throw new Error('Invalid configuration: offline requires a separate legacy edge process')
  if (cloudEnabled && (authMode !== 'clerk' || dataStore !== 'postgres')) throw new Error('Invalid configuration: sync requires Clerk and PostgreSQL')
  const path = env.MIMIX_OFFLINE_DB_PATH ?? ''
  if (offlineEnabled && !isAbsolute(path)) throw new Error('Invalid configuration: MIMIX_OFFLINE_DB_PATH')
  const cloudOrigin = env.MIMIX_SYNC_CLOUD_ORIGIN ?? ''
  if (cloudOrigin) {
    try {
      const url = new URL(cloudOrigin)
      if (url.origin !== cloudOrigin || url.username || url.password || (url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) throw new Error()
    } catch { throw new Error('Invalid configuration: MIMIX_SYNC_CLOUD_ORIGIN') }
  }
  return { offlineEnabled, cloudEnabled, path, cloudOrigin }
}
