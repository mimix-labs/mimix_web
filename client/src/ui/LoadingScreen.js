export class LoadingScreen {
  constructor() {
    this.element = document.getElementById('world-loading')
    this.message = document.getElementById('loading-message')
    this.progress = document.getElementById('loading-progress')
    this.bar = document.getElementById('loading-progress-bar')
    this.hint = this.element?.querySelector('.loading-hint')
    this.retry = document.getElementById('loading-retry')
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
    window.setTimeout(() => this.element?.remove(), 220)
  }

  fail() {
    if (this.message) this.message.textContent = 'No pudimos cargar el mundo.'
    if (this.hint) this.hint.textContent = 'Revisa tu conexión y vuelve a intentarlo.'
    if (this.progress) this.progress.hidden = true
    if (this.retry) this.retry.hidden = false
    this.element?.classList.add('world-loading--error')
  }
}
