import { mqttOptions, type MqttConfig } from '@mimix/robot-mqtt'
export type RobotControlConfig = { transport: 'legacy' } | { transport: 'mqtt'; mqtt: MqttConfig }
export function parseRobotEnvironment(env: NodeJS.ProcessEnv, devices: boolean): RobotControlConfig {
  const transport = env.MIMIX_ROBOT_TRANSPORT ?? 'legacy'
  if (transport === 'legacy') return { transport }
  if (transport !== 'mqtt' || !devices) throw new Error('Invalid configuration: MIMIX_ROBOT_TRANSPORT requires DeviceSessions')
  if (env.MIMIX_MQTT_ALLOW_LOOPBACK !== undefined && !['true', 'false'].includes(env.MIMIX_MQTT_ALLOW_LOOPBACK)) throw new Error('Invalid configuration: MIMIX_MQTT_ALLOW_LOOPBACK')
  const mqtt: MqttConfig = { url: env.MIMIX_MQTT_URL ?? '', username: 'mimix-backend', password: env.MIMIX_MQTT_PASSWORD ?? '',
    ca: env.MIMIX_MQTT_CA_PEM, allowLoopback: env.MIMIX_MQTT_ALLOW_LOOPBACK === 'true' }
  try { mqttOptions(mqtt) } catch { throw new Error('Invalid configuration: MQTT credentials or TLS URL') }
  return { transport, mqtt }
}
