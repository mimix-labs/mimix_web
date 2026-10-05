import {
  agentTurnSchema, authorizationSchema, llmProposalSchema, pedagogicalContextSchema, turnInputSchema,
  type AgentTurn, type Authorization, type LlmProvider, type PedagogicalContext, type TurnInput,
} from '@mimix/agent-contract'
import { characterProfileSchema, type CharacterProfile } from '@mimix/character-contract'
import { recommendNext } from './recommendations.js'
import { canTurn, executeTool, listTools, pedagogicalView } from './tools.js'

export class AgentError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'TURN_DENIED') {
    super(code === 'INVALID_INPUT' ? 'Invalid agent input.' : 'Agent turn denied.')
  }
}
export interface AgentCoreOptions { provider?: LlmProvider; providerTimeoutMs?: number }

/** No conversation memory: each invocation owns its bounded, validated snapshot. */
export class AgentCore {
  private readonly provider?: LlmProvider
  private readonly providerTimeoutMs: number

  constructor(options: AgentCoreOptions = {}) {
    this.provider = options.provider
    this.providerTimeoutMs = options.providerTimeoutMs ?? 5000
    if (!Number.isInteger(this.providerTimeoutMs) || this.providerTimeoutMs < 1 || this.providerTimeoutMs > 30000) {
      throw new AgentError('INVALID_INPUT')
    }
  }

  async turn(input: TurnInput, contextInput: PedagogicalContext, authInput: Authorization, profile: CharacterProfile): Promise<AgentTurn> {
    const parsedInput = turnInputSchema.safeParse(input)
    const parsedContext = pedagogicalContextSchema.safeParse(contextInput)
    const parsedAuth = authorizationSchema.safeParse(authInput)
    const parsedCharacter = characterProfileSchema.safeParse(profile)
    if (!parsedInput.success || !parsedContext.success || !parsedAuth.success || !parsedCharacter.success) throw new AgentError('INVALID_INPUT')
    // Zod creates isolated data before the first await (no shared caller grants).
    const request = parsedInput.data, context = parsedContext.data, authorization = parsedAuth.data, character = parsedCharacter.data
    if (!canTurn(context, authorization)) throw new AgentError('TURN_DENIED')
    const tools = listTools(authorization)
    const recommendations = tools.some(tool => tool.name === 'recommend_next') ? recommendNext(context) : []
    const text = character.persona.locale === 'es'
      ? `${character.displayName}: ${recommendations.length ? 'Exploremos el siguiente reto.' : 'Podemos repasar tus objetivos de aprendizaje.'}`
      : `${character.displayName}: ${recommendations.length ? 'Let’s explore the next challenge.' : 'We can review your learning goals.'}`
    const base: AgentTurn = {
      schemaVersion: 1, id: request.id, characterId: character.id, text, recommendations,
      toolResults: [], source: 'deterministic',
    }
    if (!this.provider) return agentTurnSchema.parse(base)

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => this.provider!.generate({
          message: request.message, history: structuredClone(request.history),
          character: { displayName: character.displayName, persona: structuredClone(character.persona) },
          context: tools.some(tool => tool.name === 'read_context') ? pedagogicalView(context) : null,
          tools,
        }, { signal: controller.signal })),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('timeout')) }, this.providerTimeoutMs)
        }),
      ])
      const proposal = llmProposalSchema.safeParse(response)
      if (!proposal.success) return agentTurnSchema.parse({ ...base, source: 'fallback', fallbackReason: 'INVALID_PROPOSAL' })
      return agentTurnSchema.parse({ ...base, text: proposal.data.text, source: 'llm',
        toolResults: proposal.data.toolCalls.map(call => executeTool(call, context, authorization)),
      })
    } catch {
      return agentTurnSchema.parse({ ...base, source: 'fallback', fallbackReason: timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_FAILED' })
    } finally {
      clearTimeout(timer)
    }
  }
}
