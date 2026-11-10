import { challengeManifestSchema } from '@mimix/contracts'
import { internalMutation } from './_generated/server'
import { ConvexError, v } from 'convex/values'
// Deployment/operator entry only. A browser cannot install or enable a challenge.
export const install = internalMutation({
  args: { manifest: v.any() }, returns: v.null(),
  handler: async (ctx, {manifest}) => {
    const parsed = challengeManifestSchema.safeParse(manifest)
    if (!parsed.success) throw new ConvexError({code:'INVALID_MANIFEST'})
    const m = parsed.data
    const manifestJson = JSON.stringify(m)
    const existing = await ctx.db.query('challenges').withIndex('by_challengeId_and_version',q=>q.eq('challengeId',m.id).eq('version',m.version)).unique()
    if (existing) {
      if (existing.manifestJson !== manifestJson) throw new ConvexError({code:'IMMUTABLE_VERSION'})
      return null
    }
    await ctx.db.insert('challenges',{challengeId:m.id,version:m.version,manifestJson,progress:[...m.capabilities.required,...m.capabilities.optional].includes('progress')})
    return null
  },
})
