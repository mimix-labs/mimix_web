// Wall-E specific configuration.
// When the GLB is placed in public/assets/models/walle/walle.glb,
// call CharacterManager.load(WALLE.modelPath) to activate him.

export const WALLE = {
  modelPath:     '/assets/models/walle/walle.glb',
  scale:         1.0,
  // El suelo del mapa en el origen está a Y = 0.30. El margen evita que
  // las orugas queden embebidas por redondeos de la malla del terreno.
  spawnPosition: [0, 0.32, 0],

  // Mapping: gesture name → Blender animation clip name
  // Adjust clip names to match your exported Blender armature
  clipNames: {
    idle:      'Idle',
    walk:      'Walk',
    run:       'Run',
    wave:      'Wave',
    excited:   'Excited',
    think:     'Think',
    celebrate: 'Celebrate',
    sad:       'Sad',
    look:      'Look',
    point:     'Point',
    read:      'Read',
  },
}
