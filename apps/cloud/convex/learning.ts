import { ConvexError, v, type Infer } from 'convex/values'
import { authenticatedMutation, authenticatedQuery } from './lib/auth'
import { attemptView, eventInput, learningView, progressView } from './schema'
import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'

const uuid = (input: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) throw new ConvexError({code:'INVALID_INPUT'})
  return input.toLowerCase()
}
function view(a: Doc<'attempts'>) {
  return {
    attempt: {id:a.uuid,challengeId:a.challengeId,challengeVersion:a.challengeVersion,createdAt:a.createdAt},
    progress: {attemptId:a.uuid,status:a.status,lastSequence:a.lastSequence,answers:a.answers,correctAnswers:a.correctAnswers,hints:a.hints},
  }
}
function userRequired(user: Doc<'users'> | null) {
  if (!user) throw new ConvexError({code:'IDENTITY_NOT_READY'})
  return user
}
async function owned(ctx: QueryCtx, user: Doc<'users'>, attemptId: string) {
  const a=await ctx.db.query('attempts').withIndex('by_uuid',q=>q.eq('uuid',uuid(attemptId))).unique()
  if (!a || a.userId!==user._id) throw new ConvexError({code:'NOT_FOUND'})
  return a
}
export const start=authenticatedMutation({
  args:{idempotencyKey:v.string(),challengeId:v.string(),challengeVersion:v.string()},
  returns:v.object({attempt:attemptView,duplicate:v.boolean()}),
  handler:async(ctx,args)=>{
    const user=userRequired(ctx.user), key=uuid(args.idempotencyKey)
    for(const ref of [args.challengeId,args.challengeVersion]) if(!/^[A-Za-z0-9._-]{1,80}$/.test(ref)) throw new ConvexError({code:'INVALID_INPUT'})
    const prior=await ctx.db.query('attempts').withIndex('by_userId_and_idempotencyKey',q=>q.eq('userId',user._id).eq('idempotencyKey',key)).unique()
    if(prior){
      if(prior.challengeId!==args.challengeId || prior.challengeVersion!==args.challengeVersion) throw new ConvexError({code:'CONFLICT'})
      return {attempt:view(prior).attempt,duplicate:true}
    }
    const challenge=await ctx.db.query('challenges').withIndex('by_challengeId_and_version',q=>q.eq('challengeId',args.challengeId).eq('version',args.challengeVersion)).unique()
    if(!challenge)throw new ConvexError({code:'CHALLENGE_UNAVAILABLE'})
    if(!challenge.progress)throw new ConvexError({code:'PROGRESS_UNAVAILABLE'})
    const id=crypto.randomUUID(),createdAt=new Date().toISOString()
    const attemptId=await ctx.db.insert('attempts',{uuid:id,userId:user._id,idempotencyKey:key,challengeId:args.challengeId,challengeVersion:args.challengeVersion,createdAt,status:'active',lastSequence:1,answers:0,correctAnswers:0,hints:0})
    await ctx.db.insert('events',{attemptId,eventId:crypto.randomUUID(),sequence:1,type:'attempt_started',payload:{},receivedAt:createdAt})
    return {attempt:{id,challengeId:args.challengeId,challengeVersion:args.challengeVersion,createdAt},duplicate:false}
  },
})
const eventView=v.object({attemptId:v.string(),eventId:v.string(),sequence:v.number(),type:v.union(v.literal('answer_submitted'),v.literal('hint_requested'),v.literal('attempt_completed'),v.literal('attempt_abandoned')),payload:v.union(v.object({}),v.object({correct:v.boolean()})),receivedAt:v.string()})
export const record=authenticatedMutation({
  args:{attemptId:v.string(),event:eventInput},returns:v.object({event:eventView,duplicate:v.boolean()}),
  handler:async(ctx,{attemptId,event})=>{
    const a=await owned(ctx,userRequired(ctx.user),attemptId)
    const eventId=uuid(event.eventId)
    if(!Number.isInteger(event.sequence)||event.sequence<2||event.sequence>1000000)throw new ConvexError({code:'INVALID_INPUT'})
    const prior=await ctx.db.query('events').withIndex('by_attemptId_and_eventId',q=>q.eq('attemptId',a._id).eq('eventId',eventId)).unique()
    const out=(receivedAt:string)=>({attemptId:a.uuid,...event,eventId,receivedAt})
    if(prior){
      if(prior.sequence!==event.sequence || prior.type!==event.type || JSON.stringify(prior.payload)!==JSON.stringify(event.payload))throw new ConvexError({code:'CONFLICT'})
      return {event:out(prior.receivedAt),duplicate:true}
    }
    if(a.status!=='active'||event.sequence!==a.lastSequence+1)throw new ConvexError({code:'CONFLICT'})
    const receivedAt=new Date().toISOString()
    await ctx.db.insert('events',{attemptId:a._id,...event,eventId,receivedAt})
    const type:Infer<typeof eventInput>['type']=event.type
    await ctx.db.patch(a._id,{
      lastSequence:event.sequence,answers:a.answers+Number(type==='answer_submitted'),
      correctAnswers:a.correctAnswers+Number(event.type==='answer_submitted'&&event.payload.correct),
      hints:a.hints+Number(type==='hint_requested'),
      status:type==='attempt_completed'?'completed':type==='attempt_abandoned'?'abandoned':'active',
    })
    return {event:out(receivedAt),duplicate:false}
  },
})
export const get=authenticatedQuery({
  args:{attemptId:v.string()},returns:learningView,
  handler:async(ctx,{attemptId})=>view(await owned(ctx,userRequired(ctx.user),attemptId)),
})
export const progress=authenticatedQuery({
  args:{after:v.optional(v.string())},returns:v.object({items:v.array(v.object({attempt:attemptView,progress:progressView})),nextCursor:v.union(v.string(),v.null())}),
  handler:async(ctx,{after})=>{
    const user=userRequired(ctx.user),cursor=after===undefined?undefined:uuid(after)
    if(cursor){
      const previous=await ctx.db.query('attempts').withIndex('by_userId_and_uuid',q=>q.eq('userId',user._id).eq('uuid',cursor)).unique()
      if(!previous)throw new ConvexError({code:'INVALID_INPUT'})
    }
    const rows=await ctx.db.query('attempts').withIndex('by_userId_and_uuid',q=>cursor?q.eq('userId',user._id).gt('uuid',cursor):q.eq('userId',user._id)).order('asc').take(51)
    return {items:rows.slice(0,50).map(view),nextCursor:rows.length>50?rows[49].uuid:null}
  },
})
