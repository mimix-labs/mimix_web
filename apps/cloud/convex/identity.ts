import { ConvexError } from 'convex/values'
import { authenticatedMutation, authenticatedQuery } from './lib/auth'
import { userView } from './schema'
export const ensure = authenticatedMutation({
  args: {}, returns: userView,
  handler: async ctx => {
    if (ctx.user) return { id: ctx.user.uuid, createdAt: ctx.user.createdAt }
    const uuid = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    await ctx.db.insert('users', { uuid, createdAt, issuer: ctx.identity.issuer, subject: ctx.identity.subject })
    return { id: uuid, createdAt }
  },
})
export const me = authenticatedQuery({
  args: {}, returns: userView,
  handler: async ctx => {
    if (!ctx.user) throw new ConvexError({ code: 'IDENTITY_NOT_READY' })
    return { id: ctx.user.uuid, createdAt: ctx.user.createdAt }
  },
})
