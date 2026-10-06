// Read PORT at runtime for Railway; no credentials, downloads or shell utilities.
const base = `http://127.0.0.1:${process.env.PORT || 4000}`
;(async () => {
  if (process.argv[2] === 'simulator') {
    // Avoid loading the MQTT CLI tree in a second process on each local probe.
    const { RobotSimulator } = await import('./tools/robot-simulator/dist/simulator.js')
    await new RobotSimulator({ baseUrl: process.env.MIMIX_WEB_URL,
      bridgeToken: process.env.MIMIX_ROBOT_BRIDGE_TOKEN, timeoutMs: 2000 }).getContext()
    return
  }
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })
  if (!health.ok || (await health.json()).status !== 'ok') throw new Error('API unavailable')
  const web = await fetch(base, { signal: AbortSignal.timeout(2000) })
  if (!web.ok || !(await web.text()).includes('id="canvas"')) throw new Error('Web unavailable')
})().catch(() => { process.exitCode = 1 })
