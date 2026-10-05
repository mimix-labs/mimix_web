import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { fixture } from './support.js'
import { start } from './http-support.js'
import { CampaignStore } from '../../dist/modules/campaigns/store.js'
import { officialIntro } from '../../dist/modules/campaigns/seed.js'
const base = '/api/campaigns/official-intro/versions/1.0.0'
const path = node => `${base}/nodes/${node}/attempts`
for (const runtime of ['nest', 'express']) {
  test(`${runtime}: campaign HTTP guards progression and exposes strict documented versioned API`, async t => {
    const f = await fixture(t); await new CampaignStore(f.database).publish(officialIntro)
    const request = await start(t, runtime, f.url), input = { idempotencyKey: randomUUID() }
    assert.equal((await request('/api/campaigns', undefined, '')).status, 401)
    assert.equal((await request(base, undefined, 'bad')).status, 401)
    assert.equal((await request(path('shapes'), input, '')).status, 401)
    const catalog = await request('/api/campaigns'); assert.equal(catalog.status, 200)
    assert.equal(catalog.body.items[0].id, 'official-intro')
    const definition = await request(base); assert.deepEqual(definition.body, officialIntro)
    assert.equal(definition.headers.get('cache-control'), 'no-store')
    assert.equal((await request(base + '?userId=bob')).status, 400)
    assert.equal((await request('/api/campaigns?afterId=official-intro')).status, 400)
    assert.equal((await request(base.replace('1.0.0', '9.0.0'))).status, 404)
    assert.equal((await request(path('elements'), input)).status, 409)
    assert.equal((await request(path('missing'), input)).status, 404)
    assert.equal((await request(path('shapes'), { ...input, userId: randomUUID() })).status, 400)
    assert.equal((await request(path('shapes'), input, 'alice', 'PUT')).status, 404)
    const created = await request(path('shapes'), input); assert.equal(created.status, 201)
    assert.equal((await request(path('shapes'), input)).status, 200)
    assert.equal((await request(path('shapes'), { idempotencyKey: randomUUID() })).status, 409)
    const events = `/api/learning/attempts/${created.body.attempt.id}/events`
    const complete = { eventId: randomUUID(), sequence: 2, type: 'attempt_completed', payload: {} }
    assert.equal((await request(events, complete, 'bob')).status, 404)
    assert.equal((await request(events, complete)).status, 201)
    const progress = await request(base + '/progress'); assert.equal(progress.body.completedNodes, 1)
    assert.equal(progress.body.nodes[1].canStart, true)
    assert.equal((await request(base + '/progress', undefined, 'bob')).body.completedNodes, 0)
    assert.equal((await request(base + '/progress?userId=alice')).status, 400)
    assert.equal((await request(path('elements'), input)).status, 409)
    const final = await request(path('elements'), { idempotencyKey: randomUUID() }); assert.equal(final.status, 201)
    assert.equal((await request(`/api/learning/attempts/${final.body.attempt.id}/events`, { ...complete, eventId: randomUUID() })).status, 201)
    assert.equal((await request(base + '/progress')).body.status, 'completed')
    const document = (await request('/api/openapi.json')).body
    const route = document.paths['/api/campaigns/{id}/versions/{version}/nodes/{nodeId}/attempts'].post
    assert.ok(route.responses['409']); assert.ok(route.responses['201'].content['application/json'].schema)
    assert.deepEqual(route.security, [{ bearer: [] }])
  })
  test(`${runtime}: campaign quotas share canonical paths and storage outage fails closed`, async t => {
    const f = await fixture(t); await new CampaignStore(f.database).publish(officialIntro)
    const request = await start(t, runtime, f.url, { MIMIX_RATE_LIMIT_USER: '2' })
    assert.equal((await request('/api/campaigns/a/versions/1.0.0')).status, 404)
    assert.equal((await request('/api/campaigns/b/versions/1.0.0')).status, 404)
    assert.equal((await request('/API/CAMPAIGNS/c/versions/1.0.0/?extra=1')).status, 429)
    assert.equal((await request(base + '/progress')).status, 200)
    await f.database.pool.query('ALTER TABLE campaign_versions RENAME TO campaign_versions_unavailable')
    const unavailable = await request(base + '/progress')
    assert.equal(unavailable.status, 503)
    assert.equal(JSON.stringify(unavailable.body).includes('postgres'), false)
  })
  test(`${runtime}: campaign endpoints and OpenAPI are disabled without PostgreSQL`, async t => {
    const request = await start(t, runtime, '', { MIMIX_DATA_STORE: 'file' })
    assert.equal((await request('/api/campaigns')).status, 404)
    assert.equal((await request(path('shapes'), { idempotencyKey: randomUUID() })).status, 404)
    const doc = (await request('/api/openapi.json')).body
    assert.equal(Object.keys(doc.paths).some(path => path.startsWith('/api/campaigns')), false)
  })
}
