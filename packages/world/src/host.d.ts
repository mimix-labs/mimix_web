import type { MimixAPI, Capability } from '@mimix/challenge-sdk'
import type { AgentTurn } from '@mimix/agent-contract'
import type { EmbodimentPermit } from '@mimix/embodiment-contract'
export interface WorldHost {
  readonly signal: AbortSignal
  apiFor(id: string): MimixAPI
  openChallenge(id: string): void
  acceptTurn(input: unknown): AgentTurn
  followRecommendation(): void
  setEmbodiment(input: unknown, permit?: EmbodimentPermit): void
  dispose(): void
}
type CancellablePort<T> = { [K in keyof T]: T[K] extends (input: infer I) => Promise<void> ? (input: I, context: { signal: AbortSignal }) => Promise<void> : never }
export interface HostOptions {
  challengeOrigin: string
  navigate(url: string): void
  vision?: string | null
  grants?: Capability[]
  adapters?: { agent?: CancellablePort<MimixAPI['agent']>; progress?: CancellablePort<MimixAPI['progress']>; embodiment?: CancellablePort<MimixAPI['embodiment']>; stop?(): void }
}
export function createWorldHost(options: HostOptions): WorldHost
