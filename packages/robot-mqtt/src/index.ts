import { randomUUID } from 'node:crypto'
import mqtt, { type IClientOptions, type MqttClient, type IClientPublishOptions, type IPublishPacket } from 'mqtt'
import { GatewayGuard, parseRobotTopic, robotTopic, robotControlEnvelopeSchema, robotControlAckSchema, robotGatewayPresenceSchema,
  type GatewayOutput, type BehaviorIntent, type RobotControlEnvelope, type RobotControlTransport, type RobotTransportEvent } from '@mimix/robot-protocol'

export interface MqttConfig { url: string; username: string; password: string; ca?: string; allowLoopback?: boolean }
export function mqttOptions(config: MqttConfig): IClientOptions {
  try {
    const url = new URL(config.url)
    if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/') || !url.hostname
      || !config.username || !config.password || config.username.length > 128 || config.password.length > 4096
      || (url.protocol !== 'mqtts:' && !(url.protocol === 'mqtt:' && config.allowLoopback && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) throw new Error()
  } catch { throw new Error('Invalid MQTT configuration') }
  return { protocolVersion: 5, username: config.username, password: config.password, clientId: config.username,
    clean: true, properties: { sessionExpiryInterval: 0, maximumPacketSize: 8192 }, reconnectPeriod: 0,
    connectTimeout: 2000, keepalive: 2, queueQoSZero: false, resubscribe: false, rejectUnauthorized: true, ca: config.ca }
}
type Binding = { topics: string[]; will?: IClientOptions['will']; ready(): void; lost(): void; message(topic: string, payload: Buffer, packet: IPublishPacket): void }
/** Each reconnect discards MQTT.js' QoS1 store. Never resurrect an offline command. */
class Link {
  online = false
  private client?: MqttClient
  private retry?: ReturnType<typeof setTimeout>
  private closed = false
  private fail?: () => void
  constructor(private readonly config: MqttConfig, private readonly bind: () => Binding) { mqttOptions(config) }
  start(): void { if (!this.client && !this.closed && !this.retry) this.connect() }
  private connect(): void {
    const binding = this.bind(), client = mqtt.connect(this.config.url, { ...mqttOptions(this.config), will: binding.will })
    this.client = client
    let failed = false
    const fail = () => {
      if (failed) return
      failed = true; this.online = false; this.client = undefined
      binding.lost()
      // Force end destroys the stream and both stores; end(false) could flush stale output.
      client.end(true)
      if (!this.closed) { this.retry = setTimeout(() => { this.retry = undefined; this.connect() }, 500) }
    }
    this.fail = fail
    client.on('error', fail); client.on('close', fail); client.on('disconnect', fail)
    client.on('connect', () => {
      if (failed || this.closed) return
      client.subscribe(binding.topics, { qos: 1, rh: 2, rap: true }, (error, granted) => {
        if (error || !granted?.length || granted.some(item => item.qos > 1)) { fail(); return }
        if (failed || this.closed) return
        this.online = true; binding.ready()
      })
    })
    client.on('message', (topic, payload, packet) => { if (!failed && this.online) binding.message(topic, payload, packet) })
  }
  publish(topic: string, value: unknown, qos: 0 | 1, expiresAt = Date.now() + 500): Promise<void> {
    const client = this.client, fail = this.fail
    if (!this.online || !client || expiresAt <= Date.now()) return Promise.reject(new Error('MQTT unavailable'))
    const options: IClientPublishOptions = { qos, retain: false, properties: { messageExpiryInterval: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)) } }
    return new Promise((resolve, reject) => {
      let done = false
      const finish = (error?: Error | null) => {
        if (done) return
        done = true; clearTimeout(timer)
        if (error) { fail?.(); reject(new Error('MQTT delivery unknown')) } else resolve()
      }
      const timer = setTimeout(() => finish(new Error()), Math.max(1, Math.min(500, expiresAt - Date.now())))
      client.publish(topic, JSON.stringify(value), options, (error, packet) => {
        const reason = packet && 'reasonCode' in packet ? packet.reasonCode : undefined
        finish(error || (typeof reason === 'number' && reason >= 128 ? new Error() : undefined))
      })
    })
  }
  async close(): Promise<void> { this.closed = true; clearTimeout(this.retry); this.retry = undefined; this.fail?.() }
}
function json(payload: Buffer): unknown { if (payload.length > 8192) return null; try { return JSON.parse(payload.toString('utf8')) } catch { return null } }
export class BackendMqttTransport implements RobotControlTransport {
  private readonly link: Link
  private listener?: (event: RobotTransportEvent) => void
  get online(): boolean { return this.link.online }
  constructor(config: MqttConfig) {
    this.link = new Link(config, () => ({ topics: ['mimix/v1/devices/+/ack', 'mimix/v1/devices/+/presence'],
      ready: () => this.listener?.({ kind: 'connection', online: true }), lost: () => this.listener?.({ kind: 'connection', online: false }),
      message: (topic, payload, packet) => {
        const scope = parseRobotTopic(topic)
        if (!scope || packet.retain) return
        if (scope.channel === 'ack') {
          const parsed = robotControlAckSchema.safeParse(json(payload))
          if (packet.qos === 1 && parsed.success && parsed.data.sessionId === scope.sessionId) this.listener?.({ kind: 'ack', value: parsed.data })
        } else if (scope.channel === 'presence') {
          const parsed = robotGatewayPresenceSchema.safeParse(json(payload))
          if (parsed.success && parsed.data.sessionId === scope.sessionId) this.listener?.({ kind: 'presence', value: parsed.data })
        }
      },
    }))
  }
  start(listener: (event: RobotTransportEvent) => void): void { this.listener = listener; this.link.start() }
  publish(value: RobotControlEnvelope): Promise<void> {
    const parsed = robotControlEnvelopeSchema.parse(value)
    return this.link.publish(robotTopic(parsed.sessionId, 'intents'), parsed, 1, parsed.intent.expiresAt)
  }
  close(): Promise<void> { return this.link.close() }
}
export interface MqttGatewayConfig extends MqttConfig { sessionId: string; deviceId: string; behaviors: BehaviorIntent['behavior'][] }
export class MqttGateway {
  private readonly link: Link
  private timer?: ReturnType<typeof setInterval>
  get online(): boolean { return this.link.online }
  constructor(config: MqttGatewayConfig, output: GatewayOutput) {
    if (config.username !== config.sessionId) throw new Error('Gateway username must be its DeviceSession ID')
    // Validate identifiers and behavior list before opening a socket.
    robotTopic(config.sessionId, 'intents')
    robotGatewayPresenceSchema.parse({ schemaVersion: 1, sessionId: config.sessionId, deviceId: config.deviceId, connectionId: randomUUID(), sequence: 1, issuedAt: Date.now(), state: 'online' })
    this.link = new Link(config, () => {
      const connectionId = randomUUID(), guard = new GatewayGuard({ ...config, connectionId, output })
      let sequence = 0
      const presence = (state: 'online' | 'offline') => ({ schemaVersion: 1 as const, sessionId: config.sessionId, deviceId: config.deviceId, connectionId, sequence: ++sequence, state, issuedAt: Date.now() })
      const sendPresence = () => { void this.link.publish(robotTopic(config.sessionId, 'presence'), presence('online'), 0).catch(() => {}) }
      return { topics: [robotTopic(config.sessionId, 'intents')],
        will: { topic: robotTopic(config.sessionId, 'presence'), payload: JSON.stringify(presence('offline')), qos: 0, retain: false, properties: { messageExpiryInterval: 1 } },
        ready: () => { sendPresence(); this.timer = setInterval(sendPresence, 1000); this.timer.unref() },
        lost: () => { clearInterval(this.timer); this.timer = undefined; guard.disconnect() },
        message: (topic, payload, packet) => {
          if (topic !== robotTopic(config.sessionId, 'intents')) return
          const ack = guard.receive(packet.qos === 1 ? json(payload) : null, packet.retain)
          if (ack) void this.link.publish(robotTopic(config.sessionId, 'ack'), ack, 1).catch(() => {})
        },
      }
    })
  }
  start(): void { this.link.start() }
  close(): Promise<void> { return this.link.close() }
}
