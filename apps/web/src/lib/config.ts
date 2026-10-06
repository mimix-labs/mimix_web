import 'server-only'
function origin(value: string, name: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`Invalid ${name}`)
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' && !['localhost', '127.0.0.1', 'api'].includes(url.hostname)) throw new Error(`${name} requires HTTPS`)
  return url.origin
}
export function webConfig() {
  const authMode = process.env.MIMIX_WEB_AUTH_MODE ?? 'disabled'
  if (!['disabled', 'clerk'].includes(authMode)) throw new Error('Invalid MIMIX_WEB_AUTH_MODE')
  if (authMode === 'clerk' && (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY)) throw new Error('Clerk keys required')
  return {
    clerk: authMode === 'clerk',
    apiOrigin: origin(process.env.MIMIX_API_ORIGIN ?? 'http://127.0.0.1:4000', 'MIMIX_API_ORIGIN'),
    legacyOrigin: origin(process.env.MIMIX_LEGACY_ORIGIN ?? 'http://localhost:5173', 'MIMIX_LEGACY_ORIGIN'),
  }
}
