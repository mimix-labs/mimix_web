// Puente para comandos semánticos del guía de voz. El navegador nunca ejecuta
// URLs ni JavaScript enviados por el LLM: solo destinos definidos por Mimix.
export class RobotWebBridge {
  constructor({ context, onNavigate }) {
    this.context = context
    this.onNavigate = onNavigate
    this.stream = null
  }

  start() {
    this.publishContext()
    this.stream = new EventSource('/api/robot/commands/stream')
    this.stream.addEventListener('robot-command', (event) => {
      try {
        this.handleCommand(JSON.parse(event.data))
      } catch (error) {
        console.error('Invalid robot command:', error)
      }
    })
    this.stream.onerror = () => {
      // EventSource reintenta automáticamente mientras el backend reinicia.
      console.warn('Waiting for the Mimix robot bridge…')
    }
  }

  updateContext(nextContext) {
    this.context = { ...this.context, ...nextContext }
    this.publishContext()
  }

  async publishContext() {
    try {
      await fetch('/api/robot/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.context),
      })
    } catch (error) {
      console.warn('Could not publish Mimix context:', error)
    }
  }

  async handleCommand(command) {
    if (command?.action !== 'navigate_to') return
    await this.onNavigate(command.destination)
  }

  stop() {
    this.stream?.close()
  }
}
