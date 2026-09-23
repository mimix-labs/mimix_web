const KEY_ACTIONS = new Map([
  ['KeyW', 'forward'],
  ['ArrowUp', 'forward'],
  ['KeyS', 'backward'],
  ['ArrowDown', 'backward'],
  ['KeyA', 'left'],
  ['ArrowLeft', 'left'],
  ['KeyD', 'right'],
  ['ArrowRight', 'right'],
])

const ACTION_LABELS = {
  forward: 'Avanzando',
  backward: 'Retrocediendo',
  left: 'Girando a la izquierda',
  right: 'Girando a la derecha',
  stop: 'Detenido',
}

function createControllerId() {
  return globalThis.crypto?.randomUUID?.() ?? `mimix-${Date.now()}-${Math.random()}`
}

export class RobotControls {
  constructor() {
    this.ui = document.getElementById('ui')
    if (!this.ui) return

    this.controllerId = createControllerId()
    this.sequence = 0
    this.activeAction = null
    this.refreshTimer = null
    this.statusTimer = null
    this.accessKey = ''
    this._render()

    this.dialog = document.getElementById('mimix-robot-controls')
    this.openButton = document.getElementById('mimix-robot-button')
    this.status = this.dialog?.querySelector('[data-robot-status]')
    this.accessInput = this.dialog?.querySelector('[data-control-key]')
    this.motionButtons = [...(this.dialog?.querySelectorAll('[data-motion]') ?? [])]

    this.openButton?.addEventListener('click', () => this.open())
    this.dialog?.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close())
    this.dialog?.querySelector('[data-action="stop"]')?.addEventListener('click', () => this.stop())
    this.dialog?.addEventListener('close', () => this._onClosed())
    this.dialog?.addEventListener('click', event => {
      if (event.target === this.dialog) this.close()
    })
    this.accessInput?.addEventListener('input', () => {
      this.accessKey = this.accessInput.value.trim()
      this._updateButtonState()
    })

    for (const button of this.motionButtons) {
      const action = button.dataset.motion
      button.addEventListener('pointerdown', event => {
        event.preventDefault()
        button.setPointerCapture?.(event.pointerId)
        this.start(action)
      })
      for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(eventName, () => this.stop(action))
      }
    }

    window.addEventListener('keydown', event => this._onKeyDown(event), true)
    window.addEventListener('keyup', event => this._onKeyUp(event), true)
    window.addEventListener('blur', () => this.stop())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop()
    })
  }

  async open() {
    this.dialog?.showModal()
    this.accessInput?.focus()
    await this.refreshStatus()
    window.clearInterval(this.statusTimer)
    this.statusTimer = window.setInterval(() => this.refreshStatus(), 2500)
  }

  close() {
    this.stop()
    this.dialog?.close()
  }

  start(action) {
    if (!this._canControl() || this.activeAction === action) return
    this._stopRefresh()
    this.activeAction = action
    this._markActive(action)
    this._send(action)
    this.refreshTimer = window.setInterval(() => this._send(action), 150)
  }

  stop(expectedAction = null) {
    if (expectedAction && this.activeAction !== expectedAction) return
    const wasMoving = Boolean(this.activeAction)
    this.activeAction = null
    this._stopRefresh()
    this._markActive(null)
    if (wasMoving || !expectedAction) this._send('stop')
  }

  async refreshStatus() {
    try {
      const response = await fetch('/api/robot/status', { cache: 'no-store' })
      if (!response.ok) throw new Error('status unavailable')
      const state = await response.json()
      this.remoteEnabled = state.remoteControlEnabled
      this.robotConnected = state.connectedMotionRobots === 1
      if (!this.remoteEnabled) {
        this._setStatus('Control remoto no configurado', 'warning')
      } else if (!this.robotConnected) {
        this._setStatus('Esperando conexión de la Jetson', 'waiting')
      } else {
        this._setStatus('Robot conectado · mantén una tecla pulsada', 'ready')
      }
    } catch {
      this.remoteEnabled = false
      this.robotConnected = false
      this._setStatus('No se pudo consultar el robot', 'warning')
    }
    this._updateButtonState()
  }

  async _send(action) {
    if (!this.accessKey) return
    const sequence = ++this.sequence
    try {
      const response = await fetch('/api/robot/motion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mimix-Control-Token': this.accessKey,
        },
        body: JSON.stringify({ action, controllerId: this.controllerId, sequence }),
      })
      if (response.ok) {
        this._setStatus(ACTION_LABELS[action], action === 'stop' ? 'ready' : 'moving')
        return
      }
      const result = await response.json().catch(() => ({}))
      if (response.status === 401) this._setStatus('Clave de control incorrecta', 'warning')
      else if (response.status === 423) this._setStatus('Otra sesión está controlando el robot', 'warning')
      else if (response.status === 409) this._setStatus('La Jetson no está conectada', 'warning')
      else this._setStatus(result.error || 'Movimiento rechazado', 'warning')
      if (action !== 'stop') this.stop(action)
    } catch {
      this._setStatus('Conexión perdida · el robot se detendrá solo', 'warning')
      if (action !== 'stop') this.stop(action)
    }
  }

  _onKeyDown(event) {
    if (!this.dialog?.open || event.repeat || !KEY_ACTIONS.has(event.code)) return
    event.preventDefault()
    this.start(KEY_ACTIONS.get(event.code))
  }

  _onKeyUp(event) {
    if (!this.dialog?.open || !KEY_ACTIONS.has(event.code)) return
    event.preventDefault()
    this.stop(KEY_ACTIONS.get(event.code))
  }

  _canControl() {
    return Boolean(this.accessKey && this.remoteEnabled && this.robotConnected)
  }

  _updateButtonState() {
    const disabled = !this._canControl()
    for (const button of this.motionButtons) button.disabled = disabled
  }

  _markActive(action) {
    for (const button of this.motionButtons) {
      const active = button.dataset.motion === action
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    }
  }

  _setStatus(message, state) {
    if (!this.status) return
    this.status.textContent = message
    this.status.dataset.state = state
  }

  _stopRefresh() {
    window.clearInterval(this.refreshTimer)
    this.refreshTimer = null
  }

  _onClosed() {
    this.stop()
    window.clearInterval(this.statusTimer)
    this.statusTimer = null
    this.openButton?.focus()
  }

  _render() {
    this.ui.insertAdjacentHTML('beforeend', `
      <button id="mimix-robot-button" class="robot-control-button" type="button">
        <span class="robot-control-dot" aria-hidden="true"></span>
        <span>Control robot</span>
      </button>
      <dialog id="mimix-robot-controls" class="robot-control-dialog" aria-labelledby="robot-control-title">
        <button class="dialog-close" type="button" data-action="close" aria-label="Cerrar control">×</button>
        <div class="robot-control-copy">
          <h2 id="robot-control-title">Mover robot</h2>
          <p>Usa WASD, las flechas o mantén pulsados los controles.</p>
        </div>
        <label class="robot-control-key">
          <span>Clave de control</span>
          <input type="password" data-control-key autocomplete="off" spellcheck="false" placeholder="Introduce la clave de esta sesión" />
        </label>
        <p class="robot-control-status" data-robot-status data-state="waiting" role="status" aria-live="polite">Consultando la Jetson…</p>
        <div class="robot-pad" aria-label="Dirección del robot">
          <span></span>
          <button type="button" data-motion="forward" aria-label="Avanzar" aria-pressed="false">↑<small>W</small></button>
          <span></span>
          <button type="button" data-motion="left" aria-label="Girar a la izquierda" aria-pressed="false">←<small>A</small></button>
          <button class="robot-stop" type="button" data-action="stop" aria-label="Detener robot">STOP</button>
          <button type="button" data-motion="right" aria-label="Girar a la derecha" aria-pressed="false">→<small>D</small></button>
          <span></span>
          <button type="button" data-motion="backward" aria-label="Retroceder" aria-pressed="false">↓<small>S</small></button>
          <span></span>
        </div>
        <p class="robot-control-safety">El movimiento dura solo mientras mantienes el control. Al soltarlo, cerrar esta ventana o perder conexión, el robot se detiene.</p>
      </dialog>
    `)
  }
}
