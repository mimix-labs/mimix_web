import { once } from 'node:events'
import { createApi } from '../../dist/app.js'
import { createSecuredLegacy } from '../../dist/security/legacy.js'
import { parseEnvironment } from '../../dist/config/environment.js'
import { IdentityError } from '../../dist/modules/identity/identity.contract.js'

const provider = {
  async verifyToken(token) { if (!['alice', 'bob'].includes(token)) throw new IdentityError(401); return { provider: 'clerk', issuer: 'https://learning.test', subject: token, sessionId: 'test' } },
  async verifySession() {},
}
export async function start(t, runtime, url, extra = {}) {
  const config = parseEnvironment({ MIMIX_DATA_STORE: 'postgres', DATABASE_URL: url, MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://learning.test', CLERK_AUTHORIZED_PARTIES: 'https://learning.test', MIMIX_ALLOWED_ORIGINS: 'https://learning.test', MIMIX_IDENTITY_FILE: '/unused/learning.json', LOG_LEVEL: 'silent', ...extra })
  let base
  if (runtime === 'nest') {
    const app = await createApi(config, { provider }); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); t.after(() => app.close())
  } else {
    const app = createSecuredLegacy(config, { provider }); const server = app.app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.close() })
  }
  return async (path, body, actor = 'alice', method = body ? 'POST' : 'GET') => {
    const r = await fetch(base + path, { method, headers: { ...(actor ? { authorization: `Bearer ${actor}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const raw = await r.text(); return { status: r.status, headers: r.headers, body: raw ? JSON.parse(raw) : undefined }
  }
}
