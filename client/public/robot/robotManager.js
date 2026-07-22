// ========== ROBOT MANAGER - Sistema Principal del Robot ==========

class RobotManager {
  constructor() {
    this.robot = null;
    this.mixer = null;
    this.actions = {};
    this.isInitialized = false;
    
    // Sistema de gestión de animaciones
    this.currentAnimation = null;
    this.animationQueue = [];
    this.activeTimeouts = []; // Para limpiar timeouts
    this.activeIntervals = []; // Para limpiar intervalos
    this.isAnimating = false;
  }

  // Inicializar robot
  async init(containerId = 'robot-container') {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`No se encontró el contenedor del robot (#${containerId})`);
      return false;
    }

    try {
      // Configurar escena
      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(-2.4, 1.5, 2.8);
      camera.lookAt(0, 1.1, 0);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
      });
      renderer.setSize(520, 520);
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = false;
      container.appendChild(renderer.domElement);

      // Luces
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
      dirLight.position.set(1, 2, 1);
      scene.add(dirLight);

      const clock = new THREE.Clock();

      // Cargar robot
      const loader = new THREE.GLTFLoader();
      
      return new Promise((resolve, reject) => {
        // El reto usa el mismo compañero visual que el mapa principal.
        loader.load('/assets/models/walle/walle.glb',
          (gltf) => {
            const model = gltf.scene;
            model.scale.setScalar(0.75);
            scene.add(model);

            // Configurar animaciones
            const mixer = new THREE.AnimationMixer(model);
            const actions = {};

            gltf.animations.forEach((clip) => {
              const action = mixer.clipAction(clip);
              actions[clip.name] = action;

              // Configurar emotes para que se ejecuten una vez
              const emotes = ['Jump', 'Yes', 'No', 'Wave', 'Punch', 'ThumbsUp'];
              if (emotes.includes(clip.name)) {
                action.clampWhenFinished = true;
                action.loop = THREE.LoopOnce;
            }
            });

            // Iniciar con animación Idle
            let activeAction = actions['Idle'];
            if (activeAction) {
              activeAction.play();
            }

            // Configurar robot global
            this.robot = {
              mixer: mixer,
              actions: actions,
              activeAction: activeAction,
              model: model,
              currentState: 'Idle',
              scene: scene,
              camera: camera,
              renderer: renderer,
              clock: clock
            };

            this.isInitialized = true;
            console.log('✅ Robot cargado exitosamente!');

            // Iniciar loop de animación
            this.startAnimationLoop();
            
            resolve(true);
          },
          undefined,
          (error) => {
            console.error('❌ Error cargando robot:', error);
            reject(error);
          }
        );
      });

    } catch (error) {
      console.error('❌ Error inicializando robot:', error);
      return false;
    }
  }

  // Loop de animación
  startAnimationLoop() {
    const animate = () => {
      requestAnimationFrame(animate);

      if (this.robot && this.robot.mixer) {
        const dt = this.robot.clock.getDelta();
        this.robot.mixer.update(dt);
        this.robot.renderer.render(this.robot.scene, this.robot.camera);
      }
    };
    animate();
  }

  // Cambiar animación
  changeAnimation(actionName) {
    if (!this.isInitialized || !this.robot || !this.robot.actions[actionName]) {
      console.warn(`⚠️ Animación ${actionName} no encontrada o robot no inicializado`);
      return false;
    }

    const previousAction = this.robot.activeAction;
    const newAction = this.robot.actions[actionName];

    // Si la acción ya está activa, no hacer nada
    if (previousAction !== newAction) {
      if (previousAction) {
        // Desactivar la acción anterior
        previousAction.fadeOut(0.3);
      }

      newAction
          .reset()
          .setEffectiveTimeScale(1)
          .setEffectiveWeight(1)
          .fadeIn(0.3)
          .play();

      this.robot.activeAction = newAction;
      this.robot.currentState = actionName;
    }

    return true;
  }

  // Ejecutar emote y volver al estado anterior
  playEmote(emoteName) {
    if (!this.isInitialized || !this.robot || !this.robot.actions[emoteName]) {
      console.warn(`⚠️ Emote ${emoteName} no encontrado o robot no inicializado`);
      return false;
    }

    const currentState = this.robot.currentState;
    this.changeAnimation(emoteName);

    // Volver al estado anterior cuando termine el emote
    const restoreState = () => {
      this.robot.mixer.removeEventListener('finished', restoreState);
      this.changeAnimation(currentState);
    };
    this.robot.mixer.addEventListener('finished', restoreState);

    return true;
  }

  // Método para cancelar todas las animaciones activas
  cancelAllAnimations() {
    // Cancelar timeouts activos
    this.activeTimeouts.forEach(timeout => clearTimeout(timeout));
    this.activeTimeouts = [];
    
    // Cancelar intervalos activos
    this.activeIntervals.forEach(interval => clearInterval(interval));
    this.activeIntervals = [];
    
    // Limpiar cola de animaciones
    this.animationQueue = [];
    
    // Detener animación actual suavemente
    if (this.currentAnimation) {
      this.currentAnimation.fadeOut(0.2);
      this.currentAnimation = null;
    }
    
    // Resetear estado
    this.isAnimating = false;
    
    // Volver a idle después de un breve delay
    const timeout = setTimeout(() => {
      this.idle();
    }, 300);
    this.activeTimeouts.push(timeout);
    
    console.log('🤖 Todas las animaciones del robot canceladas');
  }

  // Método seguro para agregar timeouts
  addTimeout(callback, delay) {
    const timeout = setTimeout(() => {
      // Remover de la lista cuando se ejecute
      this.activeTimeouts = this.activeTimeouts.filter(t => t !== timeout);
      callback();
    }, delay);
    this.activeTimeouts.push(timeout);
    return timeout;
  }

  // Método seguro para agregar intervalos
  addInterval(callback, interval) {
    const intervalId = setInterval(callback, interval);
    this.activeIntervals.push(intervalId);
    return intervalId;
  }

  // Método mejorado para reproducir animaciones
  playAnimation(animationName, options = {}) {
    if (!this.isInitialized || !this.actions[animationName]) {
      console.warn(`🤖 Animación '${animationName}' no disponible`);
      return false;
    }

    const { 
      loop = false, 
      duration = null,
      fadeIn = 0.2,
      fadeOut = 0.2,
      priority = 'normal' // 'low', 'normal', 'high'
    } = options;

    // Si hay una animación de alta prioridad, no interrumpir
    if (this.isAnimating && this.currentAnimationPriority === 'high' && priority !== 'high') {
      console.log(`🤖 Animación '${animationName}' bloqueada por animación de alta prioridad`);
      return false;
    }

    // Cancelar animación actual si es necesario
    if (this.currentAnimation && this.currentAnimation !== this.actions[animationName]) {
      this.currentAnimation.fadeOut(fadeOut);
    }

    const action = this.actions[animationName];
    
    // Configurar la animación
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    action.clampWhenFinished = !loop;
    
    // Reproducir con fade in
    action.fadeIn(fadeIn);
    action.play();
    
    this.currentAnimation = action;
    this.currentAnimationPriority = priority;
    this.isAnimating = true;

    // Si tiene duración específica, detener después del tiempo
    if (duration) {
      this.addTimeout(() => {
        if (this.currentAnimation === action) {
          action.fadeOut(fadeOut);
          this.addTimeout(() => {
            this.isAnimating = false;
            this.currentAnimation = null;
            this.currentAnimationPriority = null;
          }, fadeOut * 1000);
        }
      }, duration);
    }

    // Si no es loop, detener cuando termine
    if (!loop) {
      const animationDuration = action.getClip().duration * 1000;
      this.addTimeout(() => {
        if (this.currentAnimation === action) {
          this.isAnimating = false;
          this.currentAnimation = null;
          this.currentAnimationPriority = null;
        }
      }, animationDuration);
    }

    return true;
  }

  // ========== MÉTODOS PÚBLICOS - API DEL ROBOT ==========

    // Estados
    idle() {
      this.cancelAllAnimations();
      this.playAnimation('idle', { loop: true, priority: 'low' });
    }
    dance() { return this.changeAnimation('Dance'); }
    walk() { return this.changeAnimation('Walking'); }
    run() { return this.changeAnimation('Running'); }
    sit() { return this.changeAnimation('Sitting'); }
    stand() { return this.changeAnimation('Standing'); }

    // Emotes
    like() { return this.playEmote('ThumbsUp'); }
    wave() { return this.playEmote('Wave'); }
    jump() { return this.playEmote('Jump'); }
    yes() { return this.playEmote('Yes'); }
    no() { return this.playEmote('No'); }
    punch() { return this.playEmote('Punch'); }

    // Utilidades
    isReady() {
        return this.isInitialized && this.robot !== null;
    }

    getCurrentState() {
        return this.robot ? this.robot.currentState : null;
    }

    getAvailableAnimations() {
        return this.robot ? Object.keys(this.robot.actions) : [];
    }

    // ========== EVENTOS Y AUTOMATIZACIÓN ==========

    // Evento personalizado para celebrar
    celebrate() {
        this.cancelAllAnimations();
        
        // Secuencia: like -> jump -> idle
        this.like();
        
        this.addTimeout(() => {
          this.jump();
        }, 1600);
        
        this.addTimeout(() => {
          this.idle();
        }, 3200);
      }

    // Evento para saludar
    greet() {
      this.cancelAllAnimations();
      
      // Secuencia: wave -> idle
      this.wave();
      
      this.addTimeout(() => {
        this.idle();
      }, 2100);
    }

    // Auto-saludo cada cierto tiempo
    enableAutoGreeting(enabled = true, interval = 30000) {
        if (this.autoGreetingEnabled && !enabled) {
            // Deshabilitar auto-saludo existente
            clearInterval(this.autoGreetingInterval);
            this.autoGreetingEnabled = false;
            return;
        }

        if (enabled && !this.autoGreetingEnabled) {
            this.autoGreetingInterval = setInterval(() => {
                if (Math.random() > 0.7 && this.isReady()) {
                    this.wave();
                }
            }, interval);
            this.autoGreetingEnabled = true;
        }
    }

    // Reaccionar a formas específicas
    reactToShape(shapeName) {
        if (!this.isReady()) return false;

        switch(shapeName.toLowerCase()) {
            case 'cubo':
            case 'cube':
                this.jump();
                break;
            case 'octaedro':
            case 'octahedron':
                this.dance();
                break;
            case 'prisma':
            case 'prism':
                this.walk();
                break;
            case 'piramide':
            case 'pyramid':
                this.wave();
                break;
            default:
                this.idle();
        }
        return true;
    }
}

// Crear instancia singleton
const robotManager = new RobotManager();

// Exportar para uso global
window.robotManager = robotManager;

// También exportar para módulos ES6
export default robotManager;
