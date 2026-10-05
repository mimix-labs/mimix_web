export interface MediaConfig {
  provider: 'disabled' | 'livekit'; url: string; apiKey: string; apiSecret: string
  mode: 'cloud' | 'self-hosted'; lan: boolean; timeoutMs: number
}
export function isLanHost(host: string): boolean {
  if (host === '[::1]') return true
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false
  const parts = host.split('.').map(Number)
  return parts.every(n => n <= 255) && (parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31))
}
export function parseMediaEnvironment(env: NodeJS.ProcessEnv, devicesEnabled: boolean, videoUrl: string): MediaConfig {
  const fail = (field: string): never => { throw new Error(`Invalid configuration: ${field}`) }
  const provider = env.MIMIX_MEDIA_PROVIDER ?? 'disabled', mode = env.MIMIX_LIVEKIT_MODE ?? 'cloud', lanText = env.MIMIX_MEDIA_LAN ?? 'false'
  if (!['disabled', 'livekit'].includes(provider)) fail('MIMIX_MEDIA_PROVIDER')
  if (!['cloud', 'self-hosted'].includes(mode)) fail('MIMIX_LIVEKIT_MODE')
  if (!['true', 'false'].includes(lanText)) fail('MIMIX_MEDIA_LAN')
  const lan = lanText === 'true', url = env.LIVEKIT_URL ?? '', apiKey = env.LIVEKIT_API_KEY ?? '', apiSecret = env.LIVEKIT_API_SECRET ?? ''
  if (lan && !isLanHost(new URL(videoUrl).hostname)) fail('MIMIX_VISION_VIDEO_URL must be a literal LAN address for media fallback')
  if (provider === 'livekit') {
    if (!devicesEnabled) fail('media requires device sessions')
    if (!apiKey.trim() || apiKey.length > 128 || apiSecret.length < 32) fail('LIVEKIT_API_KEY/LIVEKIT_API_SECRET')
    try {
      const parsed = new URL(url)
      if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || !['ws:', 'wss:'].includes(parsed.protocol)) fail('LIVEKIT_URL')
      if (parsed.protocol === 'ws:' && !(lan && mode === 'self-hosted' && isLanHost(parsed.hostname))) fail('LIVEKIT_URL requires TLS outside LAN')
      if (mode === 'cloud' && !parsed.hostname.endsWith('.livekit.cloud')) fail('LIVEKIT_URL must identify LiveKit Cloud')
    } catch { fail('LIVEKIT_URL') }
  }
  return { provider: provider as MediaConfig['provider'], mode: mode as MediaConfig['mode'], lan, url, apiKey, apiSecret, timeoutMs: 3000 }
}
