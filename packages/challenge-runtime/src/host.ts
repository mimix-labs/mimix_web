import { childMessageSchema, helloSchema, type Capability, type ChallengeError, type HostMessage, type RuntimeCall, type RuntimeCommand } from '@mimix/contracts'
import { validateManifest } from '@mimix/challenge-sdk'
import { createFrame } from './frame.js'
import { decode, resolveGrants, runtimeError, validateBundle } from './policy.js'
import type { RuntimeHandle, RuntimeOptions, RuntimeState, RuntimeTelemetry } from './types.js'

const methodCapability = { 'agent.speak': 'agent', 'progress.record': 'progress', 'embodiment.perform': 'embodiment' } as const
const terminal = (state: RuntimeState) => ['disposed', 'cancelled', 'error'].includes(state)
const active = (state: RuntimeState) => ['starting', 'running', 'resuming'].includes(state)

export function mountChallenge(options: RuntimeOptions): RuntimeHandle {
  const validated = validateManifest(options.manifest)
  if (!validated.ok) throw runtimeError(validated.error.code, validated.error.message)
  const manifest = validated.manifest
  validateBundle(options.bundle)
  const timeoutMs = options.timeoutMs ?? 5000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30000 || !/^https?:\/\//.test(location.origin)
    || options.container.ownerDocument !== document || !options.container.isConnected) {
    throw runtimeError('INVALID_INPUT', 'Expected a connected host container, HTTP(S) origin and bounded timeout.')
  }
  const adapters = { ...options.adapters }
  const available = (Object.keys(methodCapability) as RuntimeCall['method'][]).filter(method => typeof adapters[method] === 'function').map(method => methodCapability[method])
  const grants = new Set(resolveGrants(manifest, options.approvedCapabilities, available))
  const session = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  const frame = createFrame(options.bundle, session, location.origin)
  let state: RuntimeState = 'loading'
  let port: MessagePort | undefined
  let commandId = 0
  let lastCall = 0
  let loads = 0
  let pending: { id: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined
  const operations = new Map<number, { capability: Capability; cancel: (code: ChallengeError['code']) => void }>()
  let resolveReady!: () => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  void ready.catch(() => {})
  let disposing: Promise<void> | undefined
  const emit = (event: Omit<RuntimeTelemetry, 'state'>) => {
    try { options.onTelemetry?.({ ...event, state }) } catch { /* Observers cannot change control flow. */ }
  }
  const setState = (next: RuntimeState) => { state = next; emit({ event: 'state' }) }
  const send = (message: HostMessage) => { port?.postMessage(JSON.stringify(message)) }
  const abortOperations = (code: ChallengeError['code'], capability?: Capability) => {
    for (const operation of [...operations.values()]) if (!capability || operation.capability === capability) operation.cancel(code)
  }
  const finish = (next: 'disposed' | 'cancelled' | 'error', error = runtimeError('ABORTED', 'Challenge ended.')) => {
    if (terminal(state)) return
    setState(next)
    clearTimeout(loadTimer)
    window.removeEventListener('message', onHello)
    frame.removeEventListener('load', onLoad)
    options.signal?.removeEventListener('abort', cancel)
    observer.disconnect()
    if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = undefined }
    abortOperations('ABORTED')
    try { send({ v: 1, session, kind: 'abort' }) } catch { /* Channel may already be detached. */ }
    if (port) { port.onmessage = null; port.onmessageerror = null; port.close() }
    frame.remove()
    rejectReady(error)
  }
  const fail = (code: ChallengeError['code'], message: string) => finish('error', runtimeError(code, message))
  function cancel() { finish('cancelled') }
  const loadTimer = setTimeout(() => { emit({ event: 'timeout', code: 'HOST_UNAVAILABLE' }); fail('HOST_UNAVAILABLE', 'Challenge loading timed out.') }, timeoutMs)
  const observer = new MutationObserver(() => { if (!frame.isConnected) cancel() })
  function onLoad() {
    if (++loads > 1) { emit({ event: 'rejected', code: 'INVALID_INPUT' }); fail('INVALID_INPUT', 'Challenge navigation invalidated the session.') }
  }
  function hook(command: RuntimeCommand): Promise<void> {
    return new Promise((resolve, reject) => {
      if (pending || terminal(state)) { reject(runtimeError('INVALID_LIFECYCLE', 'A lifecycle transition is already pending or the instance ended.')); return }
      const id = ++commandId
      pending = { id, resolve, reject, timer: setTimeout(() => {
        pending = undefined
        emit({ event: 'timeout', code: 'HOST_UNAVAILABLE' })
        reject(runtimeError('HOST_UNAVAILABLE', 'Challenge hook timed out.'))
      }, timeoutMs) }
      send({ v: 1, session, kind: 'command', id, command })
    })
  }
  async function transition(command: RuntimeCommand, expected: RuntimeState, during: RuntimeState, after: RuntimeState) {
    if (state !== expected) throw runtimeError('INVALID_LIFECYCLE', 'Lifecycle command is out of order.')
    setState(during)
    if (terminal(state)) throw runtimeError('ABORTED', 'Challenge ended.')
    if (command === 'pause') abortOperations('ABORTED')
    try {
      await hook(command)
      if (terminal(state)) throw runtimeError('ABORTED', 'Challenge ended.')
      setState(after)
    } catch (error) {
      if (!terminal(state)) fail('HOST_UNAVAILABLE', 'Challenge hook failed.')
      throw error
    }
  }
  function call(message: RuntimeCall) {
    if (message.id !== lastCall + 1 || message.id > 1000) { fail('INVALID_INPUT', 'Invalid or exhausted operation sequence.'); return }
    lastCall = message.id
    const capability = methodCapability[message.method]
    const respond = (code?: ChallengeError['code']) => {
      if (terminal(state)) return
      send(code ? { v: 1, session, kind: 'result', id: message.id, ok: false, error: { code, message: 'Operation could not be completed.' } }
        : { v: 1, session, kind: 'result', id: message.id, ok: true })
    }
    if (!grants.has(capability)) { emit({ event: 'denied', code: 'CAPABILITY_DENIED', method: message.method }); respond('CAPABILITY_DENIED'); return }
    if (!active(state)) { respond('INVALID_LIFECYCLE'); return }
    if (operations.size >= 8) { respond('HOST_UNAVAILABLE'); return }
    const controller = new AbortController()
    let settled = false
    const settle = (code?: ChallengeError['code']) => {
      if (settled) return
      settled = true; clearTimeout(timer); operations.delete(message.id)
      if (code) controller.abort()
      respond(code)
    }
    const timer = setTimeout(() => {
      emit({ event: 'timeout', code: 'HOST_UNAVAILABLE', method: message.method }); settle('HOST_UNAVAILABLE')
    }, timeoutMs)
    operations.set(message.id, { capability, cancel: settle })
    const context = { signal: controller.signal, requestId: `${session}:${message.id}` }
    // Dispatch the discriminated union explicitly so payload types never widen.
    Promise.resolve().then(() => {
      if (settled || !active(state) || !grants.has(capability)) return
      emit({ event: 'operation', method: message.method })
      if (settled || !active(state) || !grants.has(capability)) return
      switch (message.method) {
        case 'agent.speak': return adapters['agent.speak']!(message.input, context)
        case 'progress.record': return adapters['progress.record']!(message.input, context)
        case 'embodiment.perform': return adapters['embodiment.perform']!(message.input, context)
      }
    }).then(() => settle(), () => settle('HOST_UNAVAILABLE'))
  }
  function onMessage(event: MessageEvent) {
    if (terminal(state)) return
    const message = decode(childMessageSchema, event.data)
    if (!message || message.session !== session) { emit({ event: 'rejected', code: 'INVALID_INPUT' }); fail('INVALID_INPUT', 'Invalid bridge message.'); return }
    if (message.kind === 'call') { call(message); return }
    if (message.kind === 'fault') { if (state !== 'disposing') fail('HOST_UNAVAILABLE', 'Challenge execution failed.'); return }
    if (!pending || message.id !== pending.id) { fail('INVALID_LIFECYCLE', 'Unexpected lifecycle acknowledgement.'); return }
    const current = pending; pending = undefined; clearTimeout(current.timer)
    if (message.ok) current.resolve()
    else current.reject(runtimeError(message.error.code, 'Challenge hook failed.'))
  }
  function onHello(event: MessageEvent) {
    if (event.source !== frame.contentWindow || terminal(state)) return
    const hello = decode(helloSchema, event.data)
    if (event.origin !== 'null' || !hello || hello.session !== session || port) {
      emit({ event: 'rejected', code: 'INVALID_INPUT' }); fail('INVALID_INPUT', 'Invalid challenge handshake.'); return
    }
    window.removeEventListener('message', onHello)
    clearTimeout(loadTimer)
    const channel = new MessageChannel(); port = channel.port1
    port.onmessage = onMessage
    port.onmessageerror = () => fail('INVALID_INPUT', 'Unreadable bridge message.')
    frame.contentWindow!.postMessage(JSON.stringify({ v: 1, session, kind: 'connect', capabilities: [...grants], timeoutMs }), '*', [channel.port2])
    setState('initializing')
    void hook('initialize').then(() => { if (!terminal(state)) { setState('ready'); resolveReady() } }, () => fail('HOST_UNAVAILABLE', 'Challenge initialization failed.'))
  }
  const handle: RuntimeHandle = {
    ready, get state() { return state },
    start: () => transition('start', 'ready', 'starting', 'running'),
    pause: () => transition('pause', 'running', 'pausing', 'paused'),
    resume: () => transition('resume', 'paused', 'resuming', 'running'),
    cancel,
    revoke(capability) {
      if (terminal(state) || !grants.delete(capability)) return
      if (manifest.capabilities.required.includes(capability)) { cancel(); return }
      abortOperations('CAPABILITY_DENIED', capability)
      send({ v: 1, session, kind: 'grants', capabilities: [...grants] })
    },
    dispose() {
      if (disposing) return disposing
      if (terminal(state)) return Promise.resolve()
      if (!['ready','running','paused'].includes(state)) { cancel(); return Promise.resolve() }
      setState('disposing'); abortOperations('ABORTED')
      disposing = hook('dispose').then(() => finish('disposed'), error => { finish('error'); throw error })
      return disposing
    },
  }
  window.addEventListener('message', onHello)
  frame.addEventListener('load', onLoad)
  options.container.append(frame)
  observer.observe(document, { childList: true, subtree: true })
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) cancel()
  else emit({ event: 'state' })
  return handle
}
