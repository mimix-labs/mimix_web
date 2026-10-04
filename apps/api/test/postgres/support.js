import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { Database } from '../../dist/database/database.js'
import { migrate } from '../../dist/database/migrate.js'
import { importSnapshot, exportSnapshot } from '../../dist/database/snapshot.js'
import { PostgresIdentityRepository } from '../../dist/modules/identity/postgres.repository.js'
import { LearningStore } from '../../dist/modules/learning/store.js'
export async function fixture(t) {
  if (!process.env.MIMIX_TEST_DATABASE_URL) throw new Error('MIMIX_TEST_DATABASE_URL is required; use a disposable PostgreSQL instance')
  const admin = new Pool({ connectionString: process.env.MIMIX_TEST_DATABASE_URL })
  const name = `learning_test_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE DATABASE "${name}"`)
  const url = new URL(process.env.MIMIX_TEST_DATABASE_URL); url.pathname = `/${name}`
  const database = new Database(url.toString())
  t.after(async () => { await database.close(); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); await admin.end() })
  await migrate(database)
  return { database, url: url.toString(), store: new LearningStore(database), identities: new PostgresIdentityRepository(database), migrate, importSnapshot, exportSnapshot }
}
