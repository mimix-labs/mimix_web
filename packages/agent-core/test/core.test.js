import assert from 'node:assert/strict'
import test from 'node:test'
import * as core from '../dist/index.js'
import { agentTurnSchema } from '@mimix/agent-contract'
import { wallEProfile } from '@mimix/character-wall-e'
import { context, authorization, input } from '../../agent-contract/test/fixtures.js'

const clone = value => structuredClone(value)
const call = (name, id = 'call-1') => ({ id, name, arguments: {} })
const otherCharacter = { ...wallEProfile, id: 'luna', displayName: 'Luna', persona: { description: 'Guía serena.', tone: 'calm', locale: 'es' } }
const start = { kind: 'start_challenge', campaignId: 'intro', campaignVersion: '1.0.0', nodeId: 'first', challengeId: 'math', challengeVersion: '1.0.0' }

test('recommendations respect availability, prefer resume and preserve exact versions', () => {
  assert.equal(typeof core.recommendNext, 'function')
  assert.deepEqual(core.recommendNext(context), [start])
  const progress = clone(context)
  progress.campaign.nodes[1].status = 'in_progress'
  assert.deepEqual(core.recommendNext(progress), [{ ...start, kind: 'resume_challenge', nodeId: 'second', challengeId: 'science' }])
  for (const status of ['locked', 'completed']) {
    progress.campaign.nodes.forEach(node => { node.status = status; node.canStart = status === 'completed' })
    assert.deepEqual(core.recommendNext(progress), [])
  }
  assert.deepEqual(core.recommendNext({ ...context, campaign: null }), [])
  assert.deepEqual(core.recommendNext({ ...context, campaign: { ...context.campaign, nodes: [] } }), [])
  const noStart = clone(context); noStart.campaign.nodes[0].canStart = false
  assert.deepEqual(core.recommendNext(noStart), [])
})

test('tool catalog and executor both require permission and every capability', () => {
  assert.equal(typeof core.listTools, 'function')
  assert.deepEqual(core.listTools(authorization).map(tool => tool.name), ['read_context', 'recommend_next'])
  assert.deepEqual(core.executeTool(call('recommend_next'), context, authorization), {
    status: 'ok', callId: 'call-1', name: 'recommend_next', value: { kind: 'recommendations', recommendations: [start] },
  })
  const view = core.executeTool(call('read_context'), context, authorization).value.context
  assert.deepEqual(view, { objectives: context.objectives, campaign: context.campaign })
  for (const patch of [{ permissions: [] }, { permissions: ['agent:turn'] },
    { permissions: ['learning:read'] }, { capabilities: [] }, { capabilities: ['agent'] }, { capabilities: ['progress'] }]) {
    const auth = { ...authorization, ...patch }
    assert.deepEqual(core.listTools(auth), [])
    assert.equal(core.executeTool(call('recommend_next'), context, auth).status, 'denied')
    assert.equal(core.executeTool(call('read_context'), context, auth).status, 'denied')
  }
})

test('unknown tools, injected arguments and cross-owner or conversation access are denied', () => {
  assert.equal(typeof core.executeTool, 'function')
  for (const name of ['motor', 'speak', 'write_progress', '__proto__', 'constructor']) {
    assert.equal(core.executeTool(call(name), context, authorization).code, 'TOOL_DENIED')
  }
  assert.equal(core.executeTool({ ...call('read_context'), arguments: { userId: 'other' } }, context, authorization).code, 'INVALID_INPUT')
  for (const field of ['userId', 'conversationId']) {
    assert.equal(core.executeTool(call('read_context'), context, { ...authorization, [field]: '99999999-9999-4999-8999-999999999999' }).code, 'TOOL_DENIED')
  }
})

test('deterministic turn supports replacing character without changing pedagogy or grants', async () => {
  assert.equal(typeof core.AgentCore, 'function')
  const agent = new core.AgentCore()
  const wallE = await agent.turn(input, context, authorization, wallEProfile)
  const luna = await agent.turn(input, context, authorization, otherCharacter)
  assert.equal(agentTurnSchema.safeParse(wallE).success, true)
  assert.equal(wallE.source, 'deterministic')
  assert.equal(wallE.characterId, 'wall-e')
  assert.equal(luna.characterId, 'luna')
  assert.deepEqual(wallE.recommendations, [start])
  assert.deepEqual(wallE.recommendations, luna.recommendations)
  assert.deepEqual(wallE.toolResults, luna.toolResults)
  assert.notEqual(wallE.text, luna.text)
})

test('turn authorization and malformed input fail before invoking a provider', async () => {
  assert.equal(typeof core.AgentCore, 'function')
  let calls = 0
  const agent = new core.AgentCore({ provider: { async generate() { calls++; return { text: 'Hello', toolCalls: [] } } } })
  for (const patch of [{ permissions: [] }, { capabilities: [] }, { userId: '99999999-9999-4999-8999-999999999999' },
    { conversationId: '99999999-9999-4999-8999-999999999999' }]) {
    await assert.rejects(agent.turn(input, context, { ...authorization, ...patch }, wallEProfile), { code: 'TURN_DENIED' })
  }
  await assert.rejects(agent.turn({ ...input, permissions: ['*'] }, context, authorization, wallEProfile), { code: 'INVALID_INPUT' })
  await assert.rejects(agent.turn(input, context, authorization, { ...wallEProfile, tools: ['motor'] }), { code: 'INVALID_INPUT' })
  assert.equal(calls, 0)
})

test('LLM receives only scoped presentation and allowed tools; proposals cannot bypass policy', async () => {
  assert.equal(typeof core.AgentCore, 'function')
  const requests = []
  const agent = new core.AgentCore({ provider: { async generate(request) {
    requests.push(request)
    return { text: 'Mira el próximo reto.', toolCalls: [call('recommend_next'), call('motor', 'call-2')] }
  } } })
  const result = await agent.turn(input, context, authorization, wallEProfile)
  assert.equal(result.source, 'llm')
  assert.deepEqual(result.recommendations, [start])
  assert.equal(result.toolResults[0].status, 'ok')
  assert.equal(result.toolResults[1].code, 'TOOL_DENIED')
  assert.equal(requests[0].character.displayName, 'Wall-E')
  assert.equal(JSON.stringify(requests[0]).includes(authorization.userId), false)
  assert.equal(JSON.stringify(requests[0]).includes(authorization.conversationId), false)
  const restricted = await agent.turn(input, context, { ...authorization, capabilities: ['agent'] }, otherCharacter)
  assert.deepEqual(requests[1].tools, [])
  assert.equal(requests[1].context, null)
  assert.deepEqual(restricted.recommendations, [])
  assert.ok(restricted.toolResults.every(result => result.status === 'denied'))
})

test('invalid or failed provider returns bounded fallback without leaking its error', async () => {
  assert.equal(typeof core.AgentCore, 'function')
  for (const generate of [
    async () => { throw new Error('SECRET_API_KEY') },
    async () => ({ text: 'x', toolCalls: [call('read_context'), call('read_context')] }),
    async () => ({ text: 'x', toolCalls: [{ ...call('read_context'), arguments: { userId: 'other' } }] }),
    async () => ({ text: 'x'.repeat(2001), toolCalls: [] }),
    async () => null,
  ]) {
    const result = await new core.AgentCore({ provider: { generate } }).turn(input, context, authorization, wallEProfile)
    assert.equal(result.source, 'fallback')
    assert.ok(['PROVIDER_FAILED', 'INVALID_PROPOSAL'].includes(result.fallbackReason))
    assert.deepEqual(result.toolResults, [])
    assert.deepEqual(result.recommendations, [start])
    assert.equal(JSON.stringify(result).includes('SECRET'), false)
  }
})

test('provider timeout aborts the adapter and returns a deterministic fallback', async () => {
  assert.equal(typeof core.AgentCore, 'function')
  let signal
  const agent = new core.AgentCore({ providerTimeoutMs: 10, provider: { generate(_request, options) {
    signal = options.signal
    return new Promise(() => {})
  } } })
  const result = await agent.turn(input, context, authorization, wallEProfile)
  assert.equal(result.fallbackReason, 'PROVIDER_TIMEOUT')
  assert.equal(signal.aborted, true)
  for (const providerTimeoutMs of [0, -1, Infinity, 30001, 1.5]) assert.throws(() => new core.AgentCore({ providerTimeoutMs }), { code: 'INVALID_INPUT' })
})

test('provider and caller mutations cannot change authoritative recommendations or grants during a turn', async () => {
  assert.equal(typeof core.AgentCore, 'function')
  const originalContext = clone(context), originalAuth = { ...clone(authorization), capabilities: ['agent'] }
  const agent = new core.AgentCore({ provider: { async generate(request) {
    originalAuth.capabilities.push('progress')
    originalContext.campaign.nodes[1].status = 'available'
    request.tools.push({ name: 'recommend_next' })
    return { text: 'Hi', toolCalls: [call('recommend_next')] }
  } } })
  const result = await agent.turn(input, originalContext, originalAuth, wallEProfile)
  assert.deepEqual(result.recommendations, [])
  assert.equal(result.toolResults[0].status, 'denied')
  const mutator = new core.AgentCore({ provider: { async generate(request) {
    request.context.campaign.nodes[0].status = 'completed'
    return { text: 'Hi', toolCalls: [call('recommend_next')] }
  } } })
  const untouched = await mutator.turn(input, context, authorization, wallEProfile)
  assert.deepEqual(untouched.recommendations, [start])
  assert.equal(context.campaign.nodes[0].status, 'available')
})

test('reusing the core does not retain conversation history across users', async () => {
  assert.equal(typeof core.AgentCore, 'function')
  const histories = []
  const agent = new core.AgentCore({ provider: { async generate(request) {
    histories.push(request.history)
    return { text: 'Hi', toolCalls: [] }
  } } })
  await agent.turn({ ...input, history: [{ role: 'user', text: 'PRIVATE' }] }, context, authorization, wallEProfile)
  const userId = '99999999-9999-4999-8999-999999999999'
  await agent.turn(input, { ...context, userId }, { ...authorization, userId }, wallEProfile)
  assert.deepEqual(histories[1], [])
})
