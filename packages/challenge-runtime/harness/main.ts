import * as runtime from '../dist/index.js'
import type { RuntimeHandle, RuntimeTelemetry, HostAdapters } from '../src/types.js'
import type { Capability, ChallengeManifest } from '@mimix/contracts'
const calls: { method: string; input: unknown; aborted: boolean }[] = []
const telemetry: RuntimeTelemetry[] = []
let handle: RuntimeHandle | undefined
const manifest: ChallengeManifest = await (await fetch('/manifest.json')).json()
const fixture = await (await fetch('/fixture.js')).text()
const show = () => {
  document.querySelector('#state')!.textContent = handle?.state ?? 'sin cargar'
  document.querySelector('#events')!.textContent = JSON.stringify({ calls, telemetry }, null, 2)
}
const harness = {
  calls, telemetry, manifest, fixture,
  get handle() { return handle! },
  async mount(bundle = fixture, options: { approved?: Capability[]; manifest?: ChallengeManifest; timeoutMs?: number; slow?: boolean; cancelOnOperation?: boolean; signal?: AbortSignal } = {}) {
    handle?.cancel(); calls.length = 0; telemetry.length = 0
    const record: NonNullable<HostAdapters['agent.speak']> = async (input, context) => {
      const call = { method: 'agent.speak', input, aborted: false }; calls.push(call)
      context.signal.addEventListener('abort', () => { call.aborted = true }, { once: true })
      if (options.slow) await new Promise<void>(resolve => setTimeout(resolve, 1500))
    }
    const adapters: HostAdapters = {
      'agent.speak': record,
      'progress.record': async input => { calls.push({ method: 'progress.record', input, aborted: false }) },
      'embodiment.perform': async input => { calls.push({ method: 'embodiment.perform', input, aborted: false }) },
    }
    handle = runtime.mountChallenge({
      container: document.querySelector('#frame')!, manifest: options.manifest ?? manifest, bundle,
      approvedCapabilities: options.approved ?? ['progress', 'agent', 'embodiment'], adapters,
      timeoutMs: options.timeoutMs ?? 1000, signal: options.signal,
      onTelemetry(event) { telemetry.push(event); show(); if (options.cancelOnOperation && event.event === 'operation') handle?.cancel() },
    })
    show()
    try { await handle.ready } finally { show() }
  },
}
Object.assign(window, { harness })
declare global { interface Window { harness: typeof harness } }
for (const action of ['load', 'start', 'pause', 'resume', 'cancel'] as const) {
  document.getElementById(action)!.addEventListener('click', () => {
    Promise.resolve().then(() => action === 'load' ? harness.mount() : handle?.[action]()).catch(() => {}).finally(show)
  })
}
