import type { CharacterProfile } from '@mimix/character-contract'
import type { PedagogicalView, ToolDescriptor, TurnInput } from './index.js'

/** No ownership identifiers, credentials, executable handlers or authorization. */
export interface LlmRequest {
  message: string
  history: TurnInput['history']
  character: Pick<CharacterProfile, 'displayName' | 'persona'>
  context: PedagogicalView | null
  tools: ToolDescriptor[]
}
export interface LlmProvider {
  /** One proposal per turn. Honor cancellation and cap transport response bytes. */
  generate(request: LlmRequest, options: { signal: AbortSignal }): Promise<unknown>
}
