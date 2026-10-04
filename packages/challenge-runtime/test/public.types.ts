import { mountChallenge, type HostAdapters, type RuntimeHandle } from '@mimix/challenge-runtime'
const adapters: HostAdapters = {
  'progress.record': async (event, operation) => {
    operation.signal.throwIfAborted()
    operation.requestId satisfies string
    if (event.type === 'answer_submitted') event.payload.correct satisfies boolean
    // @ts-expect-error identity belongs to the adapter, not the challenge envelope
    void event.userId
  },
}
void adapters
// @ts-expect-error low-level motors are not a public capability
const motors: HostAdapters = { 'motors.move': async () => {} }
void motors
// @ts-expect-error host cannot approve undeclared capability names
mountChallenge({ container: document.body, manifest: {}, bundle: '', approvedCapabilities: ['clerk'], adapters: {} })
declare const handle: RuntimeHandle
handle.ready satisfies Promise<void>
handle.revoke('agent')
// @ts-expect-error runtime state is host-owned
handle.state = 'running'
// @ts-expect-error acknowledgements only travel child to host
const wrongDirection: import('@mimix/contracts').HostMessage = { v: 1, session: 'a'.repeat(32), kind: 'ack', id: 1, ok: true }
void wrongDirection
// @ts-expect-error results only travel host to child
const wrongResult: import('@mimix/contracts').ChildMessage = { v: 1, session: 'a'.repeat(32), kind: 'result', id: 1, ok: true }
void wrongResult
