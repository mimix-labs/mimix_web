import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', project: 'mimix' })
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
