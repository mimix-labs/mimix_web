/** Own async resources even when permission/model acquisition finishes after leaving. */
export async function acquireResource(signal, acquire, release) {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  const resource = await acquire()
  if (signal.aborted) { release(resource); throw new DOMException('Cancelled', 'AbortError') }
  signal.addEventListener('abort', () => release(resource), { once: true })
  return resource
}
