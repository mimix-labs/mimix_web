// ========== INTEGRACIÓN ROBOT + FORMAS 3D ==========
// Conecta las acciones del robot con los eventos de las formas geométricas

import robotManager from './robotManager.js';

class RobotShapeIntegration {
  constructor() {
    this.robotManager = null;
    this.isInitialized = false;
    this.lastShapeChangeTime = 0;
    this.shapeChangeDebounce = 500; // 500ms para evitar cambios muy rápidos
    this.isEnabled = true;
    this.reactionDelay = 500; // ms de delay para las reacciones
  }

  // Inicializar integración
  async init() {
    try {
      // Inicializar el robot
      const success = await robotManager.init('robot-container');
      if (success) {
        console.log('🤖 Robot integrado con formas 3D');
        this.setupEventListeners();
        this.isInitialized = true;
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error inicializando integración robot-formas:', error);
      return false;
    }
  }

  // Configurar event listeners para eventos de formas
  setupEventListeners() {
    // Escuchar cuando se crea una nueva forma
    document.addEventListener('shapeCreated', (event) => {
      if (this.isEnabled) {
        setTimeout(() => {
          robotManager.celebrate();
        }, this.reactionDelay);
      }
    });

    // Escuchar cuando se cambia de forma
    document.addEventListener('shapeChanged', (event) => {
      if (this.isEnabled && event.detail) {
        setTimeout(() => {
          robotManager.reactToShape(event.detail.shapeName);
        }, this.reactionDelay);
      }
    });

    // Escuchar cuando se detecta una mano
    // document.addEventListener('handDetected', () => {
    //     if (this.isEnabled) {
    //         setTimeout(() => {
    //             robotManager.greet();
    //         }, this.reactionDelay);
    //     }
    // });

    // Escuchar cuando se arrastra un vértice
    // document.addEventListener('vertexDragged', () => {
    //     if (this.isEnabled && Math.random() > 0.8) { // 20% de probabilidad
    //         setTimeout(() => {
    //             robotManager.like();
    //         }, this.reactionDelay);
    //     }
    // });

    // Escuchar gestos específicos de mano
    // document.addEventListener('handGesture', (event) => {
    //     if (this.isEnabled && event.detail) {
    //         this.handleHandGesture(event.detail.gesture);
    //     }
    // });
  }

  // Manejar gestos de mano específicos
  handleHandGesture(gesture) {
    if (!robotManager.isReady()) return;

    const gestureActions = {
      'thumbsUp': () => robotManager.like(),
      'wave': () => robotManager.wave(),
      'peace': () => robotManager.yes(),
      'fist': () => robotManager.punch(),
      'openPalm': () => robotManager.idle()
    };

    const action = gestureActions[gesture];
    if (action) {
      setTimeout(action, this.reactionDelay);
    }
  }

  // Manejar cambio de forma con debounce
  onShapeChanged(previousShape, newShape) {
    if (!this.isInitialized) return;
    
    const now = Date.now();
    
    // Implementar debounce para evitar animaciones muy rápidas
    if (now - this.lastShapeChangeTime < this.shapeChangeDebounce) {
      console.log('🤖 Cambio de forma muy rápido, ignorando...');
      return;
    }
    
    this.lastShapeChangeTime = now;
    
    // Cancelar animaciones previas ANTES de iniciar nuevas
    this.robotManager.cancelAllAnimations();
    
    console.log(`🤖 Cambiando de ${previousShape} a ${newShape}`);
    
    // Pequeño delay para que la cancelación sea efectiva
    setTimeout(() => {
      this.reactToShapeChange(newShape);
    }, 100);
  }

  // Reacciones específicas a cambios de forma
  reactToShapeChange(shape) {
    if (!this.robotManager) return;
    
    const reactions = {
      'cubo': () => {
        console.log('🤖 ¡Cubo seleccionado! Saltando...');
        this.robotManager.jump();
      },
      'octaedro': () => {
        console.log('🤖 ¡Octaedro seleccionado! Bailando...');
        this.robotManager.dance();
      },
      'prisma': () => {
        console.log('🤖 ¡Prisma seleccionado! Caminando...');
        this.robotManager.walk();
      },
      'piramide': () => {
        console.log('🤖 ¡Pirámide seleccionada! Saludando...');
        this.robotManager.wave();
      }
    };
    
    const reaction = reactions[shape];
    if (reaction) {
      reaction();
    } else {
      console.log('🤖 Forma no reconocida, volviendo a idle...');
      this.robotManager.idle();
    }
  }

  // Celebrar creación de forma
  onShapeCreated(shape) {
    if (!this.isInitialized) return;
    
    console.log(`🤖 ¡Nueva forma creada: ${shape}!`);
    
    // Cancelar animaciones antes de celebrar
    this.robotManager.cancelAllAnimations();
    
    // Pequeño delay antes de celebrar
    setTimeout(() => {
      this.robotManager.celebrate();
    }, 100);
  }

  // ========== MÉTODOS DE CONTROL ==========

  enable() {
    this.isEnabled = true;
    console.log('✅ Integración robot-formas habilitada');
  }

  disable() {
    this.isEnabled = false;
    console.log('⏸️ Integración robot-formas deshabilitada');
  }

  setReactionDelay(delay) {
    this.reactionDelay = Math.max(0, delay);
  }

  // ========== EVENTOS MANUALES ==========

  // Llamar cuando se crea una forma
  onShapeCreated(shapeName) {
    if (this.isEnabled) {
      console.log(`🎉 Forma creada: ${shapeName}`);
      
      // Disparar evento personalizado
      const event = new CustomEvent('shapeCreated', {
        detail: { shapeName }
      });
      document.dispatchEvent(event);
    }
  }

  // Llamar cuando se cambia de forma
  onShapeChanged(oldShape, newShape) {
    if (this.isEnabled) {
      console.log(`🔄 Forma cambiada: ${oldShape} → ${newShape}`);
      
      // Disparar evento personalizado
      const event = new CustomEvent('shapeChanged', {
        detail: { 
          oldShape, 
          shapeName: newShape 
        }
      });
      document.dispatchEvent(event);
    }
  }

  // Llamar cuando se detecta mano
  // onHandDetected() {
  //     if (this.isEnabled) {
  //         // Disparar evento personalizado
  //         const event = new CustomEvent('handDetected');
  //         document.dispatchEvent(event);
  //     }
  // }

  // Llamar cuando se arrastra un vértice
  // onVertexDragged(vertexIndex) {
  //     if (this.isEnabled) {
  //         // Disparar evento personalizado
  //         const event = new CustomEvent('vertexDragged', {
  //             detail: { vertexIndex }
  //         });
  //         document.dispatchEvent(event);
  //     }
  // }

  // ========== REACCIONES ESPECÍFICAS ==========

  // Celebrar cuando se completa una acción exitosa
  celebrateSuccess() {
    if (this.isEnabled && robotManager.isReady()) {
      robotManager.celebrate();
    }
  }

  // Mostrar aprobación
  showApproval() {
    if (this.isEnabled && robotManager.isReady()) {
      robotManager.like();
    }
  }

  // Mostrar desaprobación
  showDisapproval() {
    if (this.isEnabled && robotManager.isReady()) {
      robotManager.no();
    }
  }

  // Saludar al usuario
  greetUser() {
    if (this.isEnabled && robotManager.isReady()) {
      robotManager.greet();
    }
  }
}

// Crear instancia singleton
const robotShapeIntegration = new RobotShapeIntegration();

// Exportar para uso global
window.robotShapeIntegration = robotShapeIntegration;

// También exportar para módulos ES6
export default robotShapeIntegration;
