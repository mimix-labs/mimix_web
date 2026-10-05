import type { Capability, ChallengeError, ChallengeManifest } from '@mimix/contracts'
import type { z } from 'zod'

export function runtimeError(code: ChallengeError['code'], message: string): Error & ChallengeError {
  return Object.assign(new Error(message), { code })
}
export function resolveGrants(manifest: Pick<ChallengeManifest, 'capabilities'>, approved: readonly Capability[], available: readonly Capability[]): Capability[] {
  const declared = [...manifest.capabilities.required, ...manifest.capabilities.optional]
  if (new Set(approved).size !== approved.length || approved.some(cap => !declared.includes(cap))) {
    throw runtimeError('INVALID_INPUT', 'Grants must be unique and declared.')
  }
  for (const cap of manifest.capabilities.required) {
    if (!approved.includes(cap)) throw runtimeError('CAPABILITY_DENIED', 'Required capability was not approved.')
    if (!available.includes(cap)) throw runtimeError('CAPABILITY_UNAVAILABLE', 'Required capability is unavailable.')
  }
  return approved.filter(cap => available.includes(cap))
}
export function validateBundle(source: string): void {
  if (typeof source !== 'string' || !source.trim() || new TextEncoder().encode(source).length > 524288 || /<\/script/i.test(source)) {
    throw runtimeError('INVALID_INPUT', 'Expected an HTML-safe JavaScript bundle of at most 512 KiB.')
  }
}
export function decode<T>(schema: z.ZodType<T>, data: unknown): T | undefined {
  if (typeof data !== 'string' || data.length > 16384) return undefined
  try { const parsed = schema.safeParse(JSON.parse(data)); return parsed.success ? parsed.data : undefined } catch { return undefined }
}
