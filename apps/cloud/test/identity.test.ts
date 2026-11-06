import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api } from '../convex/_generated/api'
import schema from '../convex/schema'
const modules = import.meta.glob('../convex/**/*.ts')
const alice = { issuer: 'https://clerk.example', subject: 'user_alice', tokenIdentifier: 'https://clerk.example|user_alice' }
describe('Clerk identity boundary', () => {
  test('rejects unauthenticated reads and writes', async () => {
    const t = convexTest(schema, modules)
    await expect(t.mutation(api.identity.ensure, {})).rejects.toThrow('UNAUTHENTICATED')
    await expect(t.query(api.identity.me, {})).rejects.toThrow('UNAUTHENTICATED')
  })
  test('persists one internal UUID across requests and changing email', async () => {
    const t = convexTest(schema, modules)
    const first = await t.withIdentity({ ...alice, email: 'old@example.test' }).mutation(api.identity.ensure, {})
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/)
    const second = await t.withIdentity({ ...alice, email: 'new@example.test' }).mutation(api.identity.ensure, {})
    expect(second).toEqual(first)
    expect(await t.withIdentity(alice).query(api.identity.me, {})).toEqual(first)
  })
  test('same subject at a different issuer and another user remain separate', async () => {
    const t = convexTest(schema, modules)
    const a = await t.withIdentity(alice).mutation(api.identity.ensure, {})
    const b = await t.withIdentity({ ...alice, subject: 'user_bob', tokenIdentifier: 'https://clerk.example|user_bob' }).mutation(api.identity.ensure, {})
    const c = await t.withIdentity({ ...alice, issuer: 'https://other.example', tokenIdentifier: 'https://other.example|user_alice' }).mutation(api.identity.ensure, {})
    expect(new Set([a.id, b.id, c.id]).size).toBe(3)
  })
})
