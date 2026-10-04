export interface User { id: string; createdAt: string }
export interface ExternalIdentity { id: string; userId: string; provider: string; issuer: string; subject: string }
export interface VerifiedIdentity { provider: string; issuer: string; subject: string; sessionId: string }
export interface IdentityProvider { authenticate(token: string): Promise<VerifiedIdentity> }
export interface IdentityRepository { resolve(identity: VerifiedIdentity): User }
export class IdentityError extends Error {
  constructor(readonly status: 401 | 503) { super(status === 401 ? 'invalid session' : 'identity unavailable') }
}
