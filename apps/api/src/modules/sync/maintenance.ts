import { DatabaseSync, backup } from 'node:sqlite'
import { chmod, link, mkdtemp, open, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { digest } from './contract.js'
import { offlineEventSchema } from '@mimix/contracts'

/** Offline operator check. Never repairs or initializes an unknown database. */
export function checkQueue(path: string) {
  if (!isAbsolute(path)) throw new Error('Absolute SQLite path required')
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    if (db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' || db.prepare('PRAGMA user_version').get()?.user_version !== 1 || db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Invalid offline database')
    const sessions = db.prepare('SELECT count(*) AS n FROM sessions').get()
    const attempts = db.prepare('SELECT count(*) AS n FROM attempts').get()
    const events = db.prepare('SELECT id,sequence,content,hash,acknowledged FROM events').all()
    for (const row of events) {
      if (typeof row.hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.hash) || (row.content === null && row.acknowledged !== 1)) throw new Error('Invalid offline event')
      if (row.content !== null) {
        const content = String(row.content), event = offlineEventSchema.parse(JSON.parse(content))
        if (digest(content) !== row.hash || event.eventId !== row.id || event.sequence !== row.sequence) throw new Error('Invalid offline event')
      }
    }
    return { sessions: Number(sessions?.n), attempts: Number(attempts?.n), events: events.length }
  } finally { db.close() }
}
/** SQLite online backup includes WAL; final link atomically refuses existing destinations. */
export async function backupQueue(source: string, destination: string): Promise<void> {
  if (!isAbsolute(destination)) throw new Error('Absolute destination required')
  checkQueue(source)
  const directory = await mkdtemp(join(dirname(destination), '.mimix-backup-'))
  const temporary = join(directory, 'queue.sqlite')
  const db = new DatabaseSync(source, { readOnly: true })
  try {
    await backup(db, temporary)
    await chmod(temporary, 0o600)
    checkQueue(temporary)
    const handle = await open(temporary, 'r'); try { await handle.sync() } finally { await handle.close() }
    await link(temporary, destination)
    const parent = await open(dirname(destination), 'r'); try { await parent.sync() } finally { await parent.close() }
  } finally { db.close(); await rm(directory, { recursive: true, force: true }) }
}
// Restore is deliberately a new file. Stop the gateway before switching its configured path.
export const restoreQueue = backupQueue
