import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate as runMigrations } from 'drizzle-orm/node-postgres/migrator'
import type { Database } from './database.js'
export async function migrate(database: Database): Promise<void> {
  const client = await database.pool.connect()
  try {
    await client.query('select pg_advisory_lock(103, 1)')
    await runMigrations(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../../migrations/', import.meta.url)) })
  } finally {
    try { await client.query('select pg_advisory_unlock(103, 1)') } finally { client.release() }
  }
}
