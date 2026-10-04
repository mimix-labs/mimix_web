import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'
export class Database {
  readonly pool: Pool
  readonly db
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000, lock_timeout: 10000 })
    // Do not print server errors/connection strings; requests fail closed on their own.
    this.pool.on('error', () => {})
    this.db = drizzle(this.pool, { schema })
  }
  close(): Promise<void> { return this.pool.end() }
}
export type Transaction = Parameters<Parameters<Database['db']['transaction']>[0]>[0]
