import { createApi } from '../../dist/app.js'
import { parseEnvironment } from '../../dist/config/environment.js'
import { VoiceService } from '../../dist/modules/voice/service.js'
const config = parseEnvironment({ LOG_LEVEL: 'info', MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture',
  CLERK_ISSUER: 'https://test.clerk.accounts.dev', CLERK_AUTHORIZED_PARTIES: 'https://mimix.test', MIMIX_IDENTITY_FILE: '/unused/voice.json',
  MIMIX_VOICE_PROVIDER: 'elevenlabs', ELEVENLABS_API_KEY: 'do-not-log-provider-key', ELEVENLABS_VOICE_ID: 'JBFqnCBsd6RMkjVDRZzb', MIMIX_VOICE_RETENTION: 'zero' })
const voice = new VoiceService({ async synthesize() { throw new Error('do-not-log-upstream-body') } }, config.voice)
const app = await createApi(config, { voice, provider: {
  async verifyToken() { return { provider: 'test', issuer: 'test', subject: 'test', sessionId: 'test' } }, async verifySession() {},
}, repository: { resolve: () => ({ id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-10-05T00:00:00Z' }) } })
await app.listen(0, '127.0.0.1')
process.send({ base: await app.getUrl() })
process.once('message', async () => { await app.close(); process.exit(0) })
