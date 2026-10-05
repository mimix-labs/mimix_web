import { connectSchema, hostMessageSchema, type Capability, type HostMessage, type RuntimeCall, type RuntimeCommand } from '@mimix/contracts'
import type { ChallengeContext, ChallengeFactory, ChallengeLifecycle } from '@mimix/challenge-sdk'
import { decode, runtimeError } from './policy.js'

declare global {
  var __mimixConfig: { session: string; parentOrigin: string }
  var MimixChallenge: { createChallenge: ChallengeFactory }
}
const { session, parentOrigin } = globalThis.__mimixConfig
const controller = new AbortController()
const capabilities: Capability[] = []
let port: MessagePort | undefined
let timeoutMs = 5000
let requestId = 0
let commandId = 0
let lifecycle: ChallengeLifecycle | undefined
let phase = 'created'
let busy = false
let faulted = false
const requests = new Map<number, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
const send = (message: object) => port?.postMessage(JSON.stringify({ v: 1, session, ...message }))
function abort() {
  controller.abort()
  for (const pending of requests.values()) {
    clearTimeout(pending.timer); pending.reject(runtimeError('ABORTED', 'Challenge ended.'))
  }
  requests.clear()
}
function request(method: RuntimeCall['method'], input: unknown): Promise<void> {
  if (!port || controller.signal.aborted) return Promise.reject(runtimeError('ABORTED', 'Bridge is unavailable.'))
  if (requests.size >= 8 || requestId >= 1000) return Promise.reject(runtimeError('HOST_UNAVAILABLE', 'Operation limit reached.'))
  return new Promise((resolve, reject) => {
    const id = ++requestId
    const timer = setTimeout(() => {
      requests.delete(id)
      reject(runtimeError('HOST_UNAVAILABLE', 'Host response timed out.'))
    }, timeoutMs + 100)
    requests.set(id, { resolve, reject, timer })
    send({ kind: 'call', id, method, input })
  })
}
const context: ChallengeContext = {
  capabilities, signal: controller.signal,
  mimix: {
    agent: { speak: input => request('agent.speak', input) },
    progress: { record: input => request('progress.record', input) },
    embodiment: { perform: input => request('embodiment.perform', input) },
  },
}
const transitions: Record<Exclude<RuntimeCommand, 'dispose'>, [string, string]> = {
  initialize: ['created', 'ready'], start: ['ready', 'running'], pause: ['running', 'paused'], resume: ['paused', 'running'],
}
async function command(message: Extract<HostMessage, { kind: 'command' }>) {
  if (busy || message.id !== commandId + 1 || (message.command !== 'dispose' && transitions[message.command][0] !== phase)) {
    send({ kind: 'ack', id: message.id, ok: false, error: { code: 'INVALID_LIFECYCLE', message: 'Invalid lifecycle command.' } }); return
  }
  commandId = message.id; busy = true
  try {
    if (message.command === 'initialize') {
      lifecycle = globalThis.MimixChallenge.createChallenge(context)
      for (const name of ['initialize', 'start', 'pause', 'resume', 'dispose'] as const) {
        if (typeof lifecycle[name] !== 'function') throw new Error('Missing lifecycle hook')
      }
    }
    if (message.command === 'dispose') abort()
    await lifecycle![message.command]()
    phase = message.command === 'dispose' ? 'disposed' : transitions[message.command][1]
    send({ kind: 'ack', id: message.id, ok: true })
  } catch {
    send({ kind: 'ack', id: message.id, ok: false, error: { code: 'HOST_UNAVAILABLE', message: 'Challenge hook failed.' } })
  } finally { busy = false }
}
function onMessage(event: MessageEvent) {
  const message = decode(hostMessageSchema, event.data)
  if (!message || message.session !== session) { abort(); port?.close(); return }
  if (message.kind === 'abort') { abort(); port?.close(); return }
  if (message.kind === 'grants') { capabilities.splice(0, capabilities.length, ...message.capabilities); return }
  if (message.kind === 'command') { void command(message); return }
  const pending = requests.get(message.id)
  if (!pending) return // A timed-out response must not revive its operation.
  requests.delete(message.id); clearTimeout(pending.timer)
  if (message.ok) pending.resolve()
  else pending.reject(runtimeError(message.error.code, message.error.message))
}
function connect(event: MessageEvent) {
  if (event.source !== parent || event.origin !== parentOrigin || port) return
  const message = decode(connectSchema, event.data)
  if (!message || message.session !== session || event.ports.length !== 1) return
  port = event.ports[0]; timeoutMs = message.timeoutMs
  window.removeEventListener('message', connect)
  if (faulted) { send({ kind: 'fault' }); return }
  capabilities.push(...message.capabilities)
  port.onmessage = onMessage
  port.onmessageerror = abort
}
window.addEventListener('message', connect)
window.addEventListener('load', () => parent.postMessage(JSON.stringify({ v: 1, session, kind: 'hello' }), parentOrigin), { once: true })
function fault() {
  if (controller.signal.aborted) return
  faulted = true
  abort()
  send({ kind: 'fault' })
}
window.addEventListener('error', fault)
window.addEventListener('unhandledrejection', fault)
