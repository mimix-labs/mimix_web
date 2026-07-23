import express from 'express'
import cors from 'cors'
import http from 'node:http'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 4000
const visionClients = new Set()
let latestHandLandmarks = null

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
