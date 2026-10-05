/* global window */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createServer as tcpServer } from 'node:net'
import { once } from 'node:events'
import test from 'node:test'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import { LiveKitMediaProvider } from '../../dist/modules/media/livekit.js'
import { participantPermissions } from '@mimix/media-contract'
async function port() { const server = tcpServer().listen(0, '127.0.0.1'); await once(server, 'listening'); const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
test('real LiveKit WebRTC transports robot camera/microphone and user speaker audio, enforces scope and disconnects', { timeout: 90000 }, async t => {
  const http = await port(), tcp = await port(), udp = await port(), key = 'testkey', secret = randomBytes(32).toString('hex')
  const name = `mimix-media-test-${randomUUID()}`
  const config = `port: ${http}\nbind_addresses: [127.0.0.1]\nrtc:\n  node_ip: 127.0.0.1\n  tcp_port: ${tcp}\n  udp_port: ${udp}\n  use_external_ip: false\nkeys:\n  ${key}: ${secret}\n`
  execFileSync('docker', ['run', '-d', '--rm', '--name', name, '--network', 'host', 'livekit/livekit-server:v1.13.6', '--config-body', config], { stdio: 'pipe' })
  t.after(() => { execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' }) })
  const provider = new LiveKitMediaProvider({ provider: 'livekit', url: `ws://127.0.0.1:${http}`, apiKey: key, apiSecret: secret, mode: 'self-hosted', lan: true, timeoutMs: 3000 })
  const room = `test-${randomUUID()}`
  for (let n = 0; ; n++) { try { await provider.createRoom(room); break } catch (error) { if (n === 30) throw error; await delay(100) } }
  const vite = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await vite.listen(); t.after(() => vite.close())
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] }); t.after(() => browser.close())
  const robot = await browser.newPage(), user = await browser.newPage()
  for (const page of [robot, user]) { await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/test/livekit/harness.html`); await page.waitForFunction(() => !!window.mediaTest) }
  const token = async (role, tracks) => (await provider.issueToken({ room, identity: role, permissions: participantPermissions(tracks, role), expiresAt: Date.now() + 30000 })).token
  const tracks = ['robot_camera', 'robot_microphone', 'robot_speaker']
  const timings = []
  for (const [page, role] of [[robot, 'robot'], [user, 'user']]) timings.push(await page.evaluate(async ({ url, token }) => window.mediaTest.connect(url, token), { url: `ws://127.0.0.1:${http}`, token: await token(role, tracks) }))
  const mediaStart = Date.now()
  await robot.evaluate(() => window.mediaTest.publish('camera'))
  await robot.evaluate(() => window.mediaTest.publish('microphone'))
  await user.evaluate(() => window.mediaTest.publish('microphone'))
  await user.waitForFunction(() => window.mediaTest.state.videoFrames > 0 && window.mediaTest.state.audioBytes > 0)
  await robot.waitForFunction(() => window.mediaTest.state.audioBytes > 0)
  t.diagnostic(JSON.stringify({ architecture: process.arch, joinMs: timings.map(Math.round), firstBidirectionalMediaMs: Date.now() - mediaStart, source: 'synthetic Chromium loopback; no hardware or end-to-end latency claim' }))
  await assert.rejects(user.evaluate(() => window.mediaTest.publish('camera')))
  await provider.closeRoom(room, ['robot', 'user'])
  for (const page of [robot, user]) await page.waitForFunction(() => window.mediaTest.state.disconnected)
  // A camera-only robot cannot publish microphone or receive speaker audio.
  await provider.createRoom(room)
  const cameraToken = await token('robot', ['robot_camera'])
  await robot.evaluate(({ url, token }) => window.mediaTest.connect(url, token), { url: `ws://127.0.0.1:${http}`, token: cameraToken })
  await assert.rejects(robot.evaluate(() => window.mediaTest.publish('microphone')))
  await provider.closeRoom(room, ['robot', 'user'])
  await assert.rejects(user.evaluate(({ url, token }) => window.mediaTest.connect(url, token), { url: `ws://127.0.0.1:${http}`, token: cameraToken.slice(0, -8) + 'badproof' }))
})
