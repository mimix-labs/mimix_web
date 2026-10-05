import assert from 'node:assert/strict'
import test from 'node:test'
import * as source from '../../packages/challenge-browser/dist/index.js'
test('trusted surface serializes lifecycle, suppresses paused input and disposes once', async () => {
  assert.equal(typeof source.createSurfaceChallenge, 'function', 'surface lifecycle must exist')
  const events = [], controller = new AbortController()
  const handle = source.createSurfaceChallenge({signal:controller.signal}, {
    initialize:()=>{events.push('initialize')}, start:()=>{events.push('start')}, pause:()=>{events.push('pause')},
    resume:()=>{events.push('resume')}, dispose:()=>{events.push('dispose')}, handleHands:()=>{events.push('hands')},
  })
  await assert.rejects(handle.start(), {code:'INVALID_LIFECYCLE'})
  await handle.initialize(); await handle.start(); handle.handleHands({})
  await handle.pause(); handle.handleHands({}); await handle.resume(); handle.handleHands({})
  controller.abort(); await handle.dispose(); await handle.dispose(); handle.handleHands({})
  assert.deepEqual(events,['initialize','start','hands','pause','resume','hands','dispose'])
  await assert.rejects(handle.start(), {code:'ABORTED'})
})
test('abort during async setup waits then releases late resources', async () => {
  assert.equal(typeof source.createSurfaceChallenge, 'function')
  const controller = new AbortController(), events=[]
  let release = () => {}
  const setup = new Promise(resolve=>{release=()=>resolve(undefined)})
  const handle = source.createSurfaceChallenge({signal:controller.signal}, {
    initialize:async()=>{await setup;events.push('created')}, dispose:()=>{events.push('released')},
  })
  const initializing=handle.initialize()
  controller.abort(); release()
  await assert.rejects(initializing,{code:'ABORTED'})
  await handle.dispose()
  assert.deepEqual(events,['created','released'])
})
