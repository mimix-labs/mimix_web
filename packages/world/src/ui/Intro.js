//Overlay de inicio: "Click para comenzar"
export class Intro {

    // Crea el cartel y lo inserta en el contenedor #ui
    constructor() {
        this.el = document.createElement('div')
        this.el.className = 'intro'
        this.el.innerHTML = `
            <p class="intro__title">Clic para comenzar</p>
            <p class="intro__hint">&#128266; sube el volumen</p>
        `
        document.getElementById('ui').appendChild(this.el)
    }

    // Oculta el cartel con fundido (se usará al hace clic)
    hide() {
        this.el.classList.add('intro--hidden')
    }

    // Elimina el cartel del DOM y libera memoria 
    dispose() {
        this.el.remove()
        this.el = null
    }
}