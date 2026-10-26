import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)
const source = path => readFile(new URL(path, root), 'utf8')
const load = async path => import(`data:text/javascript;base64,${Buffer.from(await source(path)).toString('base64')}`)

function environment() {
  const requests = []
  const streams = []
  globalThis.MIMIX_STATIC = true
  globalThis.window = { location: { search: '?vision=robot', pathname: '/' } }
  globalThis.fetch = async (...args) => { requests.push(args); return { ok: true, json: async () => ({ mode: 'jetson' }) } }
  globalThis.EventSource = class {
    constructor(url) { streams.push(url) }
    addEventListener() {}
    close() {}
  }
  return { requests, streams }
}

test('the world bridge does not contact a backend in the static release', async () => {
  const { requests, streams } = environment()
  const { RobotWebBridge } = await load('client/src/core/RobotWebBridge.js')
  const bridge = new RobotWebBridge({ context: { page: 'world' }, onNavigate() {} })
  bridge.start()
  bridge.updateContext({ selectedObject: 'cube' })
  await bridge.publishContext()
  bridge.stop()
  assert.deepEqual(requests, [])
  assert.deepEqual(streams, [])
})

test('challenge bridges remain callable without network or SSE', async () => {
  const { requests, streams } = environment()
  // This adapter imports only a pure URL helper; use its actual source inline.
  const code = (await source('client/public/challenges/robotWebBridge.js')).replace("import { getVisionOverrideQuery } from './robotVision.js'", "const getVisionOverrideQuery = () => '?vision=browser'")
  const { startRobotWebBridge } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  const bridge = startRobotWebBridge('mathematics')
  bridge.updateContext({ selectedObject: 'cube' })
  bridge.stop()
  assert.deepEqual(requests, [])
  assert.deepEqual(streams, [])
})

test('a stale robot-mode URL still uses the local webcam without config requests', async () => {
  const { requests } = environment()
  const vision = await load('client/public/challenges/robotVision.js')
  assert.equal(await vision.resolveVisionMode(), 'browser')
  assert.equal(await vision.isRobotVisionMode(), false)
  assert.equal(vision.getVisionOverrideQuery(), '?vision=browser')
  assert.deepEqual(requests, [])
})

test('physical controls are not mounted in a browser-only release', async () => {
  environment()
  let queries = 0
  globalThis.document = { getElementById() { queries++; return null } }
  const { RobotControls } = await load('client/src/ui/RobotControls.js')
  new RobotControls()
  assert.equal(queries, 0)
})

for (const challenge of ['mathematics', 'science']) {
  test(`${challenge} events remain callable without sending backend requests`, async () => {
    const requests = []
    const context = { MIMIX_STATIC: true, window: {}, fetch: async (...args) => requests.push(args) }
    vm.runInNewContext(await source(`client/public/challenges/${challenge}/socketBridge.js`), context)
    context.window.io().emit('selected', { symbol: 'H' })
    assert.deepEqual(requests, [])
  })
}
