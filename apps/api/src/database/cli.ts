import { open, readFile } from 'node:fs/promises'
import { Database } from './database.js'
import { migrate } from './migrate.js'
import { importSnapshot, exportSnapshot } from './snapshot.js'
import { CampaignStore } from '../modules/campaigns/store.js'
import { officialIntro } from '../modules/campaigns/seed.js'
import { LearningStore } from '../modules/learning/store.js'

let database: Database | undefined
try {
  const [command, file, ...extra] = process.argv.slice(2)
  if (!process.env.DATABASE_URL || extra.length || !['migrate', 'rebuild', 'seed-campaigns', 'import-identities', 'export-identities'].includes(command)
    || (['import-identities', 'export-identities'].includes(command) !== Boolean(file))) throw new Error('Invalid command')
  database = new Database(process.env.DATABASE_URL)
  if (command === 'migrate') await migrate(database)
  if (command === 'seed-campaigns') await new CampaignStore(database).publish(officialIntro)
  if (command === 'rebuild') await new LearningStore(database).rebuild()
  if (command === 'import-identities') await importSnapshot(database, JSON.parse(await readFile(file, 'utf8')))
  if (command === 'export-identities') {
    const snapshot = await exportSnapshot(database)
    const handle = await open(file, 'wx', 0o600)
    try { await handle.writeFile(JSON.stringify(snapshot)); await handle.sync() } finally { await handle.close() }
  }
  console.log(JSON.stringify({ event: 'database-operation-complete', command }))
} catch {
  console.error(JSON.stringify({ event: 'database-operation-failed' }))
  process.exitCode = 1
} finally { await database?.close() }
