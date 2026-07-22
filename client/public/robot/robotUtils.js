// ========== UTILIDADES DEL ROBOT ==========
// Funciones de conveniencia y utilidades para el robot

import robotManager from './robotManager.js';

// ========== FUNCIONES DE CONVENIENCIA GLOBALES ==========

// Funciones directas para compatibilidad con código existente
window.robotLike = () => robotManager.like();
window.robotWave = () => robotManager.wave();
window.robotJump = () => robotManager.jump();
window.robotYes = () => robotManager.yes();
window.robotNo = () => robotManager.no();
window.robotPunch = () => robotManager.punch();
window.robotDance = () => robotManager.dance();
window.robotWalk = () => robotManager.walk();
window.robotRun = () => robotManager.run();
window.robotIdle = () => robotManager.idle();
window.robotSit = () => robotManager.sit();
window.robotStand = () => robotManager.stand();

// Funciones de estado
window.getRobotState = () => robotManager.getCurrentState();
window.isRobotReady = () => robotManager.isReady();
window.getRobotAnimations = () => robotManager.getAvailableAnimations();

// Funciones de eventos
window.robotCelebrate = () => robotManager.celebrate();
window.robotGreetUser = () => robotManager.greet();

// ========== CONTROLES DE TECLADO PARA DESARROLLO ==========

function setupKeyboardControls() {
    document.addEventListener('keydown', (event) => {
        if (!robotManager.isReady()) return;

        // Solo activar si se mantiene presionada la tecla Ctrl/Cmd
        if (event.ctrlKey || event.metaKey) {
            switch(event.key) {
                case '1':
                    event.preventDefault();
                    robotManager.like();
                    console.log('🤖 Robot: Like');
                    break;
                case '2':
                    event.preventDefault();
                    robotManager.wave();
                    console.log('🤖 Robot: Wave');
                    break;
                case '3':
                    event.preventDefault();
                    robotManager.jump();
                    console.log('🤖 Robot: Jump');
                    break;
                case '4':
                    event.preventDefault();
                    robotManager.dance();
                    console.log('🤖 Robot: Dance');
                    break;
                case '5':
                    event.preventDefault();
                    robotManager.walk();
                    console.log('🤖 Robot: Walk');
                    break;
                case '0':
                    event.preventDefault();
                    robotManager.idle();
                    console.log('🤖 Robot: Idle');
                    break;
            }
        }
    });
}

// ========== FUNCIONES DE DEBUG ==========

function showRobotDebugInfo() {
    if (!robotManager.isReady()) {
        console.log('❌ Robot no está listo');
        return;
    }

    console.log('🤖 === INFORMACIÓN DEL ROBOT ===');
    console.log('Estado actual:', robotManager.getCurrentState());
    console.log('Animaciones disponibles:', robotManager.getAvailableAnimations());
    console.log('Robot listo:', robotManager.isReady());
}

// ========== FUNCIONES DE CONFIGURACIÓN ==========

function configureRobotBehavior(options = {}) {
    const defaults = {
        autoGreeting: false,
        autoGreetingInterval: 30000,
        reactionDelay: 500,
        keyboardControls: true
    };

    const config = { ...defaults, ...options };

    // Configurar auto-saludo
    robotManager.enableAutoGreeting(config.autoGreeting, config.autoGreetingInterval);

    // Configurar controles de teclado
    if (config.keyboardControls) {
        setupKeyboardControls();
    }

    // Configurar delay de reacciones
    if (window.robotShapeIntegration) {
        window.robotShapeIntegration.setReactionDelay(config.reactionDelay);
    }

    console.log('🤖 Robot configurado:', config);
}

// ========== FUNCIONES DE TESTING ==========

function testRobotAnimations() {
    if (!robotManager.isReady()) {
        console.log('❌ Robot no está listo para testing');
        return;
    }

    const animations = ['like', 'wave', 'jump', 'dance', 'walk'];
    let currentIndex = 0;

    const testNext = () => {
        if (currentIndex < animations.length) {
            const animation = animations[currentIndex];
            console.log(`🧪 Testing: ${animation}`);
            robotManager[animation]();
            currentIndex++;
            setTimeout(testNext, 3000);
        } else {
            console.log('✅ Test de animaciones completado');
            robotManager.idle();
        }
    };

    console.log('🧪 Iniciando test de animaciones...');
    testNext();
}

// ========== EXPORTACIONES ==========

export {
    setupKeyboardControls,
    showRobotDebugInfo,
    configureRobotBehavior,
    testRobotAnimations
};

// ========== AUTO-CONFIGURACIÓN ==========

// Configurar automáticamente cuando se carga el módulo
document.addEventListener('DOMContentLoaded', () => {
    // Configuración por defecto
    setTimeout(() => {
        configureRobotBehavior({
            autoGreeting: false,
            keyboardControls: true,
            reactionDelay: 500
        });
        
        console.log('🤖 === ROBOT UTILS CARGADO ===');
        console.log('💡 Usa Ctrl+1-5 para probar animaciones');
        console.log('💡 Usa Ctrl+0 para robot en reposo');
        console.log('💡 showRobotDebugInfo() para debug');
        console.log('💡 testRobotAnimations() para test automático');
    }, 100);
});
