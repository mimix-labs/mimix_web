import { test, expect } from '@playwright/test'
import type {} from '../../harness/main.js'
const ordinary = `var MimixChallenge = { createChallenge(context) { globalThis.ctx = context; return {
  async initialize() {}, async start() {}, async pause() {}, async resume() {}, async dispose() {}
} } }`
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.harness) })
test('SDK fixture runs in sandbox, lifecycle is ordered and disposal is idempotent', async ({ page }) => {
  const result = await page.evaluate(async () => {
    try { await window.harness.mount(); return 'ready' } catch (error) { return String(error) }
  })
  expect(result).toBe('ready')
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts')
  await page.evaluate(async () => { await window.harness.handle.start(); await window.harness.handle.pause(); await window.harness.handle.resume() })
  expect(await page.evaluate(() => window.harness.calls.map(call => call.method))).toEqual(['agent.speak','progress.record','progress.record','embodiment.perform'])
  expect(await page.evaluate(async () => { try { await window.harness.handle.start() } catch (error) { return (error as {code:string}).code } })).toBe('INVALID_LIFECYCLE')
  await page.evaluate(async () => { await window.harness.handle.dispose(); await window.harness.handle.dispose() })
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(await page.evaluate(() => window.harness.handle.state)).toBe('disposed')
})
test('optional grants are denied, revoked per call and required grants fail closed', async ({ page }) => {
  await page.evaluate(async bundle => { await window.harness.mount(bundle, { approved: ['progress'] }); await window.harness.handle.start() }, ordinary)
  const frame = page.frames()[1]
  expect(await frame.evaluate(async () => { try { await (globalThis as unknown as {ctx:import('@mimix/challenge-sdk').ChallengeContext}).ctx.mimix.agent.speak({text:'private'}) } catch(error) { return (error as {code:string}).code } })).toBe('CAPABILITY_DENIED')
  expect(await page.evaluate(() => window.harness.calls.length)).toBe(0)
  await page.evaluate(() => window.harness.handle.revoke('progress'))
  expect(await page.evaluate(() => window.harness.handle.state)).toBe('cancelled')
  expect(await page.evaluate(async () => { try { await window.harness.mount(undefined, { approved: [] }) } catch(error) { return (error as {code:string}).code } })).toBe('CAPABILITY_DENIED')
})
test('a hanging hook times out and removes the frame', async ({ page }) => {
  await page.evaluate(async bundle => { await window.harness.mount(bundle, { timeoutMs: 150 }) }, ordinary.replace('async start() {}', 'async start() { await new Promise(() => {}) }'))
  expect(await page.evaluate(async () => { try { await window.harness.handle.start() } catch(error) { return (error as {code:string}).code } })).toBe('HOST_UNAVAILABLE')
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(await page.evaluate(() => window.harness.handle.state)).toBe('error')
})
test('cancellation aborts a pending adapter and late completion never revives the session', async ({ page }) => {
  await page.evaluate(async bundle => { await window.harness.mount(bundle, { slow: true }); void window.harness.handle.start().catch(() => {}) }, ordinary.replace('async start() {}','async start() { await context.mimix.agent.speak({text:"private"}) }'))
  await expect.poll(() => page.evaluate(() => window.harness.calls.length)).toBe(1)
  await page.evaluate(() => window.harness.handle.cancel())
  expect(await page.evaluate(() => window.harness.calls[0].aborted)).toBe(true)
  await page.waitForTimeout(1600)
  expect(await page.evaluate(() => window.harness.handle.state)).toBe('cancelled')
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.stringify(window.harness.telemetry))).not.toContain('private')
})
const hostile = ordinary + `;window.addEventListener('message', event => { if (event.ports[0]) globalThis.attackPort = event.ports[0] })`
for (const attack of ['version','schema','session','oversize','replay'] as const) {
  test(`host rejects ${attack} messages without unauthorized effects`, async ({ page }) => {
    await page.evaluate(async bundle => { await window.harness.mount(bundle); await window.harness.handle.start() }, hostile)
    await page.frames()[1].evaluate(kind => {
      const target = globalThis as unknown as { attackPort: MessagePort; __mimixConfig: { session: string } }
      const message: Record<string, unknown> = { v: 1, session: target.__mimixConfig.session, kind: 'call', id: 1, method: 'progress.record', input: { type:'hint_requested',payload:{} } }
      if (kind === 'version') message.v = 2
      if (kind === 'schema') message.input = { type: 'answer_submitted', payload: { correct: true, userId: 'forged' } }
      if (kind === 'session') message.session = 'a'.repeat(32)
      if (kind === 'oversize') message.extra = 'x'.repeat(17000)
      target.attackPort.postMessage(JSON.stringify(message))
      if (kind === 'replay') target.attackPort.postMessage(JSON.stringify(message))
    }, attack)
    await expect.poll(() => page.evaluate(() => window.harness.handle.state)).toBe('error')
    expect(await page.evaluate(() => window.harness.calls.length)).toBe(attack === 'replay' ? 1 : 0)
    await expect(page.locator('iframe')).toHaveCount(0)
  })
}
test('opaque origin and CSP isolate DOM, storage, navigation and network resources', async ({ page }) => {
  const before = await (await page.request.get('/network-audit')).json()
  await page.evaluate(() => { document.cookie = 'host_secret=private; path=/' })
  await page.evaluate(bundle => window.harness.mount(bundle), ordinary)
  const result = await page.frames()[1].evaluate(async origin => {
    const denied: string[] = []
    for (const [name, action] of Object.entries({
      parentDOM: () => parent.document.body,
      storage: () => localStorage.getItem('token'),
      topNavigation: () => { top!.location.href = origin + '/forbidden-top' },
    })) { try { action() } catch { denied.push(name) } }
    try { await fetch(origin + '/forbidden-fetch') } catch { denied.push('fetch') }
    const script = document.createElement('script'); script.src = origin + '/forbidden-script'; document.body.append(script)
    const image = document.createElement('img'); image.src = origin + '/forbidden-image'; document.body.append(image)
    const nested = document.createElement('iframe'); nested.src = origin + '/forbidden-frame'; document.body.append(nested)
    const form = document.createElement('form'); form.action = origin + '/forbidden-form'; document.body.append(form); try { form.submit() } catch { /* Firefox throws when sandbox denies forms. */ }
    let popup: boolean
    try { popup = window.open(origin + '/forbidden-popup') === null } catch { popup = true }
    let cookieBlocked: boolean
    try { cookieBlocked = document.cookie === '' } catch { cookieBlocked = true }
    return { denied, popup, cookieBlocked, frameElement: window.frameElement === null }
  }, 'http://127.0.0.1:4178')
  expect(result.denied.sort()).toEqual(['fetch','parentDOM','storage','topNavigation'].sort())
  expect(result.cookieBlocked).toBe(true)
  expect(result.popup).toBe(true); expect(result.frameElement).toBe(true)
  await page.waitForTimeout(150)
  expect(await (await page.request.get('/network-audit')).json()).toEqual(before)
  expect(page.url()).toBe('http://127.0.0.1:4178/')
})
test('self navigation destroys authority and requires a new instance', async ({ page }) => {
  await page.evaluate(async bundle => { await window.harness.mount(bundle); await window.harness.handle.start().catch(() => {}) }, ordinary.replace('async start() {}', `async start() { setTimeout(() => { location.href = 'http://127.0.0.1:4178/navigated' }, 0) }`))
  await expect.poll(() => page.evaluate(() => window.harness.handle.state)).toBe('error')
  await expect(page.locator('iframe')).toHaveCount(0)
})
test('wrong handshake origin fails closed; sibling source cannot establish a channel', async ({ page }) => {
  const result = await page.evaluate(async bundle => {
    const loading = window.harness.mount(bundle)
    const frame = document.querySelector('iframe')!
    const session = /"session":"([a-f0-9]+)"/.exec(frame.srcdoc)![1]
    const data = JSON.stringify({v:1,kind:'hello',session})
    const sibling = new MessageEvent('message',{data,origin:'null'})
    Object.defineProperty(sibling, 'source', { value: window })
    window.dispatchEvent(sibling)
    const afterSibling = window.harness.handle.state
    const forged = new MessageEvent('message',{data,origin:location.origin})
    Object.defineProperty(forged, 'source', { value: frame.contentWindow })
    window.dispatchEvent(forged)
    try { await loading } catch { /* expected invalid origin */ }
    return { afterSibling, final: window.harness.handle.state }
  }, ordinary)
  expect(result).toEqual({afterSibling:'loading',final:'error'})
  expect(await page.evaluate(() => window.harness.calls.length)).toBe(0)
})
test('revoking an optional grant aborts work and later calls remain denied', async ({ page }) => {
  await page.evaluate(async bundle => { await window.harness.mount(bundle,{slow:true}); await window.harness.handle.start() }, ordinary)
  const response = page.frames()[1].evaluate(async () => {
    try { await (globalThis as unknown as {ctx:import('@mimix/challenge-sdk').ChallengeContext}).ctx.mimix.agent.speak({text:'private'}) } catch(error) { return (error as {code:string}).code }
  })
  await expect.poll(() => page.evaluate(() => window.harness.calls.length)).toBe(1)
  await page.evaluate(() => window.harness.handle.revoke('agent'))
  expect(await response).toBe('CAPABILITY_DENIED')
  expect(await page.evaluate(() => window.harness.calls[0].aborted)).toBe(true)
  expect(await page.frames()[1].evaluate(() => (globalThis as unknown as {ctx:import('@mimix/challenge-sdk').ChallengeContext}).ctx.capabilities.includes('agent'))).toBe(false)
})
test('operation timeout aborts the adapter while a caught rejection leaves the instance usable', async ({ page }) => {
  await page.evaluate(async bundle => { await window.harness.mount(bundle,{slow:true,timeoutMs:150}); await window.harness.handle.start() }, ordinary)
  expect(await page.frames()[1].evaluate(async () => {
    try { await (globalThis as unknown as {ctx:import('@mimix/challenge-sdk').ChallengeContext}).ctx.mimix.agent.speak({text:'private'}) } catch(error) { return (error as {code:string}).code }
  })).toBe('HOST_UNAVAILABLE')
  expect(await page.evaluate(() => window.harness.calls[0].aborted)).toBe(true)
  expect(await page.evaluate(() => window.harness.handle.state)).toBe('running')
})
test('loading errors, aborted mounts and detached containers clean up', async ({ page }) => {
  expect(await page.evaluate(async () => { try { await window.harness.mount('var MimixChallenge = {}') } catch(error) { return (error as {code:string}).code } })).toBe('HOST_UNAVAILABLE')
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(await page.evaluate(async bundle => {
    const controller = new AbortController(); controller.abort()
    try { await window.harness.mount(bundle,{signal:controller.signal}) } catch(error) { return (error as {code:string}).code }
  }, ordinary)).toBe('ABORTED')
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.evaluate(bundle => window.harness.mount(bundle), ordinary)
  await page.evaluate(() => document.querySelector('#frame')!.remove())
  await expect.poll(() => page.evaluate(() => window.harness.handle.state)).toBe('cancelled')
})
test('cancel from an operation observer prevents dispatch to the adapter', async ({ page }) => {
  await page.evaluate(async bundle => {
    await window.harness.mount(bundle,{cancelOnOperation:true})
    await window.harness.handle.start().catch(() => {})
  }, ordinary.replace('async start() {}','async start() { await context.mimix.agent.speak({text:"private"}) }'))
  expect(await page.evaluate(() => window.harness.calls.length)).toBe(0)
  expect(await page.evaluate(() => window.harness.handle.state)).toBe('cancelled')
})
test('missing handshake is bounded by load timeout', async ({ page }) => {
  expect(await page.evaluate(async bundle => {
    const drop = (event: MessageEvent) => { if (event.origin === 'null') event.stopImmediatePropagation() }
    window.addEventListener('message', drop)
    try { await window.harness.mount(bundle,{timeoutMs:150}) } catch(error) { return (error as {code:string}).code }
    finally { window.removeEventListener('message', drop) }
  }, ordinary)).toBe('HOST_UNAVAILABLE')
  expect(await page.evaluate(() => window.harness.telemetry.some(event => event.event === 'timeout'))).toBe(true)
  await expect(page.locator('iframe')).toHaveCount(0)
})
test('SDK calls before start or while paused cannot reach adapters', async ({ page }) => {
  await page.evaluate(bundle => window.harness.mount(bundle), ordinary)
  const attempt = () => page.frames()[1].evaluate(async () => {
    try { await (globalThis as unknown as {ctx:import('@mimix/challenge-sdk').ChallengeContext}).ctx.mimix.progress.record({type:'hint_requested',payload:{}}) } catch(error) { return (error as {code:string}).code }
  })
  expect(await attempt()).toBe('INVALID_LIFECYCLE')
  await page.evaluate(async () => { await window.harness.handle.start(); await window.harness.handle.pause() })
  expect(await attempt()).toBe('INVALID_LIFECYCLE')
  expect(await page.evaluate(() => window.harness.calls.length)).toBe(0)
})
test('in-flight request budget limits hostile bursts', async ({ page }) => {
  await page.evaluate(async bundle => { await window.harness.mount(bundle,{slow:true}); await window.harness.handle.start() }, hostile)
  await page.frames()[1].evaluate(() => {
    const target = globalThis as unknown as {attackPort:MessagePort; __mimixConfig:{session:string}; replies:unknown[]}
    target.replies = []
    target.attackPort.addEventListener('message',event => target.replies.push(JSON.parse(event.data)))
    for (let id=1;id<=9;id++) target.attackPort.postMessage(JSON.stringify({v:1,session:target.__mimixConfig.session,kind:'call',id,method:'agent.speak',input:{text:'burst'}}))
  })
  await expect.poll(() => page.evaluate(() => window.harness.calls.length)).toBe(8)
  await expect.poll(() => page.frames()[1].evaluate(() => (globalThis as unknown as {replies:{id:number;error?:{code:string}}[]}).replies.find(reply => reply.id===9)?.error?.code)).toBe('HOST_UNAVAILABLE')
  await page.evaluate(() => window.harness.handle.cancel())
  expect(await page.evaluate(() => window.harness.calls.every(call=>call.aborted))).toBe(true)
})

test('evaluation failures before the handshake reject ready and remove the frame', async ({ page }) => {
  const code = await page.evaluate(async bundle => {
    try { await window.harness.mount(bundle); return 'ready' }
    catch (error) { return (error as {code:string}).code }
  }, ordinary + ';throw new Error("private evaluation failure")')
  expect(code).toBe('HOST_UNAVAILABLE')
  expect(await page.evaluate(() => window.harness.handle.state)).toBe('error')
  expect(await page.evaluate(() => JSON.stringify(window.harness.telemetry))).not.toContain('private evaluation failure')
  await expect(page.locator('iframe')).toHaveCount(0)
})
test('session creation works when secure-context randomUUID is unavailable', async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined }) })
  await page.evaluate(bundle => window.harness.mount(bundle), ordinary)
  expect(await page.evaluate(() => window.harness.handle.state)).toBe('ready')
  await page.evaluate(() => window.harness.handle.dispose())
})
