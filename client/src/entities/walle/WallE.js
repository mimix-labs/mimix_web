// Wall-E specific configuration.
// When the GLB is placed in public/assets/models/walle/walle.glb,
// call CharacterManager.load(WALLE.modelPath) to activate him.

export const WALLE = {
  modelPath:     '/assets/models/walle/walle.glb',
  scale:         1.0,
  spawnPosition: [0, 0, 0],  // centrado en el origen

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
