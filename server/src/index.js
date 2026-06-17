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

app.listen(PORT, () => {
  console.log(`Mimix server running on http://localhost:${PORT}`)
})
