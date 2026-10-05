import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function isDeviceTokenKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value) && Buffer.from(value, 'base64url').toString('base64url') === value
}
/** Authenticity for admission only; PostgreSQL remains the revocation/expiry authority. */
export class DeviceTokens {
  private readonly key: Buffer
  constructor(key: string) {
    if (!isDeviceTokenKey(key)) throw new Error('invalid device token key')
    this.key = Buffer.from(key, 'base64url')
  }
  private signature(nonce: string): Buffer {
    return createHmac('sha256', this.key).update(`mimix-device-session:v1:${nonce}`).digest()
  }
  issue(): string {
    const nonce = randomBytes(32).toString('base64url')
    return `${nonce}.${this.signature(nonce).toString('base64url')}`
  }
  identity(token: string): string | undefined {
    if (!/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) return undefined
    const [nonce, signature] = token.split('.')
    if (Buffer.from(nonce, 'base64url').toString('base64url') !== nonce) return undefined
    const supplied = Buffer.from(signature, 'base64url')
    if (supplied.toString('base64url') !== signature || !timingSafeEqual(supplied, this.signature(nonce))) return undefined
    return createHash('sha256').update(token).digest('hex')
  }
}
