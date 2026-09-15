const STEPS = [
  {
    eyebrow: 'Paso 1 de 2',
    title: 'Mueve a Wall-E',
    body: 'Elige cualquiera de estos dos grupos de teclas para recorrer el mapa.',
    visual: `
      <div class="control-groups">
        <div class="control-group">
          <strong>WASD</strong>
          <div class="key-layout" aria-label="Movimiento con las teclas W, A, S y D">
            <span></span><kbd>W</kbd><span></span>
            <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
          </div>
        </div>
        <div class="control-group">
          <strong>Flechas</strong>
          <div class="key-layout" aria-label="Movimiento con las teclas de dirección">
            <span></span><kbd>↑</kbd><span></span>
            <kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
          </div>
        </div>
      </div>
      <p class="step-note">Camina hacia los aros amarillos para entrar a los retos.</p>
    `,
  },
  {
    eyebrow: 'Paso 2 de 2',
    title: 'Explora la cámara',
    body: 'Arrastra con el ratón para observar el mundo y usa la rueda para acercarte o alejarte.',
    visual: `
      <div class="mouse-guide" aria-hidden="true"><span></span></div>
      <p class="step-note">Puedes abrir esta guía nuevamente desde “Cómo jugar”.</p>
    `,
  },
]

const STORAGE_KEY = 'mimix-onboarding-v2'

export class Onboarding {
  constructor() {
    this.step = 0
    this.ui = document.getElementById('ui')
    if (!this.ui) return
    this._render()
    this.dialog = document.getElementById('mimix-help')
    this.helpButton = document.getElementById('mimix-help-button')
    this.helpButton?.addEventListener('click', () => this.open())
    this.dialog?.addEventListener('click', event => {
      if (event.target === this.dialog) this.close()
    })
    this.dialog?.addEventListener('close', () => {
      this._rememberVisit()
      this.helpButton?.focus()
    })
    this.dialog?.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close())
    this.dialog?.querySelector('[data-action="back"]')?.addEventListener('click', () => this.goTo(this.step - 1))
    this.dialog?.querySelector('[data-action="next"]')?.addEventListener('click', () => {
      if (this.step === STEPS.length - 1) this.close()
      else this.goTo(this.step + 1)
    })
  }

  showFirstVisit() {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) this.open()
    } catch {
      this.open()
    }
  }

  open() {
    this.goTo(0)
    this.dialog?.showModal()
  }

  close() {
    this.dialog?.close()
  }

  _rememberVisit() {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'seen')
    } catch {
      // Private browsing can disable storage; the guide still remains usable.
    }
  }

  goTo(index) {
    this.step = Math.max(0, Math.min(index, STEPS.length - 1))
    const current = STEPS[this.step]
    const eyebrow = this.dialog?.querySelector('[data-content="eyebrow"]')
    const title = this.dialog?.querySelector('[data-content="title"]')
    const body = this.dialog?.querySelector('[data-content="body"]')
    const visual = this.dialog?.querySelector('[data-content="visual"]')
    const back = this.dialog?.querySelector('[data-action="back"]')
    const next = this.dialog?.querySelector('[data-action="next"]')
    if (eyebrow) eyebrow.textContent = current.eyebrow
    if (title) title.textContent = current.title
    if (body) body.textContent = current.body
    if (visual) visual.innerHTML = current.visual
    if (back) back.disabled = this.step === 0
    if (next) next.textContent = this.step === STEPS.length - 1 ? 'Comenzar' : 'Siguiente'
    this.dialog?.querySelectorAll('[data-step]').forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === this.step)
    })
  }

  _render() {
    this.ui.insertAdjacentHTML('beforeend', `
      <button id="mimix-help-button" class="help-button" type="button" aria-label="Abrir guía de uso">
        <span aria-hidden="true">?</span><span>Cómo jugar</span>
      </button>
      <dialog id="mimix-help" class="help-dialog" aria-labelledby="help-title">
        <button class="dialog-close" type="button" data-action="close" aria-label="Cerrar guía">×</button>
        <div class="dialog-copy">
          <p class="dialog-eyebrow" data-content="eyebrow"></p>
          <h2 id="help-title" data-content="title"></h2>
          <p class="dialog-body" data-content="body"></p>
        </div>
        <div class="dialog-visual" data-content="visual"></div>
        <div class="dialog-footer">
          <div class="step-indicator" aria-hidden="true">
            ${STEPS.map((_, index) => `<span data-step="${index}"></span>`).join('')}
          </div>
          <div class="dialog-actions">
            <button class="button-secondary" type="button" data-action="back">Anterior</button>
            <button class="button-primary" type="button" data-action="next">Siguiente</button>
          </div>
        </div>
      </dialog>
    `)
  }
}
