import type { PoolClient } from 'pg'
import type { Database } from '../../database/database.js'
import { DeviceError } from '../devices/contract.js'
/** The in-process embodiment coordinator supports exactly one MQTT API process per DB. */
export class ControlLeader {
  private client?: PoolClient
  private timer?: ReturnType<typeof setInterval>
  private checking = false
  active = false
  constructor(private readonly database: Database, private readonly lost: () => void) {}
  async start(): Promise<void> {
    const client = await this.database.pool.connect()
    this.client = client
    client.on('error', () => this.fail()); client.on('end', () => this.fail())
    try {
      const result = await client.query('select pg_try_advisory_lock(105, 1) as acquired')
      if (!result.rows[0].acquired) throw new DeviceError(503, 'robot control leader unavailable')
      this.active = true
      this.timer = setInterval(() => { if (!this.checking) { this.checking = true; void this.check().catch(() => {}).finally(() => { this.checking = false }) } }, 1000)
      this.timer.unref()
    } catch (error) { await this.close(); throw error }
  }
  async check(): Promise<void> {
    if (!this.active || !this.client) throw new DeviceError(503)
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([this.client.query('select 1'), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error()), 1000) })]) }
    catch { this.fail(); throw new DeviceError(503) }
    finally { clearTimeout(timer) }
    if (!this.active) throw new DeviceError(503)
  }
  private fail(): void {
    if (!this.active) return
    this.active = false; clearInterval(this.timer); this.lost()
    const client = this.client; this.client = undefined; client?.release(true)
  }
  async close(): Promise<void> {
    this.active = false; clearInterval(this.timer)
    const client = this.client; this.client = undefined
    // Destroy instead of returning a connection carrying a session-level lock.
    client?.release(true)
  }
}
