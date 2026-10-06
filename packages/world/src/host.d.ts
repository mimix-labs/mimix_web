import type { MimixAPI, Capability, ChallengeManifest } from '@mimix/challenge-sdk'
import type { AgentTurn } from '@mimix/agent-contract'
import type { EmbodimentPermit } from '@mimix/embodiment-contract'
export interface WorldHost {
  readonly signal: AbortSignal
  /** Called only by the trusted host; only the resulting MimixAPI goes to the challenge. */
  apiFor(id: string, attempt?: AttemptBinding): MimixAPI
  openChallenge(id: string): void
  acceptTurn(input: unknown): AgentTurn
  followRecommendation(): void
  setEmbodiment(input: unknown, permit?: EmbodimentPermit): void
  dispose(): void
}
/** Attribution from an existing authorized attempt, not an authentication credential. */
export interface AttemptBinding {
  readonly challengeId: string
  readonly challengeVersion: string
  readonly attemptId: string
}
export interface OperationContext {
  readonly signal: AbortSignal
  readonly challengeId: string
  readonly challengeVersion: string
  readonly attemptId?: string
}
export interface ProgressContext extends OperationContext { readonly attemptId: string }
type CancellablePort<T, Context = OperationContext> = { [K in keyof T]: T[K] extends (input: infer I) => Promise<void> ? (input: I, context: Context) => Promise<void> : never }
export interface HostOptions {
  challengeOrigin: string
  navigate(url: string): void
  vision?: string | null
  grants?: Capability[]
  /** Host-installed and validated catalog; defaults to the two shipped exploration manifests. */
  challenges?: readonly ChallengeManifest[]
  adapters?: { agent?: CancellablePort<MimixAPI['agent']>; progress?: CancellablePort<MimixAPI['progress'], ProgressContext>; embodiment?: CancellablePort<MimixAPI['embodiment']>; stop?(): void }
}
export function createWorldHost(options: HostOptions): WorldHost
