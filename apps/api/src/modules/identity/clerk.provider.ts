import { createClerkClient, verifyToken } from '@clerk/backend'
import { IdentityError, type IdentityProvider, type VerifiedIdentity } from './identity.contract.js'

export interface ClerkConfig { secretKey: string; jwtKey?: string; issuer: string; authorizedParties: string[] }
interface Sessions { getSession(id: string): Promise<{ id: string; userId: string; status: string; expireAt: number }> }
export class ClerkIdentityProvider implements IdentityProvider {
  private readonly sessions: Sessions
  constructor(private readonly config: ClerkConfig, sessions?: Sessions) {
    this.sessions = sessions ?? createClerkClient({ secretKey: config.secretKey }).sessions
  }
  async authenticate(token: string): Promise<VerifiedIdentity> {
    let claims
    try {
      claims = await verifyToken(token, { secretKey: this.config.secretKey, jwtKey: this.config.jwtKey, authorizedParties: this.config.authorizedParties, clockSkewInMs: 0 })
      if (claims.iss !== this.config.issuer || typeof claims.azp !== 'string' || !this.config.authorizedParties.includes(claims.azp)
        || typeof claims.sub !== 'string' || !claims.sub || typeof claims.sid !== 'string' || !claims.sid || claims.sts === 'pending') throw new Error()
    } catch { throw new IdentityError(401) }
    let session
    try { session = await this.sessions.getSession(claims.sid) } catch (error) {
      const status = (error as { status?: number }).status
      throw new IdentityError(status === 404 ? 401 : 503)
    }
    if (session.status !== 'active' || session.id !== claims.sid || session.userId !== claims.sub || session.expireAt <= Date.now()) throw new IdentityError(401)
    return { provider: 'clerk', issuer: claims.iss, subject: claims.sub, sessionId: claims.sid }
  }
}
