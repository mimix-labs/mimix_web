import { isDeepStrictEqual } from 'node:util'
import { and, asc, eq, gt, or, sql } from 'drizzle-orm'
import { campaignDefinitionSchema, campaignIdSchema, campaignVersionSchema, campaignStartSchema, campaignPageQuerySchema } from '@mimix/contracts'
import type { Database, Transaction } from '../../database/database.js'
import { attempts, campaignVersions } from '../../database/schema.js'
import { LearningError, parse } from '../learning/contract.js'
import { LearningStore } from '../learning/store.js'
import { projectCampaign, type NodeFacts } from './projection.js'

type Reader = Database['db'] | Transaction
export class CampaignStore {
  private readonly learning: LearningStore
  constructor(private readonly database: Database) { this.learning = new LearningStore(database) }
  // Operator-only publication: no HTTP endpoint or mutable catalog API.
  async publish(value: unknown) {
    const definition = parse(campaignDefinitionSchema, value)
    const [inserted] = await this.database.db.insert(campaignVersions).values({ id: definition.id, version: definition.version, title: definition.title, definition }).onConflictDoNothing().returning()
    if (!inserted && !isDeepStrictEqual(await this.get(definition.id, definition.version), definition)) throw new LearningError(409, 'campaign version already published')
    return definition
  }
  async list(value: unknown) {
    const query = parse(campaignPageQuerySchema, value)
    const rows = await this.database.db.select({ id: campaignVersions.id, version: campaignVersions.version, title: campaignVersions.title }).from(campaignVersions)
      .where(query.afterId && query.afterVersion ? or(gt(campaignVersions.id, query.afterId), and(eq(campaignVersions.id, query.afterId), gt(campaignVersions.version, query.afterVersion))) : undefined)
      .orderBy(asc(campaignVersions.id), asc(campaignVersions.version)).limit(51)
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? { afterId: rows[49].id, afterVersion: rows[49].version } : null }
  }
  async get(id: string, version: string, reader: Reader = this.database.db) {
    const [row] = await reader.select().from(campaignVersions).where(and(eq(campaignVersions.id, parse(campaignIdSchema, id)), eq(campaignVersions.version, parse(campaignVersionSchema, version))))
    if (!row) throw new LearningError(404, 'campaign version not found')
    // Fail closed if an operator has inserted an invalid catalog outside publish().
    return campaignDefinitionSchema.parse(row.definition)
  }
  private async facts(reader: Reader, userId: string, id: string, version: string): Promise<NodeFacts[]> {
    // One statement snapshot; output bounded by definition's nodes, not event count.
    const result = await reader.execute(sql`
      WITH histories AS (
        SELECT c.node_id, a.id,
          bool_or(e.type = 'attempt_completed') AS completed,
          bool_or(e.type IN ('attempt_completed', 'attempt_abandoned')) AS closed
        FROM campaign_attempts c JOIN attempts a ON a.id = c.attempt_id
        JOIN learning_events e ON e.attempt_id = a.id
        WHERE a.user_id = ${userId} AND c.campaign_id = ${id} AND c.campaign_version = ${version}
        GROUP BY c.node_id, a.id
      ) SELECT node_id AS "nodeId", count(*)::int AS attempts,
        count(*) FILTER (WHERE completed)::int AS "completedAttempts",
        min(id::text) FILTER (WHERE NOT closed) AS "activeAttemptId"
      FROM histories GROUP BY node_id`)
    return result.rows as unknown as NodeFacts[]
  }
  async progress(userId: string, id: string, version: string) {
    const definition = await this.get(id, version)
    return projectCampaign(definition, await this.facts(this.database.db, userId, id, version))
  }
  async start(userId: string, id: string, version: string, nodeId: string, value: unknown) {
    const input = parse(campaignStartSchema, value)
    parse(campaignIdSchema, nodeId)
    return this.database.db.transaction(async tx => {
      // Serialize starts per internal user across processes. No editable active flag.
      await tx.execute(sql`select pg_advisory_xact_lock(104, hashtext(${userId}))`)
      const definition = await this.get(id, version, tx)
      const node = definition.nodes.find(node => node.id === nodeId)
      if (!node) throw new LearningError(404, 'campaign node not found')
      const [existing] = await tx.select({ id: attempts.id }).from(attempts).where(and(eq(attempts.userId, userId), eq(attempts.idempotencyKey, input.idempotencyKey)))
      if (!existing) {
        const progress = projectCampaign(definition, await this.facts(tx, userId, id, version))
        if (!progress.nodes.find(item => item.id === nodeId)?.canStart) throw new LearningError(409, 'campaign node locked or attempt active')
      }
      return this.learning.createInTransaction(tx, userId, { ...input, challengeId: node.challengeId, challengeVersion: node.challengeVersion }, { campaignId: id, campaignVersion: version, nodeId })
    })
  }
}
