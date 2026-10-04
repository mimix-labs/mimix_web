/**
 * Contract fixture, not a production challenge. The host owns authorization,
 * attempt creation, sequencing and lifecycle; this module contains no transport.
 * @param {import('@mimix/challenge-sdk').ChallengeContext} context
 * @returns {import('@mimix/challenge-sdk').ChallengeLifecycle}
 */
export function createChallenge({ mimix, capabilities, signal }) {
  return {
    async initialize() {},
    async start() {
      signal.throwIfAborted()
      if (capabilities.includes('agent')) await mimix.agent.speak({ text: 'Dos más dos son cuatro.' })
      signal.throwIfAborted()
      await mimix.progress.record({ type: 'answer_submitted', payload: { correct: true } })
      signal.throwIfAborted()
      await mimix.progress.record({ type: 'attempt_completed', payload: {} })
      signal.throwIfAborted()
      if (capabilities.includes('embodiment')) await mimix.embodiment.perform({ intent: 'celebrate' })
    },
    async pause() {},
    async resume() {},
    async dispose() {},
  }
}
