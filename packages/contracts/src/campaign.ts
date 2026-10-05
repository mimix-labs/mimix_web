import { z } from 'zod'
import { challengeManifestSchema } from './challenge.js'

export const campaignIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/)
export const campaignVersionSchema = challengeManifestSchema.shape.version
const nodeSchema = z.strictObject({
  id: campaignIdSchema,
  challengeId: challengeManifestSchema.shape.id,
  challengeVersion: campaignVersionSchema,
  prerequisites: z.array(campaignIdSchema).max(99),
})
export const campaignDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(1), id: campaignIdSchema, version: campaignVersionSchema,
  title: z.string().min(1).max(160).refine(value => value.trim().length > 0),
  nodes: z.array(nodeSchema).min(1).max(100),
}).superRefine((definition, context) => {
  const nodes = new Map(definition.nodes.map(node => [node.id, node]))
  const invalid = () => context.addIssue({ code: 'custom', message: 'Campaign must be a DAG with unique nodes and prerequisites' })
  if (nodes.size !== definition.nodes.length) { invalid(); return }
  const visited = new Set<string>(), visiting = new Set<string>()
  const visit = (id: string): boolean => {
    if (visited.has(id)) return true
    const node = nodes.get(id)
    if (!node || visiting.has(id) || new Set(node.prerequisites).size !== node.prerequisites.length) return false
    visiting.add(id)
    if (!node.prerequisites.every(visit)) return false
    visiting.delete(id); visited.add(id)
    return true
  }
  if (!definition.nodes.every(node => visit(node.id))) invalid()
})
export const campaignStartSchema = z.strictObject({ idempotencyKey: z.uuid().transform(value => value.toLowerCase()) })
export const campaignPageQuerySchema = z.strictObject({ afterId: campaignIdSchema.optional(), afterVersion: campaignVersionSchema.optional() })
  .refine(query => Boolean(query.afterId) === Boolean(query.afterVersion), 'Both cursor fields are required together')
export type CampaignDefinition = z.infer<typeof campaignDefinitionSchema>
export type CampaignPageQuery = z.infer<typeof campaignPageQuerySchema>
export interface CampaignNodeProgress {
  id: string
  status: 'locked' | 'available' | 'in_progress' | 'completed'
  canStart: boolean
  blockedBy: string[]
  attempts: number
  completedAttempts: number
  activeAttemptId: string | null
}
export interface CampaignProgress {
  campaignId: string
  campaignVersion: string
  status: 'not_started' | 'in_progress' | 'completed'
  completedNodes: number
  totalNodes: number
  nodes: CampaignNodeProgress[]
}
