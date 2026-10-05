export interface VoiceLimits {
  timeoutMs: number; maxConcurrent: number; requestsPerMinute: number; charactersPerMinute: number; charactersPerDay: number
}
export interface VoiceConfig extends VoiceLimits {
  provider: 'disabled' | 'elevenlabs'; apiKey: string; voiceId: string; retention: 'standard' | 'zero'
}
export function parseVoiceEnvironment(env: NodeJS.ProcessEnv, authMode: string): VoiceConfig {
  const fail = (field: string): never => { throw new Error(`Invalid configuration: ${field}`) }
  const limit = (field: string, fallback: number, max: number) => {
    const value = env[field] ?? String(fallback), number = Number(value)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1 || number > max) fail(field)
    return number
  }
  const provider = env.MIMIX_VOICE_PROVIDER ?? 'disabled'
  if (provider !== 'disabled' && provider !== 'elevenlabs') fail('MIMIX_VOICE_PROVIDER')
  const apiKey = env.ELEVENLABS_API_KEY ?? '', voiceId = env.ELEVENLABS_VOICE_ID ?? ''
  const retention = env.MIMIX_VOICE_RETENTION ?? (provider === 'disabled' ? 'standard' : '')
  if (retention !== 'standard' && retention !== 'zero') fail('MIMIX_VOICE_RETENTION')
  if (provider === 'elevenlabs') {
    if (authMode !== 'clerk') fail('MIMIX_AUTH_MODE must be clerk for voice')
    if (!/^[\x21-\x7e]{1,256}$/.test(apiKey)) fail('ELEVENLABS_API_KEY')
    if (!/^[A-Za-z0-9]{1,64}$/.test(voiceId)) fail('ELEVENLABS_VOICE_ID')
  }
  return { provider: provider as VoiceConfig['provider'], apiKey, voiceId, retention: retention as VoiceConfig['retention'],
    timeoutMs: limit('MIMIX_VOICE_TIMEOUT_MS', 15000, 30000), maxConcurrent: limit('MIMIX_VOICE_MAX_CONCURRENT', 4, 32),
    requestsPerMinute: limit('MIMIX_VOICE_REQUESTS_PER_MINUTE', 6, 60), charactersPerMinute: limit('MIMIX_VOICE_CHARACTERS_PER_MINUTE', 3000, 60000),
    charactersPerDay: limit('MIMIX_VOICE_CHARACTERS_PER_DAY', 50000, 10000000),
  }
}
