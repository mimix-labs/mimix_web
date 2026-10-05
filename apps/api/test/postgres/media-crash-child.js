// Isolated process used only to stop between a remote create and database activation.
import { randomBytes } from 'node:crypto'
import { Database } from '../../dist/database/database.js'
import { DeviceStore } from '../../dist/modules/devices/store.js'
import { DeviceTokens } from '../../dist/modules/devices/tokens.js'
import { MediaService } from '../../dist/modules/media/service.js'
process.once('message', async ({ url, actor, request, config }) => {
  const database = new Database(url)
  const devices = new DeviceStore(database, async () => {}, new DeviceTokens(randomBytes(32).toString('base64url')))
  const provider = {
    async createRoom(room) { process.send({ room }); await new Promise(() => {}) },
    async issueToken() { throw new Error('crash fixture must never issue credentials') },
    async closeRoom() {},
  }
  try { await new MediaService(database, devices, provider, config).create(actor, request) }
  catch { process.send({ error: 'crash fixture failed before reaching provider' }); await database.close(); process.disconnect() }
})
