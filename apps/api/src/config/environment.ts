import { isAbsolute } from 'node:path'

export interface ApiConfig {
  dataStore: 'file' | 'postgres'
  databaseUrl: string
  authMode: 'legacy' | 'clerk'
  allowedOrigins: string[]
  rateLimits: { anonymous: number; user: number; machine: number; landmarks: number; legacy: number }
  identityFile: string
  clerk: { secretKey: string; jwtKey?: string; issuer: string; authorizedParties: string[] }
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
  const authMode = env.MIMIX_AUTH_MODE ?? 'legacy'
  if (authMode !== 'legacy' && authMode !== 'clerk') fail('MIMIX_AUTH_MODE')
  const origins = (value: string, field: string): string[] => {
    const entries = value.split(',').map(v => v.trim()).filter(Boolean)
    if (!entries.length) fail(field)
    for (const entry of entries) {
      try { const url = new URL(entry); if (!['https:', 'http:'].includes(url.protocol) || url.origin !== entry) fail(field) } catch { fail(field) }
    }
    return entries
  }
  const originText = env.MIMIX_ALLOWED_ORIGINS ?? (env.NODE_ENV === 'production' ? 'https://mimix-web-production.up.railway.app' : 'http://localhost:5173,http://localhost:4000')
  const allowedOrigins = origins(originText, 'MIMIX_ALLOWED_ORIGINS')
  const quota = (field: string, fallback: string): number => {
    const value = env[field] ?? fallback
    const limit = Number(value)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100000) fail(field)
    return limit
  }
  const rateLimits = {
    anonymous: quota('MIMIX_RATE_LIMIT_ANONYMOUS', '60'),
    user: quota('MIMIX_RATE_LIMIT_USER', '120'),
    machine: quota('MIMIX_RATE_LIMIT_MACHINE', '600'),
    landmarks: quota('MIMIX_RATE_LIMIT_LANDMARKS', '3600'),
    legacy: quota('MIMIX_RATE_LIMIT', '1200'),
  }
  const dataStore = env.MIMIX_DATA_STORE ?? 'file'
  if (dataStore !== 'file' && dataStore !== 'postgres') fail('MIMIX_DATA_STORE')
  const databaseUrl = env.DATABASE_URL ?? ''
  if (dataStore === 'postgres') {
    if (authMode !== 'clerk') fail('MIMIX_AUTH_MODE must be clerk for postgres')
    try { const url = new URL(databaseUrl); if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) fail('DATABASE_URL') } catch { fail('DATABASE_URL') }
  }
  const identityFile = env.MIMIX_IDENTITY_FILE ?? ''
  const clerk = { secretKey: env.CLERK_SECRET_KEY ?? '', jwtKey: env.CLERK_JWT_KEY, issuer: env.CLERK_ISSUER ?? '', authorizedParties: [] as string[] }
  if (authMode === 'clerk') {
    if (!clerk.secretKey.startsWith('sk_')) fail('CLERK_SECRET_KEY')
    if (dataStore === 'file' && !isAbsolute(identityFile)) fail('MIMIX_IDENTITY_FILE')
    try { const issuer = new URL(clerk.issuer); if (issuer.protocol !== 'https:' || issuer.origin !== clerk.issuer) fail('CLERK_ISSUER') } catch { fail('CLERK_ISSUER') }
    clerk.authorizedParties = origins(env.CLERK_AUTHORIZED_PARTIES ?? '', 'CLERK_AUTHORIZED_PARTIES')
  }
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
  return { dataStore: dataStore as ApiConfig['dataStore'], databaseUrl, authMode: authMode as ApiConfig['authMode'], allowedOrigins, rateLimits, identityFile, clerk, port, host, runtime: runtime as ApiConfig['runtime'], visionMode: visionMode as ApiConfig['visionMode'], videoUrl, bridgeToken, controlToken, logLevel: logLevel as ApiConfig['logLevel'] }
}

export function legacyEnvironment(config: ApiConfig): NodeJS.ProcessEnv {
  return {
    MIMIX_CORS_ORIGINS: config.allowedOrigins.join(','),
    MIMIX_VISION_MODE: config.visionMode,
    MIMIX_VISION_VIDEO_URL: config.videoUrl,
    MIMIX_ROBOT_BRIDGE_TOKEN: config.bridgeToken,
    MIMIX_ROBOT_CONTROL_TOKEN: config.controlToken,
  }
}
