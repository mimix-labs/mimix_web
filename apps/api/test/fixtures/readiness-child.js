import { createServer } from 'node:http'
const [mode, port] = process.argv.slice(2)
if (mode === 'exit') {
  console.error('controlled startup failure')
  process.exitCode = 23
  process.disconnect()
} else {
  const server = createServer((_req, res) => {
    if (mode === 'hang') { process.send({ event: 'request-received' }); return }
    res.writeHead(mode === 'bad-response' ? 503 : 200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ mode: 'jetson' }))
  })
  const start = () => server.listen(Number(port), '127.0.0.1', () => process.send({ event: 'listening' }))
  if (mode === 'delayed') setTimeout(start, 3000)
  else start()
}
