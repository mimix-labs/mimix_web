// Central gesture registry.
// Each entry maps a gesture name to its animation clip name (as exported from Blender)
// and its playback behavior. Add new gestures here — nothing else needs to change.

export const GESTURES = {
  // Locomotion
  idle:      { clip: 'Idle',      loop: true,  timeScale: 1.0 },
  walk:      { clip: 'Walk',      loop: true,  timeScale: 1.0 },
  run:       { clip: 'Run',       loop: true,  timeScale: 1.0 },

  // Expressions / reactions
  wave:      { clip: 'Wave',      loop: false, timeScale: 1.0 },
  excited:   { clip: 'Excited',   loop: false, timeScale: 1.2 },
  think:     { clip: 'Think',     loop: true,  timeScale: 0.8 },
  celebrate: { clip: 'Celebrate', loop: false, timeScale: 1.0 },
  sad:       { clip: 'Sad',       loop: false, timeScale: 0.8 },

  // Script / interaction
  look:      { clip: 'Look',      loop: false, timeScale: 1.0 },
  point:     { clip: 'Point',     loop: false, timeScale: 1.0 },
  read:      { clip: 'Read',      loop: true,  timeScale: 0.9 },
}

// Returns the gesture config for a given name, or 'idle' as fallback
export function getGesture(name) {
  return GESTURES[name] ?? GESTURES.idle
}
