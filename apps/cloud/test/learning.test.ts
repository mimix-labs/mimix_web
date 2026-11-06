import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import schema from '../convex/schema'
const modules = import.meta.glob('../convex/**/*.ts')
const alice = { issuer: 'https://clerk.example', subject: 'alice', tokenIdentifier: 'clerk|alice' }
const bob = { ...alice, subject: 'bob', tokenIdentifier: 'clerk|bob' }
const manifest = { schemaVersion: 1, apiVersion: 1, id: 'tracked-fixture', version: '1.0.0', title: 'Test only', description: 'Authorized learning fixture', entrypoint: 'index.js', objectives: [{ id: 'learn', description: 'Practice' }], completion: { description: 'Explicit event' }, capabilities: { required: ['progress'], optional: [] } }
async function setup() {
 const t = convexTest(schema, modules)
 const a = t.withIdentity(alice), b = t.withIdentity(bob)
 await a.mutation(api.identity.ensure, {}); await b.mutation(api.identity.ensure, {})
 await t.mutation(internal.catalog.install, { manifest })
 return { t, a, b }
}
const start = () => ({ idempotencyKey: crypto.randomUUID(), challengeId: manifest.id, challengeVersion: manifest.version })
const hint = () => ({ eventId: crypto.randomUUID(), sequence: 2, type: 'hint_requested' as const, payload: {} })
describe('authorized learning', () => {
 test('requires identity and explicit manifest capability', async () => {
  const {t,a}=await setup()
  await expect(t.mutation(api.learning.start,start())).rejects.toThrow('UNAUTHENTICATED')
  await expect(a.mutation(api.learning.start,{...start(),challengeId:'missing'})).rejects.toThrow('CHALLENGE_UNAVAILABLE')
  await t.mutation(internal.catalog.install,{manifest:{...manifest,id:'exploration',capabilities:{required:[],optional:[]}}})
  await expect(a.mutation(api.learning.start,{...start(),challengeId:'exploration'})).rejects.toThrow('PROGRESS_UNAVAILABLE')
 })
 test('stable idempotent attempt, no completion on visit and tenant isolation',async()=>{
  const {a,b}=await setup();const input=start()
  const first=await a.mutation(api.learning.start,input)
  const again=await a.mutation(api.learning.start,input)
  expect(again.attempt).toEqual(first.attempt);expect(again.duplicate).toBe(true)
  const own=await a.query(api.learning.get,{attemptId:first.attempt.id})
  expect(own.progress).toMatchObject({status:'active',lastSequence:1,answers:0,hints:0})
  await expect(b.query(api.learning.get,{attemptId:first.attempt.id})).rejects.toThrow('NOT_FOUND')
  await expect(b.mutation(api.learning.record,{attemptId:first.attempt.id,event:hint()})).rejects.toThrow('NOT_FOUND')
  expect(await b.query(api.learning.progress,{})).toEqual({items:[],nextCursor:null})
  const other=await b.mutation(api.learning.start,input);expect(other.attempt.id).not.toBe(first.attempt.id)
 })
 test('retries are exact; sequences and terminal states are enforced',async()=>{
  const {a}=await setup();const first=await a.mutation(api.learning.start,start());const attemptId=first.attempt.id
  const event=hint();const written=await a.mutation(api.learning.record,{attemptId,event})
  expect(written.duplicate).toBe(false)
  expect((await a.mutation(api.learning.record,{attemptId,event})).duplicate).toBe(true)
  await expect(a.mutation(api.learning.record,{attemptId,event:{...event,type:'attempt_completed'}})).rejects.toThrow('CONFLICT')
  await expect(a.mutation(api.learning.record,{attemptId,event:{...hint(),sequence:5}})).rejects.toThrow('CONFLICT')
  await a.mutation(api.learning.record,{attemptId,event:{...hint(),sequence:3,type:'answer_submitted',payload:{correct:true}}})
  await a.mutation(api.learning.record,{attemptId,event:{...hint(),sequence:4,type:'attempt_completed'}})
  expect((await a.query(api.learning.get,{attemptId})).progress).toMatchObject({status:'completed',hints:1,answers:1,correctAnswers:1,lastSequence:4})
  await expect(a.mutation(api.learning.record,{attemptId,event:{...hint(),sequence:5}})).rejects.toThrow('CONFLICT')
 })
 test('one creation survives concurrent retries and a key cannot switch challenge',async()=>{
  const {a}=await setup();const input=start()
  const rows=await Promise.all(Array.from({length:4},()=>a.mutation(api.learning.start,input)))
  expect(new Set(rows.map(r=>r.attempt.id)).size).toBe(1)
  expect(rows.filter(r=>!r.duplicate)).toHaveLength(1)
  await expect(a.mutation(api.learning.start,{...input,challengeVersion:'2.0.0'})).rejects.toThrow('CONFLICT')
 })
 test('installed versions are immutable and malformed manifests cannot enable progress',async()=>{
  const {t}=await setup()
  await expect(t.mutation(internal.catalog.install,{manifest:{...manifest,title:'Changed'}})).rejects.toThrow('IMMUTABLE_VERSION')
  await expect(t.mutation(internal.catalog.install,{manifest:{...manifest,id:'bad',apiVersion:9}})).rejects.toThrow('INVALID_MANIFEST')
 })
 test('rejects malformed identifiers, payloads and foreign pagination cursors',async()=>{
  const {a,b}=await setup();const created=await a.mutation(api.learning.start,start())
  await expect(a.mutation(api.learning.start,{...start(),idempotencyKey:'invalid'})).rejects.toThrow('INVALID_INPUT')
  await expect(a.mutation(api.learning.record,{attemptId:created.attempt.id,event:{...hint(),sequence:2.5}})).rejects.toThrow('INVALID_INPUT')
  await expect(a.mutation(api.learning.record,{attemptId:created.attempt.id,event:{...hint(),payload:{userId:'forged'}}})).rejects.toThrow()
  await expect(b.query(api.learning.progress,{after:created.attempt.id})).rejects.toThrow('INVALID_INPUT')
 })
 test('bounded keyset pagination returns only own attempts without omissions',async()=>{
  const {a,b}=await setup()
  for(let i=0;i<51;i++)await a.mutation(api.learning.start,start())
  await b.mutation(api.learning.start,start())
  const first=await a.query(api.learning.progress,{})
  expect(first.items).toHaveLength(50);expect(first.nextCursor).toBeTruthy()
  const second=await a.query(api.learning.progress,{after:first.nextCursor!})
  expect(second.items).toHaveLength(1);expect(second.nextCursor).toBeNull()
  expect(new Set([...first.items,...second.items].map(x=>x.attempt.id)).size).toBe(51)
 })
})
