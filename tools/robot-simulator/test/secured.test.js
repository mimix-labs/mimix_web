import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { parseEnvironment } from '../../../apps/api/dist/config/environment.js'
import { createApi } from '../../../apps/api/dist/app.js'
import { createSecuredLegacy } from '../../../apps/api/dist/security/legacy.js'
import { RobotSimulator } from '../dist/index.js'
import { openStream } from '../../../test/contracts/helpers.js'

for (const runtime of ['nest', 'express']) {
  test(`${runtime} secured: robot HTTP/SSE use bridge token; operator remains separate`, async t => {
    const config = parseEnvironment({ LOG_LEVEL: 'silent', MIMIX_IDENTITY_FILE: '/unused/test.json', MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_placeholder', CLERK_ISSUER: 'https://test.clerk.accounts.dev', CLERK_AUTHORIZED_PARTIES: 'https://mimix.test', MIMIX_ALLOWED_ORIGINS: 'https://mimix.test', MIMIX_ROBOT_BRIDGE_TOKEN: 'bridge', MIMIX_ROBOT_CONTROL_TOKEN: 'control' })
    // Machine requests must never contact Clerk or create a user.
    const provider = { verifyToken: async () => { assert.fail('Robot cannot use user identity') }, verifySession: async () => { assert.fail('Robot cannot use user identity') } }
    let base
    if (runtime === 'nest') {
      const app = await createApi(config, { provider })
      await app.listen(0, '127.0.0.1'); base = await app.getUrl()
      t.after(() => app.close())
    } else {
      const app = createSecuredLegacy(config, { provider })
      const server = app.app.listen(0, '127.0.0.1')
      await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`
      t.after(() => { app.close(); server.closeAllConnections(); server.close() })
    }
    const robot = new RobotSimulator({ baseUrl: base, bridgeToken: 'bridge' })
    assert.equal((await robot.getContext()).page, 'world')
    assert.deepEqual(await robot.publishHands({ landmarks: [], handedness: [], timestamp: 100, source: 'jetson-native' }), { accepted: true })
    const stream = await openStream(t, base + '/api/robot/motion/stream', { 'X-Mimix-Robot-Token': 'bridge' })
    assert.match(await stream.until('retry:'), /retry: 1000/)
    for (const headers of [{}, { 'X-Mimix-Control-Token': 'control' }]) {
      const response = await fetch(base + '/api/vision/hand-landmarks', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ landmarks: [], handedness: [] }) })
      assert.equal(response.status, 401)
    }
    assert.equal((await fetch(base + '/api/robot/status', { headers: { 'X-Mimix-Robot-Token': 'bridge' } })).status, 401)
    assert.equal((await fetch(base + '/api/robot/status', { headers: { 'X-Mimix-Control-Token': 'control' } })).status, 200)
  })
}
