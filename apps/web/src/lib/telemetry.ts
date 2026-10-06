type Event = { event: 'api_read'; operation: 'me' | 'progress'; status: number; durationMs: number } | { event: 'render_error'; route: string }
// Deliberate allowlist: no URLs, query strings, user IDs, tokens or error messages.
export function observe(event: Event) { console.info(JSON.stringify({ service: 'mimix-web', ...event })) }
