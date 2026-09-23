import express from 'express'
import cors from 'cors'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 4000
const HOST = process.env.HOST || '0.0.0.0'
const CLIENT_DIST = fileURLToPath(new URL('../../client/dist/', import.meta.url))
const VISION_FRAME_MAX_AGE_MS = 5000
const SUPPORTED_VISION_MODES = new Set(['browser', 'jetson'])

const visionMode = (process.env.MIMIX_VISION_MODE || 'browser').trim().toLowerCase()
if (!SUPPORTED_VISION_MODES.has(visionMode)) {
  throw new Error(
    `Invalid MIMIX_VISION_MODE "${process.env.MIMIX_VISION_MODE}". Use "browser" or "jetson".`,
  )
}

const visionClients = new Set()
const robotCommandClients = new Set()
const robotMotionClients = new Set()
let latestHandLandmarks = null
let latestRobotContext = {
  page: 'world',
  challenge: null,
  selectedObject: null,
  updatedAt: Date.now(),
}

const ROBOT_BRIDGE_TOKEN = process.env.MIMIX_ROBOT_BRIDGE_TOKEN || ''
const ROBOT_CONTROL_TOKEN = process.env.MIMIX_ROBOT_CONTROL_TOKEN || ''
const ALLOWED_DESTINATIONS = new Set(['world', 'mathematics', 'science'])
const ALLOWED_CHALLENGES = new Set(['mathematics', 'science'])
const ALLOWED_MOTION_ACTIONS = new Set(['forward', 'backward', 'left', 'right', 'stop'])
const MOTION_DURATION_MS = 300
// Railway -> Jetson can take longer than the motor pulse itself. This TTL only
// limits how long an SSE event may spend in transit; it never extends motor run time.
const MOTION_EVENT_TTL_MS = 3000
const MOTION_LEASE_MS = 1200
const controllerSequences = new Map()
let motionLease = { controllerId: null, expiresAt: 0 }

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', project: 'mimix' })
})

// El modo de visión pertenece al despliegue, no al estado temporal de la
// cámara. En laptop el valor por defecto es browser; la Jetson debe iniciar el
// backend con MIMIX_VISION_MODE=jetson.
app.get('/api/vision/config', (_req, res) => {
  res.json({ mode: visionMode })
})

// Canal local entre la visión nativa de la Jetson y la interfaz web. No se
// transmite vídeo: únicamente los 21 puntos normalizados de cada mano.
function sendVisionEvent(res, event, payload) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcastVisionEvent(event, payload) {
  for (const client of visionClients) {
    sendVisionEvent(client, event, payload)
  }
}

function sendRobotCommand(res, command) {
  res.write('event: robot-command\n')
  res.write(`data: ${JSON.stringify(command)}\n\n`)
}

function sendRobotMotion(res, command) {
  res.write('event: robot-motion\n')
  res.write(`data: ${JSON.stringify(command)}\n\n`)
}

function startSseHeartbeat(res) {
  return setInterval(() => res.write(': keepalive\n\n'), 15000)
}

function requireRobotBridge(req, res, next) {
  // En desarrollo local puede omitirse el token. En una red compartida debe
  // configurarse para que solo mimix_robot pueda ordenar la interfaz.
  if (!ROBOT_BRIDGE_TOKEN || req.get('X-Mimix-Robot-Token') === ROBOT_BRIDGE_TOKEN) {
    return next()
  }
  return res.status(401).json({ error: 'invalid robot bridge token' })
}

function requireConfiguredRobotBridge(req, res, next) {
  if (!ROBOT_BRIDGE_TOKEN) {
    return res.status(503).json({ error: 'robot bridge is not configured' })
  }
  if (req.get('X-Mimix-Robot-Token') !== ROBOT_BRIDGE_TOKEN) {
    return res.status(401).json({ error: 'invalid robot bridge token' })
  }
  return next()
}

function requireRobotControl(req, res, next) {
  if (!ROBOT_BRIDGE_TOKEN || !ROBOT_CONTROL_TOKEN) {
    return res.status(503).json({ error: 'remote robot control is disabled' })
  }
  if (req.get('X-Mimix-Control-Token') !== ROBOT_CONTROL_TOKEN) {
    return res.status(401).json({ error: 'invalid robot control token' })
  }
  return next()
}

app.post('/api/vision/hand-landmarks', (req, res) => {
  const { landmarks, handedness, timestamp, source } = req.body ?? {}

  if (!Array.isArray(landmarks) || !Array.isArray(handedness)) {
    return res.status(400).json({ error: 'landmarks and handedness are required' })
  }

  const receivedAt = Date.now()
  latestHandLandmarks = {
    landmarks,
    handedness,
    // La frescura siempre se calcula con el reloj del servidor. El timestamp
    // del productor se conserva solo como dato de diagnóstico.
    timestamp: receivedAt,
    producerTimestamp: Number.isFinite(timestamp) ? timestamp : null,
    receivedAt,
    source: source || 'jetson-native',
  }
  broadcastVisionEvent('hand-landmarks', latestHandLandmarks)
  return res.status(202).json({ accepted: true })
})

app.get('/api/vision/stream', (req, res) => {
  res.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
  })
  res.flushHeaders()
  res.write('retry: 2000\n\n')
  visionClients.add(res)

  if (
    latestHandLandmarks &&
    Date.now() - latestHandLandmarks.receivedAt < VISION_FRAME_MAX_AGE_MS
  ) {
    sendVisionEvent(res, 'hand-landmarks', latestHandLandmarks)
  }

  req.on('close', () => visionClients.delete(res))
})

app.get('/api/vision/status', (_req, res) => {
  res.json({
    mode: visionMode,
    connectedClients: visionClients.size,
    lastFrameAt: latestHandLandmarks?.receivedAt ?? null,
    producerTimestamp: latestHandLandmarks?.producerTimestamp ?? null,
    source: latestHandLandmarks?.source ?? null,
  })
})

// Estado pedagógico mínimo que Mimix Web comparte con el guía de voz. No se
// almacenan landmarks, video, nombres ni datos sensibles del estudiante.
app.post('/api/robot/context', (req, res) => {
  const { page, challenge = null, selectedObject = null } = req.body ?? {}
  if (!['world', 'challenge'].includes(page)) {
    return res.status(400).json({ error: 'page must be world or challenge' })
  }
  if (challenge !== null && !ALLOWED_CHALLENGES.has(challenge)) {
    return res.status(400).json({ error: 'unsupported challenge' })
  }
  if (selectedObject !== null && (typeof selectedObject !== 'string' || selectedObject.length > 80)) {
    return res.status(400).json({ error: 'invalid selectedObject' })
  }

  latestRobotContext = {
    page,
    challenge,
    selectedObject,
    updatedAt: Date.now(),
  }
  return res.status(202).json({ accepted: true, context: latestRobotContext })
})

app.get('/api/robot/context', requireRobotBridge, (_req, res) => {
  res.json(latestRobotContext)
})

// El agente solo puede solicitar destinos de aprendizaje conocidos. El
// navegador es quien ejecuta la navegación tras recibir este evento SSE.
app.post('/api/robot/commands', requireRobotBridge, (req, res) => {
  const { action, destination } = req.body ?? {}
  if (action !== 'navigate_to' || !ALLOWED_DESTINATIONS.has(destination)) {
    return res.status(400).json({ error: 'unsupported robot command' })
  }
  if (robotCommandClients.size === 0) {
    return res.status(409).json({ error: 'no active Mimix Web client' })
  }

  const command = {
    id: randomUUID(),
    action,
    destination,
    issuedAt: Date.now(),
  }
  for (const client of robotCommandClients) {
    sendRobotCommand(client, command)
  }
  return res.status(202).json({
    accepted: true,
    message: `Navigation command sent to ${destination}`,
    command,
  })
})

app.get('/api/robot/commands/stream', (req, res) => {
  res.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
  })
  res.flushHeaders()
  res.write('retry: 2000\n\n')
  robotCommandClients.add(res)
  req.on('close', () => robotCommandClients.delete(res))
})

app.get('/api/robot/status', (_req, res) => {
  res.json({
    connectedWebClients: robotCommandClients.size,
    connectedMotionRobots: robotMotionClients.size,
    remoteControlEnabled: Boolean(ROBOT_BRIDGE_TOKEN && ROBOT_CONTROL_TOKEN),
    context: latestRobotContext,
    bridgeTokenRequired: Boolean(ROBOT_BRIDGE_TOKEN),
  })
})

// Control remoto acotado: el navegador envía intenciones, nunca PWM ni pulsos.
// Cada pulso mueve como máximo 300 ms y debe renovarse mientras la tecla siga
// pulsada. El sobre SSE dispone de un margen separado para atravesar Internet.
app.post('/api/robot/motion', requireRobotControl, (req, res) => {
  const { action, controllerId, sequence } = req.body ?? {}
  if (!ALLOWED_MOTION_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'unsupported motion action' })
  }
  if (typeof controllerId !== 'string' || controllerId.length < 8 || controllerId.length > 80) {
    return res.status(400).json({ error: 'invalid controllerId' })
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    return res.status(400).json({ error: 'invalid sequence' })
  }

  const previousSequence = controllerSequences.get(controllerId) ?? 0
  if (sequence <= previousSequence) {
    return res.status(202).json({ accepted: true, stale: true })
  }
  controllerSequences.set(controllerId, sequence)
  if (controllerSequences.size > 1000) {
    controllerSequences.delete(controllerSequences.keys().next().value)
  }

  const now = Date.now()
  const leaseActive = motionLease.controllerId && motionLease.expiresAt > now
  if (action !== 'stop' && leaseActive && motionLease.controllerId !== controllerId) {
    return res.status(423).json({ error: 'robot is controlled by another session' })
  }
  if (robotMotionClients.size !== 1) {
    return res.status(409).json({
      error: robotMotionClients.size === 0
        ? 'robot is not connected'
        : 'multiple robots connected; refusing ambiguous motion',
    })
  }

  motionLease = action === 'stop'
    ? { controllerId: null, expiresAt: 0 }
    : { controllerId, expiresAt: now + MOTION_LEASE_MS }

  const command = {
    id: randomUUID(),
    action,
    maxDurationMs: action === 'stop' ? 100 : MOTION_DURATION_MS,
    issuedAt: now,
    expiresAt: now + MOTION_EVENT_TTL_MS,
  }
  for (const client of robotMotionClients) sendRobotMotion(client, command)
  return res.status(202).json({ accepted: true, command })
})

app.get('/api/robot/motion/stream', requireConfiguredRobotBridge, (req, res) => {
  res.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
  })
  res.flushHeaders()
  res.write('retry: 1000\n\n')
  robotMotionClients.add(res)
  const heartbeat = startSseHeartbeat(res)

  req.on('close', () => {
    clearInterval(heartbeat)
    robotMotionClients.delete(res)
    motionLease = { controllerId: null, expiresAt: 0 }
  })
})

app.get('/api/vision/video', (req, res) => {
  const videoUrl = new URL(
    process.env.MIMIX_VISION_VIDEO_URL || 'http://127.0.0.1:8081/stream.mjpg',
  )
  const upstream = http.get(videoUrl, (videoResponse) => {
    res.status(videoResponse.statusCode || 502)
    res.setHeader(
      'Content-Type',
      videoResponse.headers['content-type'] || 'multipart/x-mixed-replace',
    )
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    videoResponse.pipe(res)
  })

  upstream.on('error', (error) => {
    if (!res.headersSent) {
      res.status(503).json({ error: `vision video unavailable: ${error.message}` })
    } else {
      res.end()
    }
  })
  res.on('close', () => upstream.destroy())
})

// Punto de integración para los retos internos. Por ahora registra eventos
// de aprendizaje; más adelante puede enrutar eventos al adaptador del robot.
app.post('/api/challenges/events', (req, res) => {
  const { challenge, type, payload = {} } = req.body ?? {}

  if (!challenge || !type) {
    return res.status(400).json({ error: 'challenge and type are required' })
  }

  console.log('[challenge-event]', { challenge, type, payload })
  return res.status(202).json({ accepted: true })
})

// En producción Express sirve el build de Vite. En desarrollo Vite continúa
// ejecutándose por separado y redirige /api al puerto del backend.
app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets'), {
  immutable: true,
  maxAge: '1y',
}))
app.use(express.static(CLIENT_DIST, {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
  },
}))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  return res.sendFile(path.join(CLIENT_DIST, 'index.html'))
})

const server = app.listen(PORT, HOST, () => {
  console.log(`Mimix server running on http://${HOST}:${PORT} (vision: ${visionMode})`)
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
