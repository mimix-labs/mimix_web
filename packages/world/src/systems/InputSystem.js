export class InputSystem {
  constructor(root = document) {
    this.keys = {}
    this.enabled = true
    this.heldWhileDisabled = new Set()
    this.onDown = event => {
      if (!this.enabled) { this.heldWhileDisabled.add(event.code); return }
      if (this.heldWhileDisabled.has(event.code)) return
      if (root.querySelector('dialog[open]')) return
      this.keys[event.code] = true
    }
    this.onUp = event => { this.keys[event.code] = false; this.heldWhileDisabled.delete(event.code) }
    this.onBlur = () => { this.keys = {}; this.heldWhileDisabled.clear() }
    window.addEventListener('keydown', this.onDown)
    window.addEventListener('keyup', this.onUp)
    window.addEventListener('blur', this.onBlur)
  }
  isPressed(code) { return !!this.keys[code] }
  setEnabled(enabled) {
    if (!enabled) for (const [code, pressed] of Object.entries(this.keys)) if (pressed) this.heldWhileDisabled.add(code)
    this.enabled = enabled
    this.keys = {}
  }
  dispose() {
    window.removeEventListener('keydown', this.onDown)
    window.removeEventListener('keyup', this.onUp)
    window.removeEventListener('blur', this.onBlur)
    this.keys = {}
    this.heldWhileDisabled.clear()
  }
}
