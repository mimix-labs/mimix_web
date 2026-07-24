import express from 'express'
import cors from 'cors'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 4000
const visionClients = new Set()
const robotCommandClients = new Set()
let latestHandLandmarks = null
let latestRobotContext = {
  page: 'world',
  challenge: null,
  selectedObject: null,
  updatedAt: Date.now(),
}

const ROBOT_BRIDGE_TOKEN = process.env.MIMIX_ROBOT_BRIDGE_TOKEN || ''
const ALLOWED_DESTINATIONS = new Set(['world', 'mathematics', 'science'])
const ALLOWED_CHALLENGES = new Set(['mathematics', 'science'])

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', project: 'mimix' })
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

function requireRobotBridge(req, res, next) {
  // En desarrollo local puede omitirse el token. En una red compartida debe
  // configurarse para que solo mimix_robot pueda ordenar la interfaz.
  if (!ROBOT_BRIDGE_TOKEN || req.get('X-Mimix-Robot-Token') === ROBOT_BRIDGE_TOKEN) {
    return next()
  }
  return res.status(401).json({ error: 'invalid robot bridge token' })
}

app.post('/api/vision/hand-landmarks', (req, res) => {
  const { landmarks, handedness, timestamp, source } = req.body ?? {}

  if (!Array.isArray(landmarks) || !Array.isArray(handedness)) {
    return res.status(400).json({ error: 'landmarks and handedness are required' })
  }

  latestHandLandmarks = {
    landmarks,
    handedness,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
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

  if (latestHandLandmarks) {
    sendVisionEvent(res, 'hand-landmarks', latestHandLandmarks)
  }

  req.on('close', () => visionClients.delete(res))
})

app.get('/api/vision/status', (_req, res) => {
  res.json({
    connectedClients: visionClients.size,
    lastFrameAt: latestHandLandmarks?.timestamp ?? null,
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
    context: latestRobotContext,
    bridgeTokenRequired: Boolean(ROBOT_BRIDGE_TOKEN),
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

app.listen(PORT, () => {
  console.log(`Mimix server running on http://localhost:${PORT}`)
})
