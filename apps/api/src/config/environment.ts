export interface ApiConfig {
  port: number
  host: string
  runtime: 'nest' | 'express'
  visionMode: 'browser' | 'jetson'
  videoUrl: string
  bridgeToken: string
  controlToken: string
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
}
export const API_CONFIG = Symbol('API_CONFIG')

export function parseEnvironment(env: NodeJS.ProcessEnv): ApiConfig {
  const fail = (key: string): never => { throw new Error(`Invalid configuration: ${key}`) }
  const portText = env.PORT ?? '4000'
  const port = Number(portText)
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) fail('PORT')
  const host = env.HOST ?? '0.0.0.0'
  if (!host.trim() || host !== host.trim()) fail('HOST')
  const runtime = env.MIMIX_API_RUNTIME ?? 'nest'
  if (runtime !== 'nest' && runtime !== 'express') fail('MIMIX_API_RUNTIME')
  const visionMode = (env.MIMIX_VISION_MODE || 'browser').trim().toLowerCase()
  if (visionMode !== 'browser' && visionMode !== 'jetson') fail('MIMIX_VISION_MODE')
  const videoUrl = env.MIMIX_VISION_VIDEO_URL || 'http://127.0.0.1:8081/stream.mjpg'
  try {
    const parsed = new URL(videoUrl)
    if (parsed.protocol !== 'http:' || parsed.username || parsed.password) fail('MIMIX_VISION_VIDEO_URL')
  } catch { fail('MIMIX_VISION_VIDEO_URL') }
  const bridgeToken = env.MIMIX_ROBOT_BRIDGE_TOKEN || ''
  const controlToken = env.MIMIX_ROBOT_CONTROL_TOKEN || ''
  if (bridgeToken && bridgeToken === controlToken) fail('MIMIX_ROBOT_CONTROL_TOKEN must differ from bridge token')
  const logLevel = env.LOG_LEVEL ?? 'info'
  if (!['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(logLevel)) fail('LOG_LEVEL')
  return { port, host, runtime: runtime as ApiConfig['runtime'], visionMode: visionMode as ApiConfig['visionMode'], videoUrl, bridgeToken, controlToken, logLevel: logLevel as ApiConfig['logLevel'] }
}

export function legacyEnvironment(config: ApiConfig): NodeJS.ProcessEnv {
  return {
    MIMIX_VISION_MODE: config.visionMode,
    MIMIX_VISION_VIDEO_URL: config.videoUrl,
    MIMIX_ROBOT_BRIDGE_TOKEN: config.bridgeToken,
    MIMIX_ROBOT_CONTROL_TOKEN: config.controlToken,
  }
}
