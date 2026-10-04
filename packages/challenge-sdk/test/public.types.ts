import type { ChallengeContext, ChallengeLifecycle, MimixAPI } from '@mimix/challenge-sdk'
import type { LearningRecord, ChallengeManifest } from '@mimix/contracts'
import { defineChallenge, validateManifest } from '@mimix/challenge-sdk'

declare const mimix: MimixAPI
declare const manifest: ChallengeManifest
mimix.agent.speak({ text: 'Inténtalo de nuevo' })
mimix.progress.record({ type: 'answer_submitted', payload: { correct: false } })
mimix.embodiment.perform({ intent: 'encourage' })
// @ts-expect-error no motors
mimix.embodiment.perform({ intent: 'motor', speed: 20 })
// @ts-expect-error no identity provider
mimix.clerk.getToken()
// @ts-expect-error no database
mimix.db.query('select 1')
// @ts-expect-error no character-specific API
mimix.wallE.speak('hello')
// @ts-expect-error voice provider is host owned
mimix.agent.speak({ text: 'Hello', voiceId: 'external' })
// @ts-expect-error completion cannot edit progress
mimix.progress.record({ type: 'attempt_completed', payload: { score: 100 } })
// @ts-expect-error cannot supply identity
mimix.progress.record({ type: 'hint_requested', payload: {}, userId: 'x' })
// @ts-expect-error cannot create attempts through record
const started: LearningRecord = { type: 'attempt_started', payload: {} }
void started
const create = (context: ChallengeContext): ChallengeLifecycle => ({
  async initialize() { context.signal.throwIfAborted() }, async start() {}, async pause() {}, async resume() {}, async dispose() {},
})
defineChallenge(manifest, create)
// @ts-expect-error lifecycle cleanup is mandatory
defineChallenge(manifest, () => ({ async start() {} }))
const result = validateManifest(manifest)
if (result.ok) result.manifest.capabilities.required.includes('progress')
else result.error.code satisfies string
