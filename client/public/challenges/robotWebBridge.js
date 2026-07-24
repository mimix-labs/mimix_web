// Adaptador estático para los retos servidos desde public/. Los únicos
// destinos reconocidos son parte del contrato de Mimix, no texto del LLM.
export function startRobotWebBridge(challenge) {
  let context = { page: 'challenge', challenge, selectedObject: null }

  async function publishContext() {
    try {
      await fetch('/api/robot/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
      })
    } catch (error) {
      console.warn('No se pudo compartir el contexto con Wall-E:', error)
    }
  }

  function destinationUrl(destination) {
    const vision = new URLSearchParams(window.location.search).get('vision')
    const query = vision === 'robot' ? '?vision=robot' : ''
    const destinations = {
      world: `/${query}`,
      mathematics: `/challenges/mathematics/index.html${query}`,
      science: `/challenges/science/index.html${query}`,
    }
    return destinations[destination]
  }

  const stream = new EventSource('/api/robot/commands/stream')
  stream.addEventListener('robot-command', (event) => {
    try {
      const command = JSON.parse(event.data)
      if (command?.action !== 'navigate_to') return
      const target = destinationUrl(command.destination)
      if (target && target !== window.location.pathname + window.location.search) {
        window.location.assign(target)
      }
    } catch (error) {
      console.error('Comando inválido de Wall-E:', error)
    }
  })

  publishContext()
  return {
    updateContext(nextContext) {
      context = { ...context, ...nextContext }
      publishContext()
    },
    stop() {
      stream.close()
    },
  }
}
