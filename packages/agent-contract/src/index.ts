import { z } from 'zod'
import { capabilitySchema, campaignIdSchema, campaignVersionSchema } from '@mimix/contracts'

const text = (max: number) => z.string().min(1).max(max).refine(value => value.trim().length > 0)
const uuid = z.uuid().transform(value => value.toLowerCase())
const unique = <T>(values: T[]) => new Set(values).size === values.length
const objectiveSchema = z.strictObject({ id: campaignIdSchema, description: text(500) })
const nodeSchema = z.strictObject({
  id: campaignIdSchema, challengeId: campaignIdSchema, challengeVersion: campaignVersionSchema,
  status: z.enum(['locked', 'available', 'in_progress', 'completed']), canStart: z.boolean(),
}).refine(node => node.status !== 'locked' || !node.canStart, 'Locked nodes cannot start')
export const pedagogicalViewSchema = z.strictObject({
  objectives: z.array(objectiveSchema).max(50).refine(items => unique(items.map(item => item.id))),
  campaign: z.strictObject({
    id: campaignIdSchema, version: campaignVersionSchema,
    nodes: z.array(nodeSchema).max(100).refine(items => unique(items.map(item => item.id))),
  }).nullable(),
})
/** The host supplies an ownership-checked snapshot, never a client/model payload. */
export const pedagogicalContextSchema = pedagogicalViewSchema.extend({ schemaVersion: z.literal(1), userId: uuid, conversationId: uuid })
export const permissionSchema = z.enum(['agent:turn', 'learning:read'])
export const authorizationSchema = z.strictObject({
  userId: uuid, conversationId: uuid,
  permissions: z.array(permissionSchema).max(2).refine(unique),
  capabilities: z.array(capabilitySchema).max(5).refine(unique),
})
export const messageSchema = z.strictObject({ role: z.enum(['user', 'assistant']), text: text(2000) })
export const turnInputSchema = z.strictObject({
  schemaVersion: z.literal(1), id: uuid, message: text(2000), history: z.array(messageSchema).max(12),
})
export const recommendationSchema = z.strictObject({
  kind: z.enum(['start_challenge', 'resume_challenge']),
  campaignId: campaignIdSchema, campaignVersion: campaignVersionSchema,
  nodeId: campaignIdSchema, challengeId: campaignIdSchema, challengeVersion: campaignVersionSchema,
})
export const toolNameSchema = z.enum(['read_context', 'recommend_next'])
export const toolCallSchema = z.strictObject({
  id: campaignIdSchema, name: campaignIdSchema, arguments: z.strictObject({}),
})
export const toolDescriptorSchema = z.strictObject({
  name: toolNameSchema, description: text(300),
  requiredPermissions: z.array(permissionSchema).min(1).max(2).refine(unique),
  requiredCapabilities: z.array(capabilitySchema).min(1).max(5).refine(unique),
  inputSchema: z.strictObject({ type: z.literal('object'), properties: z.strictObject({}), additionalProperties: z.literal(false) }),
})
export const toolResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('denied'), callId: campaignIdSchema, name: campaignIdSchema, code: z.enum(['TOOL_DENIED', 'INVALID_INPUT']) }),
  z.strictObject({ status: z.literal('ok'), callId: campaignIdSchema, name: toolNameSchema,
    value: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('context'), context: pedagogicalViewSchema }),
      z.strictObject({ kind: z.literal('recommendations'), recommendations: z.array(recommendationSchema).max(1) }),
    ]),
  }),
])
export const llmProposalSchema = z.strictObject({
  text: text(2000), toolCalls: z.array(toolCallSchema).max(4).refine(calls => unique(calls.map(call => call.id))),
})
export const agentTurnSchema = z.strictObject({
  schemaVersion: z.literal(1), id: uuid, characterId: campaignIdSchema,
  text: text(2000), recommendations: z.array(recommendationSchema).max(1),
  toolResults: z.array(toolResultSchema).max(4),
  source: z.enum(['deterministic', 'llm', 'fallback']),
  fallbackReason: z.enum(['PROVIDER_FAILED', 'INVALID_PROPOSAL', 'PROVIDER_TIMEOUT']).optional(),
})
export type PedagogicalView = z.infer<typeof pedagogicalViewSchema>
export type PedagogicalContext = z.infer<typeof pedagogicalContextSchema>
export type Authorization = z.infer<typeof authorizationSchema>
export type TurnInput = z.infer<typeof turnInputSchema>
export type Recommendation = z.infer<typeof recommendationSchema>
export type ToolCall = z.infer<typeof toolCallSchema>
export type ToolDescriptor = z.infer<typeof toolDescriptorSchema>
export type ToolResult = z.infer<typeof toolResultSchema>
export type AgentTurn = z.infer<typeof agentTurnSchema>
export type LlmProposal = z.infer<typeof llmProposalSchema>
export type { LlmProvider, LlmRequest } from './provider.js'
