import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
export const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
export async function until(predicate, timeout = 6000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(20) }
  throw new Error('Timed out waiting for MQTT state')
}
export async function brokerFixture(t, sessionIds) {
  const directory = mkdtempSync(join(tmpdir(), 'mimix-mqtt-')); chmodSync(directory, 0o755)
  let container
  t.after(() => { if (container) docker('rm', '-f', container); rmSync(directory, { recursive: true, force: true }) })
  const image = 'eclipse-mosquitto:2.0.22'
  writeFileSync(join(directory, 'passwords'), ['mimix-backend', ...sessionIds].map(name => `${name}:test-only-password`).join('\n') + '\n')
  docker('run', '--rm', '-v', `${directory}:/fixture`, image, 'mosquitto_passwd', '-U', '/fixture/passwords')
  chmodSync(join(directory, 'passwords'), 0o644)
  copyFileSync(new URL('../../../infra/mqtt/acl', import.meta.url), join(directory, 'acl'))
  writeFileSync(join(directory, 'mosquitto.conf'), 'listener 1883\nallow_anonymous false\npassword_file /fixture/passwords\nacl_file /fixture/acl\nuse_username_as_clientid true\nretain_available false\nmax_qos 1\nmax_packet_size 8192\npersistence false\n')
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const reserved = socket.address().port; await new Promise(resolve => socket.close(resolve))
  container = docker('run', '-d', '-p', `127.0.0.1:${reserved}:1883`, '-v', `${directory}:/fixture:ro`, image, 'mosquitto', '-c', '/fixture/mosquitto.conf')
  const port = docker('port', container, '1883/tcp').split(':').at(-1)
  return { container, config: { url: `mqtt://127.0.0.1:${port}`, username: 'mimix-backend', password: 'test-only-password', allowLoopback: true } }
}
