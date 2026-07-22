const messages = {
  cubo: 'Cubo',
  octaedro: 'Octaedro',
  prisma: 'Prisma',
  piramide: 'Pirámide',
}

const bubble = document.getElementById('robot-dialogue')
const text = document.getElementById('robot-dialogue-text')
let hideTimer = null

document.addEventListener('mimix:shape-selected', ({ detail }) => {
  const message = messages[detail?.shapeName]
  if (!message) return

  text.textContent = message
  bubble.classList.add('is-visible')

  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => bubble.classList.remove('is-visible'), 3200)
})
