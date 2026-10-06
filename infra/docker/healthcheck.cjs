// Read PORT at runtime for Railway; no credentials, downloads or shell utilities.
const base = `http://127.0.0.1:${process.env.PORT || 4000}`
;(async () => {
  if (process.argv[2] === 'simulator') {
    if (!process.env.MIMIX_ROBOT_BRIDGE_TOKEN?.trim() || !process.env.MIMIX_SIM_HEALTH_SOCKET) throw new Error('Simulator not configured')
    // Ask the actual receiver: a second HTTP client cannot prove it is connected.
    const presence = await new Promise((resolve, reject) => {
      const socket = require('node:net').createConnection(process.env.MIMIX_SIM_HEALTH_SOCKET)
      let body = ''
      socket.setEncoding('utf8')
      socket.setTimeout(2000, () => socket.destroy(new Error('Receiver unresponsive')))
      socket.on('error', reject)
      socket.on('data', chunk => {
        body += chunk
        if (body.length > 4096) socket.destroy(new Error('Invalid presence'))
      })
      socket.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
      })
    })
    if (presence.state !== 'online' || !(presence.expiresAt > Date.now())) throw new Error('Motion stream unavailable')
    return
  }
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })
  if (!health.ok || (await health.json()).status !== 'ok') throw new Error('API unavailable')
  const web = await fetch(base, { signal: AbortSignal.timeout(2000) })
  if (!web.ok || !(await web.text()).includes('id="canvas"')) throw new Error('Web unavailable')
})().catch(() => { process.exitCode = 1 })
