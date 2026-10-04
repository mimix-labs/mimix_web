import { setTimeout as delay } from 'node:timers/promises'

// Wait for a complete HTTP response, not a fixed number of connection attempts.
// Contract assertions belong to the caller: a 500 or wrong body must fail once.
export async function waitForResponse(child, url, { timeoutMs = 15000, output = () => '' } = {}) {
  const controller = new AbortController()
  const onExit = (code, signal) => controller.abort(new Error(`API exited before readiness (code=${code}, signal=${signal})`))
  const onError = error => controller.abort(error)
  child.once('exit', onExit)
  child.once('error', onError)
  const timer = setTimeout(() => controller.abort(new Error(`API readiness deadline exceeded (${timeoutMs} ms)`)), timeoutMs)
  if (child.exitCode !== null || child.signalCode !== null) onExit(child.exitCode, child.signalCode)
  try {
    for (;;) {
      try {
        const response = await fetch(url, { signal: controller.signal })
        return { status: response.status, body: await response.text() }
      } catch (error) {
        if (controller.signal.aborted || error.cause?.code !== 'ECONNREFUSED') throw error
      }
      await delay(100, undefined, { signal: controller.signal })
    }
  } catch (error) {
    const reason = controller.signal.aborted ? controller.signal.reason : error
    throw new Error(`${reason.message}\n${output()}`, { cause: error })
  } finally {
    clearTimeout(timer)
    child.off('exit', onExit)
    child.off('error', onError)
  }
}
