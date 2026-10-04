import type { BehaviorIntent, Capability, ChallengeError, LearningRecord, RuntimeCall, SpeakInput } from '@mimix/contracts'
export type RuntimeState = 'loading' | 'initializing' | 'ready' | 'starting' | 'running' | 'pausing' | 'paused' | 'resuming' | 'disposing' | 'disposed' | 'cancelled' | 'error'
export interface OperationContext { readonly signal: AbortSignal; readonly requestId: string }
export interface HostAdapters {
  'agent.speak'?: (input: SpeakInput, context: OperationContext) => Promise<void>
  'progress.record'?: (input: LearningRecord, context: OperationContext) => Promise<void>
  'embodiment.perform'?: (input: BehaviorIntent, context: OperationContext) => Promise<void>
}
export interface RuntimeTelemetry {
  readonly event: 'state' | 'rejected' | 'denied' | 'timeout' | 'operation'
  readonly state: RuntimeState
  readonly code?: ChallengeError['code']
  readonly method?: RuntimeCall['method']
}
export interface RuntimeOptions {
  container: HTMLElement
  manifest: unknown
  bundle: string
  approvedCapabilities: readonly Capability[]
  adapters: HostAdapters
  timeoutMs?: number
  signal?: AbortSignal
  onTelemetry?: (event: RuntimeTelemetry) => void
}
export interface RuntimeHandle {
  readonly ready: Promise<void>
  readonly state: RuntimeState
  start(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  dispose(): Promise<void>
  cancel(): void
  revoke(capability: Capability): void
}
