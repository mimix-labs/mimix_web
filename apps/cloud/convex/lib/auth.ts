import { customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions'
import { ConvexError } from 'convex/values'
import { mutation, query, type QueryCtx } from '../_generated/server'

async function identityContext(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || !identity.issuer || !identity.subject) throw new ConvexError({ code: 'UNAUTHENTICATED' })
  const user = await ctx.db.query('users').withIndex('by_issuer_and_subject', q => q.eq('issuer', identity.issuer).eq('subject', identity.subject)).unique()
  return { identity, user }
}
export const authenticatedQuery = customQuery(query, customCtx(identityContext))
export const authenticatedMutation = customMutation(mutation, customCtx(identityContext))
