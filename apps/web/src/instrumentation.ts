import type { Instrumentation } from 'next'
import { observe } from './lib/telemetry'
export const onRequestError: Instrumentation.onRequestError = (_error, _request, context) => {
  // Framework route pattern only, never the request path or exception payload.
  observe({ event: 'render_error', route: context.routePath })
}
