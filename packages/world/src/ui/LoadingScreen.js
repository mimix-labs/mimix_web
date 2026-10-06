export class LoadingScreen {
  constructor(root = document) {
    this.element = root.getElementById('world-loading')
    this.message = root.getElementById('loading-message')
    this.progress = root.getElementById('loading-progress')
    this.bar = root.getElementById('loading-progress-bar')
    this.hint = this.element?.querySelector('.loading-hint')
    this.retry = root.getElementById('loading-retry')
    this.retry?.addEventListener('click', () => window.location.reload())
  }

  update({ progress = 0, message = 'Cargando…' } = {}) {
    const value = Math.max(0, Math.min(Math.round(progress), 100))
    if (this.message) this.message.textContent = message
    if (this.bar) this.bar.style.width = `${value}%`
    this.progress?.setAttribute('aria-valuenow', String(value))
  }

  complete() {
    this.update({ progress: 100, message: '¡Todo listo!' })
    this.element?.classList.add('world-loading--complete')
    this.timer = window.setTimeout(() => this.element?.remove(), 220)
  }

  dispose() { clearTimeout(this.timer) }

  fail() {
    if (this.message) this.message.textContent = 'No pudimos cargar el mundo.'
    if (this.hint) this.hint.textContent = 'Revisa tu conexión y vuelve a intentarlo.'
    if (this.progress) this.progress.hidden = true
    if (this.retry) this.retry.hidden = false
    this.element?.classList.add('world-loading--error')
  }
}
