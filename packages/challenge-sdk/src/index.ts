import type { ChallengeDefinition, ChallengeFactory } from './api.js'
import { validateManifest } from './manifest.js'

export * from './api.js'
export * from './manifest.js'
export * from '@mimix/contracts'

/** Declares a challenge without invoking its factory or granting capabilities. */
export function defineChallenge(manifest: unknown, create: ChallengeFactory): ChallengeDefinition {
  const result = validateManifest(manifest)
  if (!result.ok) throw Object.assign(new Error(result.error.message), result.error, { issues: result.issues })
  return { manifest: result.manifest, create }
}
