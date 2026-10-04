import type { BehaviorIntent, Capability, ChallengeManifest, LearningRecord, SpeakInput } from '@mimix/contracts'

/** Host ports. Each call must be authorized and validated by the host. */
export interface MimixAPI {
  readonly agent: { speak(input: SpeakInput): Promise<void> }
  readonly progress: { record(input: LearningRecord): Promise<void> }
  readonly embodiment: { perform(input: BehaviorIntent): Promise<void> }
}

export interface ChallengeContext {
  readonly mimix: MimixAPI
  /** Actual grants, not the manifest's requested capabilities. */
  readonly capabilities: readonly Capability[]
  /** Host aborts before disposal; implementations cancel their pending work. */
  readonly signal: AbortSignal
}

/** The host serializes calls; dispose must be safe after partial initialization. */
export interface ChallengeLifecycle {
  initialize(): Promise<void>
  start(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  dispose(): Promise<void>
}
export type ChallengeFactory = (context: ChallengeContext) => ChallengeLifecycle
export interface ChallengeDefinition {
  readonly manifest: ChallengeManifest
  readonly create: ChallengeFactory
}
