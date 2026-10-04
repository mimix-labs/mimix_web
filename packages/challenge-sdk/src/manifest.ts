import { challengeManifestSchema, type ChallengeError, type ChallengeManifest } from '@mimix/contracts'

export type ManifestValidation =
  | { ok: true; manifest: ChallengeManifest }
  | { ok: false; error: ChallengeError; issues: { path: string; message: string }[] }

export function validateManifest(input: unknown): ManifestValidation {
  if (input !== null && typeof input === 'object') {
    const versions = input as Record<string, unknown>
    if (['schemaVersion', 'apiVersion'].some(key => versions[key] !== undefined && versions[key] !== 1)) {
      return { ok: false, error: { code: 'UNSUPPORTED_VERSION', message: 'Only schemaVersion 1 and apiVersion 1 are supported.' }, issues: [] }
    }
  }
  const result = challengeManifestSchema.safeParse(input)
  if (result.success) return { ok: true, manifest: result.data }
  return {
    ok: false,
    error: { code: 'INVALID_MANIFEST', message: 'Manifest does not match schema version 1.' },
    issues: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  }
}
