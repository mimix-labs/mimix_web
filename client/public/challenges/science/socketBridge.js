// Adaptador mínimo para conservar la API socket.emit() del reto original
// sin requerir el servidor de Runabit ni una conexión física a Arduino.
window.io = () => ({
  emit(event, payload) {
    fetch('/api/challenges/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge: 'science',
        type: event,
        payload,
      }),
    }).catch(() => {})
  },
})
