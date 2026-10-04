export interface User { id: string; createdAt: string }
export interface ExternalIdentity { id: string; userId: string; provider: string; issuer: string; subject: string }
export interface VerifiedIdentity { provider: string; issuer: string; subject: string; sessionId: string }
export interface IdentityProvider {
  /** Cryptographic evidence only. Must not imply that the remote session is active. */
  verifyToken(token: string): Promise<VerifiedIdentity>
  /** Mandatory on every accepted request, after the verified actor's quota check. */
  verifySession(identity: VerifiedIdentity): Promise<void>
}
export interface IdentityRepository { resolve(identity: VerifiedIdentity): User }
export class IdentityError extends Error {
  constructor(readonly status: 401 | 503) { super(status === 401 ? 'invalid session' : 'identity unavailable') }
}
