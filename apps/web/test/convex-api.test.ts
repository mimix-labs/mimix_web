import assert from 'node:assert/strict'
import test from 'node:test'
import { createConvexApiClient } from '../src/lib/convex-api'
import { ApiError } from '../src/lib/api'
const user={id:'11111111-1111-4111-8111-111111111111',createdAt:'2026-11-05T00:00:00Z'}
test('Convex adapter refuses missing identity before making a request',async()=>{
 let calls=0
 const api=createConvexApiClient('https://example.convex.cloud',null,{query:async()=>{calls++;return user},mutation:async()=>{calls++;return user}})
 await assert.rejects(api.me(),e=>e instanceof ApiError&&e.status===401)
 assert.equal(calls,0)
})
test('initializes identity, validates the shared view and rejects malformed or foreign error data',async()=>{
 const calls:string[]=[]
 const api=createConvexApiClient('https://example.convex.cloud','test-token',{mutation:async()=>{calls.push('ensure');return user},query:async()=>{calls.push('query');return user}})
 assert.deepEqual(await api.me(),user);assert.deepEqual(calls,['ensure','query'])
 const invalid=createConvexApiClient('https://example.convex.cloud','test-token',{mutation:async()=>user,query:async()=>({id:'bad'})})
 await assert.rejects(invalid.me(),e=>e instanceof ApiError&&e.status===502)
 const failed=createConvexApiClient('https://example.convex.cloud','test-token',{mutation:async()=>{throw Error('private upstream details')},query:async()=>user})
 await assert.rejects(failed.me(),e=>e instanceof ApiError&&e.status===503&&!e.message.includes('private'))
})
test('validates cursor before any request and retains progress contract',async()=>{
 let calls=0
 const api=createConvexApiClient('https://example.convex.cloud','token',{mutation:async()=>{calls++;return user},query:async()=>({items:[],nextCursor:null})})
 await assert.rejects(api.progress('invalid'),e=>e instanceof ApiError&&e.status===400);assert.equal(calls,0)
 assert.deepEqual(await api.progress(),{items:[],nextCursor:null})
})
