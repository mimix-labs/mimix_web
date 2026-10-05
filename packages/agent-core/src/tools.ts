import {
  authorizationSchema, pedagogicalContextSchema, pedagogicalViewSchema, toolCallSchema,
  type Authorization, type PedagogicalContext, type ToolCall, type ToolDescriptor, type ToolResult,
} from '@mimix/agent-contract'

import { recommendNext } from './recommendations.js'

const catalog: ToolDescriptor[] = [
  { name: 'read_context', description: 'Leer objetivos y progreso de esta conversación.' },
  { name: 'recommend_next', description: 'Recomendar el siguiente reto disponible o en progreso.' },
].map(tool => ({
  ...tool, name: tool.name as ToolDescriptor['name'],
  requiredPermissions: ['agent:turn', 'learning:read'], requiredCapabilities: ['agent', 'progress'],
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}))

export function canTurn(context: PedagogicalContext, authorization: Authorization): boolean {
  return context.userId === authorization.userId && context.conversationId === authorization.conversationId
    && authorization.permissions.includes('agent:turn') && authorization.capabilities.includes('agent')
}

/** A fresh copy prevents adapters/consumers from mutating catalog policy. */
export function listTools(input: Authorization): ToolDescriptor[] {
  const authorization = authorizationSchema.parse(input)
  return structuredClone(catalog.filter(tool =>
    tool.requiredPermissions.every(permission => authorization.permissions.includes(permission))
    && tool.requiredCapabilities.every(capability => authorization.capabilities.includes(capability))))
}

export function pedagogicalView(context: PedagogicalContext) {
  return pedagogicalViewSchema.parse({ objectives: context.objectives, campaign: context.campaign })
}

/** Direct callers are checked too; the LLM catalog is not an authorization gate. */
export function executeTool(input: ToolCall, contextInput: PedagogicalContext, authInput: Authorization): ToolResult {
  const call = toolCallSchema.safeParse(input)
  // Invalid envelopes have no safe correlation ID; callers must validate them first.
  if (!call.success) {
    const envelope = toolCallSchema.parse({ ...input, arguments: {} })
    return { status: 'denied', callId: envelope.id, name: envelope.name, code: 'INVALID_INPUT' }
  }
  const context = pedagogicalContextSchema.parse(contextInput)
  const authorization = authorizationSchema.parse(authInput)
  const tool = listTools(authorization).find(tool => tool.name === call.data.name)
  if (!canTurn(context, authorization) || !tool) {
    return { status: 'denied', callId: call.data.id, name: call.data.name, code: 'TOOL_DENIED' }
  }
  return {
    status: 'ok', callId: call.data.id, name: tool.name,
    value: tool.name === 'read_context' ? { kind: 'context', context: pedagogicalView(context) }
      : { kind: 'recommendations', recommendations: recommendNext(context) },
  }
}
