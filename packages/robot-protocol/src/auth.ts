/** Temporary machine credential, shared by HTTP and SSE; never a Clerk token. */
export function bridgeHeaders(token: string, stream = false): Record<string, string> {
  if (/[\r\n]/.test(token)) throw new Error('Invalid bridge credential')
  return {
    Accept: stream ? 'text/event-stream' : 'application/json',
    ...(token ? { 'X-Mimix-Robot-Token': token } : {}),
    ...(stream ? { 'Cache-Control': 'no-cache' } : {}),
  }
}
