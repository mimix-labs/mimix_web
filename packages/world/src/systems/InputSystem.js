export class InputSystem {
  constructor(root = document) {
    this.keys = {}
    this.onDown = event => {
      if (root.querySelector('dialog[open]')) return
      this.keys[event.code] = true
    }
    this.onUp = event => { this.keys[event.code] = false }
    this.onBlur = () => { this.keys = {} }
    window.addEventListener('keydown', this.onDown)
    window.addEventListener('keyup', this.onUp)
    window.addEventListener('blur', this.onBlur)
  }
  isPressed(code) { return !!this.keys[code] }
  dispose() {
    window.removeEventListener('keydown', this.onDown)
    window.removeEventListener('keyup', this.onUp)
    window.removeEventListener('blur', this.onBlur)
    this.keys = {}
  }
}
