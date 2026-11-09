import test from 'node:test'
import assert from 'node:assert/strict'
import { InputSystem } from '../src/systems/InputSystem.js'

test('keys held before Play stay blocked until released; a new press moves normally', () => {
  const previousWindow = globalThis.window
  const events = new EventTarget()
  globalThis.window = events
  const input = new InputSystem({ querySelector: () => null })
  const key = (type, code) => {
    const event = new Event(type)
    Object.defineProperty(event, 'code', { value: code })
    events.dispatchEvent(event)
  }
  try {
    input.setEnabled(false)
    key('keydown', 'KeyW')
    assert.equal(input.isPressed('KeyW'), false)
    input.setEnabled(true)
    key('keydown', 'KeyW')
    assert.equal(input.isPressed('KeyW'), false)
    key('keyup', 'KeyW')
    key('keydown', 'KeyW')
    assert.equal(input.isPressed('KeyW'), true)
    input.setEnabled(false)
    assert.equal(input.isPressed('KeyW'), false)
  } finally {
    input.dispose()
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
