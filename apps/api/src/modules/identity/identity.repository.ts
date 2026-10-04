import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ExternalIdentity, IdentityRepository, User, VerifiedIdentity } from './identity.contract.js'

interface Snapshot { version: 1; users: User[]; identities: ExternalIdentity[] }
// Transitional single-process repository. No emails or session tokens are persisted.
export class FileIdentityRepository implements IdentityRepository {
  constructor(private readonly file: string) { this.read() }
  private read(): Snapshot {
    if (!existsSync(this.file)) return { version: 1, users: [], identities: [] }
    const data = JSON.parse(readFileSync(this.file, 'utf8')) as Snapshot
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    if (data.version !== 1 || !Array.isArray(data.users) || !Array.isArray(data.identities)
      || data.users.some(u => !uuid.test(u.id) || !Number.isFinite(Date.parse(u.createdAt)))
      || new Set(data.users.map(u => u.id)).size !== data.users.length
      || data.identities.some(i => !uuid.test(i.id) || !data.users.some(u => u.id === i.userId) || ![i.provider, i.issuer, i.subject].every(v => typeof v === 'string' && v.length > 0))
      || new Set(data.identities.map(i => i.id)).size !== data.identities.length
      || new Set(data.identities.map(i => JSON.stringify([i.provider, i.issuer, i.subject]))).size !== data.identities.length) throw new Error('Invalid identity store')
    return data
  }
  resolve(identity: VerifiedIdentity): User {
    const data = this.read()
    const existing = data.identities.find(i => i.provider === identity.provider && i.issuer === identity.issuer && i.subject === identity.subject)
    if (existing) return { ...data.users.find(u => u.id === existing.userId)! }
    const user = { id: randomUUID(), createdAt: new Date().toISOString() }
    data.users.push(user)
    data.identities.push({ id: randomUUID(), userId: user.id, provider: identity.provider, issuer: identity.issuer, subject: identity.subject })
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
    const temporary = `${this.file}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temporary, 'wx', 0o600)
      try { writeFileSync(fd, JSON.stringify(data)); fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(temporary, this.file)
      const dir = openSync(dirname(this.file), 'r')
      try { fsyncSync(dir) } finally { closeSync(dir) }
    } finally { if (existsSync(temporary)) unlinkSync(temporary) }
    return { ...user }
  }
}
