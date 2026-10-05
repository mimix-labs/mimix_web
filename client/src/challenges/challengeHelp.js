const GUIDES = {
  mathematics: {
    title: 'Controla con ambas manos',
    introduction: 'Cada mano cumple una función diferente. Muéstralas completas frente a la cámara.',
    steps: [
      ['Mano derecha · Puño', 'Cierra la mano en un puño y muévelo hacia los lados o arriba y abajo para girar la figura.'],
      ['Mano izquierda · Pinch', 'Junta el pulgar y el índice para seleccionar una forma o arrastrar y modificar sus vértices.'],
    ],
  },
  science: {
    title: 'Controla con ambas manos',
    introduction: 'Cada mano cumple una función diferente. Muéstralas completas frente a la cámara.',
    steps: [
      ['Mano derecha · Puño', 'Cierra la mano en un puño y muévelo hacia los lados o arriba y abajo para girar la vista del átomo.'],
      ['Mano izquierda · Pinch', 'Junta el pulgar y el índice para seleccionar elementos o modificar el átomo con sus controles.'],
    ],
  },
}

const challenge = document.body.dataset.challenge
const guide = GUIDES[challenge]

if (guide) {
  const storageKey = `mimix-${challenge}-hand-guide-v2`
  const root = document.createElement('div')
  root.className = 'challenge-help-shell'
  root.innerHTML = `
    <button class="challenge-help-trigger" type="button" aria-expanded="true" aria-controls="challenge-hand-guide" hidden>
      <span aria-hidden="true">?</span>
      Cómo usar las manos
    </button>
    <aside id="challenge-hand-guide" class="challenge-help-panel" aria-labelledby="challenge-help-title">
      <button class="challenge-help-close" type="button" aria-label="Cerrar instrucciones">×</button>
      <h2 id="challenge-help-title">${guide.title}</h2>
      <p>${guide.introduction}</p>
      <ol>
        ${guide.steps.map(([title, description]) => `
          <li><strong>${title}</strong><span>${description}</span></li>
        `).join('')}
      </ol>
      <p class="challenge-help-tip">Consejo: mueve la mano despacio y procura que esté bien iluminada.</p>
      <button class="challenge-help-ready" type="button">Entendido</button>
    </aside>
  `
  document.body.append(root)

  const panel = root.querySelector('.challenge-help-panel')
  const trigger = root.querySelector('.challenge-help-trigger')
  const closeButtons = root.querySelectorAll('.challenge-help-close, .challenge-help-ready')

  const setOpen = (open, { remember = false } = {}) => {
    panel.hidden = !open
    trigger.hidden = open
    trigger.setAttribute('aria-expanded', String(open))
    if (!open && remember) {
      try {
        window.localStorage.setItem(storageKey, 'seen')
      } catch {
        // The help remains available even when storage is unavailable.
      }
      trigger.focus()
    }
  }

  trigger.addEventListener('click', () => setOpen(true))
  closeButtons.forEach(button => button.addEventListener('click', () => {
    setOpen(false, { remember: true })
  }))

  try {
    setOpen(!window.localStorage.getItem(storageKey))
  } catch {
    setOpen(true)
  }
}
