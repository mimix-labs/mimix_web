import { validateManifest, speakInputSchema, behaviorIntentSchema, learningRecordSchema } from '@mimix/challenge-sdk'
import math from '@mimix/challenge-mathematics/manifest.json' with { type: 'json' }
import science from '@mimix/challenge-science/manifest.json' with { type: 'json' }
import { agentTurnSchema } from '@mimix/agent-contract'
import { embodimentStateSchema } from '@mimix/embodiment-contract'

const manifests = new Map([math, science].map(input => {
  const result = validateManifest(input)
  if (!result.ok) throw new Error(result.error.message)
  return [result.manifest.id, result.manifest]
}))
const unavailable = () => Object.assign(new Error('Capability unavailable in this host'), { code: 'CAPABILITY_UNAVAILABLE' })

/** The embedding host owns authorization. This adapter never creates grants,
 * attempts, identities, motor commands, model URLs or completion events. */
export function createWorldHost({ challengeOrigin, navigate, vision, adapters = {}, grants = [] }) {
  const origin = new URL(challengeOrigin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid challenge origin')
  const lifetime = new AbortController()
  let outputLifetime = new AbortController()
  let state = null
  let permit = null
  let turn = null
  const active = () => { if (lifetime.signal.aborted) throw new DOMException('World disposed', 'AbortError') }
  const manifestFor = id => {
    const manifest = manifests.get(id)
    if (!manifest) throw new Error('Challenge not installed')
    return manifest
  }
  const virtual = () => state?.phase === 'virtual' && permit && !permit.signal.aborted && permit.isCurrent() && permit.leaseId === state.lease.leaseId
  const stop = () => { adapters.stop?.() }
  const apiFor = id => {
    const manifest = manifestFor(id)
    const allowed = capability => [...manifest.capabilities.required, ...manifest.capabilities.optional].includes(capability) && grants.includes(capability)
    const invoke = async (capability, schema, input, call) => {
      active()
      const parsed = schema.parse(input)
      if (!allowed(capability) || !call || (capability !== 'progress' && !virtual())) throw unavailable()
      await call(parsed, { signal: capability === 'progress' ? lifetime.signal : AbortSignal.any([lifetime.signal, outputLifetime.signal, permit.signal]) })
      active()
    }
    return {
      agent: { speak: input => invoke('agent', speakInputSchema, input, adapters.agent?.speak?.bind(adapters.agent)) },
      progress: { record: input => invoke('progress', learningRecordSchema, input, adapters.progress?.record?.bind(adapters.progress)) },
      embodiment: { perform: input => invoke('embodiment', behaviorIntentSchema, input, adapters.embodiment?.perform?.bind(adapters.embodiment)) },
    }
  }
  return {
    signal: lifetime.signal,
    apiFor,
    openChallenge(id) {
      active(); manifestFor(id)
      const query = ['browser', 'robot'].includes(vision) ? `?vision=${vision}` : ''
      navigate(`${origin.origin}/challenges/${id}/index.html${query}`)
    },
    acceptTurn(input) {
      active()
      const parsed = agentTurnSchema.parse(input)
      for (const recommendation of parsed.recommendations) {
        if (manifestFor(recommendation.challengeId).version !== recommendation.challengeVersion) throw new Error('Challenge version unavailable')
      }
      turn = parsed
      return parsed
    },
    // Only an explicit user/host action follows a validated recommendation.
    followRecommendation() {
      active()
      if (!turn?.recommendations[0]) throw unavailable()
      this.openChallenge(turn.recommendations[0].challengeId)
    },
    setEmbodiment(input, nextPermit) {
      active()
      const parsed = embodimentStateSchema.parse(input)
      outputLifetime.abort(); stop()
      outputLifetime = new AbortController()
      permit?.signal.removeEventListener('abort', stop)
      state = parsed; permit = nextPermit ?? null
      permit?.signal.addEventListener('abort', stop, { once: true })
      if (!virtual()) stop()
    },
    dispose() {
      if (lifetime.signal.aborted) return
      lifetime.abort(); outputLifetime.abort(); stop()
      permit?.signal.removeEventListener('abort', stop)
      permit = null; state = null; turn = null
    },
  }
}
