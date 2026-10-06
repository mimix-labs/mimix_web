import { z } from 'zod'
import { validateManifest, speakInputSchema, behaviorIntentSchema, learningRecordSchema, campaignIdSchema, campaignVersionSchema } from '@mimix/challenge-sdk'
import math from '@mimix/challenge-mathematics/manifest.json' with { type: 'json' }
import science from '@mimix/challenge-science/manifest.json' with { type: 'json' }
import { agentTurnSchema } from '@mimix/agent-contract'
import { embodimentStateSchema } from '@mimix/embodiment-contract'

const attemptBindingSchema = z.strictObject({
  challengeId: campaignIdSchema,
  challengeVersion: campaignVersionSchema,
  attemptId: z.uuid().transform(value => value.toLowerCase()),
})
const unavailable = () => Object.assign(new Error('Capability unavailable in this host'), { code: 'CAPABILITY_UNAVAILABLE' })

/** The embedding host owns authorization. This adapter never creates grants,
 * attempts, identities, motor commands, model URLs or completion events. */
export function createWorldHost({ challengeOrigin, navigate, vision, adapters = {}, grants = [], challenges = [math, science] }) {
  const origin = new URL(challengeOrigin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid challenge origin')
  // Only the embedding host installs manifests, never a challenge message.
  const manifests = new Map()
  for (const input of challenges) {
    const result = validateManifest(input)
    if (!result.ok) throw new Error(result.error.message)
    campaignIdSchema.parse(result.manifest.id)
    if (manifests.has(result.manifest.id)) throw new Error('Duplicate installed challenge')
    manifests.set(result.manifest.id, result.manifest)
  }
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
  const apiFor = (id, hostAttempt) => {
    active()
    const manifest = manifestFor(id)
    // The host binds an already-authorized attempt before handing MimixAPI to a
    // challenge. Parsing snapshots it; child input can never replace this scope.
    const attempt = hostAttempt === undefined ? undefined : attemptBindingSchema.parse(hostAttempt)
    if (attempt && (attempt.challengeId !== manifest.id || attempt.challengeVersion !== manifest.version)) {
      throw new Error('Attempt does not match the installed challenge')
    }
    const attribution = Object.freeze({ challengeId: manifest.id, challengeVersion: manifest.version, ...(attempt ? { attemptId: attempt.attemptId } : {}) })
    const allowed = capability => [...manifest.capabilities.required, ...manifest.capabilities.optional].includes(capability) && grants.includes(capability)
    const invoke = async (capability, schema, input, call) => {
      active()
      const parsed = schema.parse(input)
      if (!allowed(capability) || !call || (capability !== 'progress' && !virtual())) throw unavailable()
      if (capability === 'progress' && !attempt) throw unavailable()
      await call(parsed, Object.freeze({ ...attribution, signal: capability === 'progress' ? lifetime.signal : AbortSignal.any([lifetime.signal, outputLifetime.signal, permit.signal]) }))
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
