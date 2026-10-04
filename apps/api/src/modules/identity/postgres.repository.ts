import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../../database/database.js'
import { externalIdentities, users } from '../../database/schema.js'
import type { User, VerifiedIdentity } from './identity.contract.js'
export class PostgresIdentityRepository {
  constructor(private readonly database: Database) {}
  async resolve(identity: VerifiedIdentity): Promise<User> {
    return this.database.db.transaction(async tx => {
      const key = JSON.stringify([identity.provider, identity.issuer, identity.subject])
      await tx.execute(sql`select pg_advisory_xact_lock(101, hashtext(${key}))`)
      const [existing] = await tx.select({ user: users }).from(externalIdentities).innerJoin(users, eq(users.id, externalIdentities.userId))
        .where(and(eq(externalIdentities.provider, identity.provider), eq(externalIdentities.issuer, identity.issuer), eq(externalIdentities.subject, identity.subject)))
      if (existing) return { ...existing.user, createdAt: new Date(existing.user.createdAt).toISOString() }
      const user = { id: randomUUID(), createdAt: new Date().toISOString() }
      await tx.insert(users).values(user)
      await tx.insert(externalIdentities).values({ id: randomUUID(), userId: user.id, provider: identity.provider, issuer: identity.issuer, subject: identity.subject })
      return user
    })
  }
}
