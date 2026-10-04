import { asc } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from './database.js'
import { externalIdentities, users } from './schema.js'
const snapshotSchema = z.strictObject({
  version: z.literal(1), users: z.array(z.strictObject({ id: z.uuid(), createdAt: z.iso.datetime() })),
  identities: z.array(z.strictObject({ id: z.uuid(), userId: z.uuid(), provider: z.string().min(1), issuer: z.string().min(1), subject: z.string().min(1) })),
})
export async function importSnapshot(database: Database, value: unknown): Promise<void> {
  const data = snapshotSchema.parse(value)
  if (new Set(data.users.map(u => u.id)).size !== data.users.length || new Set(data.identities.map(i => i.id)).size !== data.identities.length
    || new Set(data.identities.map(i => JSON.stringify([i.provider, i.issuer, i.subject]))).size !== data.identities.length
    || data.identities.some(i => !data.users.some(u => u.id === i.userId))) throw new Error('Invalid identity snapshot')
  await database.db.transaction(async tx => {
    // Import is an offline operation, but table locks also serialize accidental concurrent imports/login.
    const { sql } = await import('drizzle-orm')
    await tx.execute(sql`LOCK TABLE users, external_identities IN SHARE ROW EXCLUSIVE MODE`)
    const existingUsers = await tx.select().from(users), existingIdentities = await tx.select().from(externalIdentities)
    for (const user of data.users) {
      const existing = existingUsers.find(u => u.id === user.id)
      if (existing && new Date(existing.createdAt).getTime() !== Date.parse(user.createdAt)) throw new Error('Identity import conflict')
      if (!existing) await tx.insert(users).values(user)
    }
    for (const identity of data.identities) {
      const existing = existingIdentities.find(i => i.id === identity.id || (i.provider === identity.provider && i.issuer === identity.issuer && i.subject === identity.subject))
      if (existing && (existing.id !== identity.id || existing.userId !== identity.userId || existing.provider !== identity.provider || existing.issuer !== identity.issuer || existing.subject !== identity.subject)) throw new Error('Identity import conflict')
      if (!existing) await tx.insert(externalIdentities).values(identity)
    }
  })
}
export async function exportSnapshot(database: Database) {
  return database.db.transaction(async tx => ({ version: 1 as const,
    users: (await tx.select().from(users).orderBy(asc(users.id))).map(u => ({ ...u, createdAt: new Date(u.createdAt).toISOString() })),
    identities: await tx.select().from(externalIdentities).orderBy(asc(externalIdentities.id)),
  }), { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
