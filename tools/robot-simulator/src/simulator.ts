import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import {
  bridgeHeaders, legacyContextSchema, legacyNavigationSchema, legacyHandFrameSchema,
  parseLegacyMotion, robotPresenceSchema, type LegacyMotion, type RobotPresence,
} from '@mimix/robot-protocol'
import { SseParser } from './sse.js'

export interface SimulatorOptions {
  baseUrl?: string
  bridgeToken?: string
  deviceId?: string
  latencyMs?: number
  failRequests?: number
  dropAfterEvents?: number
  reconnectMs?: number
  timeoutMs?: number
}
export type SimulatorEvent =
  | { type: 'connected'; connectionId: string }
  | { type: 'motion'; command: LegacyMotion }
  | { type: 'rejected'; reason: 'invalid-or-expired-motion' }
  | { type: 'stop'; reason: 'disconnected' | 'shutdown' }
  | { type: 'retrying'; attempt: number; reason: string }

function integer(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid simulator scenario')
  return value
}

/** Robot-side contract client. Records commands; never maps them to hardware. */
export class RobotSimulator {
  private readonly baseUrl: string
  private readonly token: string
  private readonly deviceId: string
  private readonly latency: number
  private failures: number
  private readonly dropAfter: number
  private readonly reconnect: number
  private readonly timeout: number
  private running = false
  private connectionId = randomUUID()
  private sequence = 0
  private observation!: RobotPresence

  constructor(options: SimulatorOptions = {}) {
    const url = new URL(options.baseUrl ?? 'http://127.0.0.1:4000')
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use an HTTPS origin or local loopback HTTP origin without credentials')
    this.baseUrl = url.origin
    this.token = options.bridgeToken ?? ''
    bridgeHeaders(this.token)
    this.deviceId = options.deviceId ?? 'robot-simulator-001'
    this.latency = integer(options.latencyMs ?? 0, 0, 60000)
    this.failures = integer(options.failRequests ?? 0, 0, 10000)
    this.dropAfter = integer(options.dropAfterEvents ?? 0, 0, 100000)
    this.reconnect = integer(options.reconnectMs ?? 1000, 1, 60000)
    this.timeout = integer(options.timeoutMs ?? 30000, 1, 120000)
    this.observe('offline')
  }

  /** Local receiver-clock observation, not wire presence or lease authority. */
  get presence(): RobotPresence { return { ...this.observation } }
  private observe(state: RobotPresence['state']): void {
    const now = Date.now()
    this.observation = robotPresenceSchema.parse({ schemaVersion: 1, deviceId: this.deviceId, connectionId: this.connectionId, sequence: ++this.sequence, state, observedAt: now, expiresAt: now + Math.min(this.timeout, 60000) })
  }
  private async beforeRequest(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (this.latency) await delay(this.latency, undefined, { signal })
    if (this.failures > 0) { this.failures--; throw new Error('Injected request failure') }
  }
  private async json(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const bounded = AbortSignal.any([AbortSignal.timeout(this.timeout), ...(signal ? [signal] : [])])
    await this.beforeRequest(bounded)
    let response: Response
    try {
      response = await fetch(this.baseUrl + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...bridgeHeaders(this.token), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: bounded, redirect: 'error',
      })
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Robot HTTP ${response.status}`) }
      return await response.json()
    } catch (error) {
      // Never expose remote bodies, URLs, credentials or fetch causes.
      if (error instanceof Error && /^Robot HTTP \d{3}$/.test(error.message)) throw error
      // eslint-disable-next-line preserve-caught-error -- Fetch causes may contain credential-bearing diagnostics.
      throw new Error('Robot request failed')
    }
  }
  async getContext(signal?: AbortSignal) {
    return legacyContextSchema.parse(await this.json('/api/robot/context', undefined, signal))
  }
  async navigate(destination: string, signal?: AbortSignal) {
    return this.json('/api/robot/commands', legacyNavigationSchema.parse({ action: 'navigate_to', destination }), signal)
  }
  async publishHands(frame: unknown, signal?: AbortSignal) {
    return this.json('/api/vision/hand-landmarks', legacyHandFrameSchema.parse(frame), signal)
  }

  async run(signal: AbortSignal, emit: (event: SimulatorEvent) => void): Promise<void> {
    if (this.running) throw new Error('Simulator already running')
    this.running = true
    let attempt = 0
    try {
      while (!signal.aborted) {
        let reason = 'stream-disconnected'
        try { await this.consume(signal, emit) } catch (error) {
          if (error instanceof Error && error.message === 'Injected request failure') reason = 'injected-failure'
          else reason = 'stream-unavailable'
        }
        if (signal.aborted) break
        this.observe('degraded')
        emit({ type: 'stop', reason: 'disconnected' })
        emit({ type: 'retrying', attempt: ++attempt, reason })
        try { await delay(this.reconnect, undefined, { signal }) } catch { break }
      }
    } finally {
      this.running = false
      this.observe('offline')
      emit({ type: 'stop', reason: 'shutdown' })
    }
  }

  private async consume(signal: AbortSignal, emit: (event: SimulatorEvent) => void): Promise<void> {
    const idle = new AbortController()
    const active = AbortSignal.any([signal, idle.signal])
    let timer = setTimeout(() => idle.abort(), this.timeout)
    const touch = () => { clearTimeout(timer); timer = setTimeout(() => idle.abort(), this.timeout) }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      await this.beforeRequest(active)
      const response = await fetch(this.baseUrl + '/api/robot/motion/stream', { headers: bridgeHeaders(this.token, true), signal: active, redirect: 'error' })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) {
        await response.body?.cancel()
        throw new Error('Invalid robot stream')
      }
      reader = response.body.getReader()
      // Transport failure must cancel a delivery already waiting on injected latency.
      void reader.closed.catch(() => idle.abort())
      this.connectionId = randomUUID()
      this.observe('online')
      emit({ type: 'connected', connectionId: this.connectionId })
      const parser = new SseParser()
      const decoder = new TextDecoder()
      let delivered = 0
      while (!active.aborted) {
        const chunk = await reader.read()
        if (chunk.done) return
        touch()
        this.observe('online')
        for (const event of parser.push(decoder.decode(chunk.value, { stream: true }))) {
          if (event.event !== 'robot-motion') continue
          if (this.latency) await delay(this.latency, undefined, { signal: active })
          active.throwIfAborted()
          let command: LegacyMotion
          try { command = parseLegacyMotion(JSON.parse(event.data), Date.now()) } catch {
            emit({ type: 'rejected', reason: 'invalid-or-expired-motion' }); continue
          }
          emit({ type: 'motion', command })
          if (this.dropAfter && ++delivered >= this.dropAfter) return
        }
      }
    } finally {
      clearTimeout(timer)
      idle.abort()
      await reader?.cancel().catch(() => {})
    }
  }
}
