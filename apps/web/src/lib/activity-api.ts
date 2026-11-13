const endpoints: Record<string, string> = {
  '/api/vision/config': 'GET',
  '/api/vision/stream': 'GET',
  '/api/vision/video': 'GET',
  '/api/robot/commands/stream': 'GET',
  '/api/robot/context': 'POST',
  '/api/challenges/events': 'POST',
}

// Preserve the existing activity transports when their pages share Next's origin.
// This is an allowlist relay, not a new robot or identity API.
export async function forwardActivityRequest(request: Request, apiOrigin: string) {
  const url = new URL(request.url)
  const method = endpoints[url.pathname]
  if (!method) return new Response(null, { status: 404 })
  if (request.method !== method) return new Response(null, { status: 405, headers: { Allow: method } })
  const headers = new Headers()
  for (const name of ['accept', 'authorization', 'content-type', 'last-event-id']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const init: RequestInit & { duplex?: 'half' } = {
    method, headers, signal: request.signal, cache: 'no-store', redirect: 'manual',
    ...(method === 'POST' ? { body: request.body, duplex: 'half' as const } : {}),
  }
  try {
    const response = await fetch(new URL(url.pathname + url.search, apiOrigin), init)
    const output = new Headers({ 'Cache-Control': 'no-store' })
    const type = response.headers.get('content-type')
    if (type) output.set('Content-Type', type)
    return new Response(response.body, { status: response.status, headers: output })
  } catch {
    return Response.json({ error: 'Servicio no disponible' }, { status: 503 })
  }
}
