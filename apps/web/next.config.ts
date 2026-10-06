import type { NextConfig } from 'next'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '../..')
const config: NextConfig = {
  output: 'standalone', outputFileTracingRoot: root, turbopack: { root },
  poweredByHeader: false, agentRules: false,
  // Preserve the incoming origin for Clerk's same-URL rewrite (including IP hosts).
  skipProxyUrlNormalize: true,
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-Frame-Options', value: 'DENY' },
  ] }] },
}
export default config
