// Approved default for every character's space preview. Keep Galaxy settings
// separate: lit preview surfaces, including the title, share this finish.
export const CHARACTER_SPACE_STYLE = Object.freeze({
  front: Object.freeze({
    color: 0xe4efff,
    intensity: 1.8,
    warpBoost: 0.08,
    offset: Object.freeze({ view: 5, up: 3, right: -1.5 }),
  }),
  rim: Object.freeze({
    color: 0x869aff,
    intensity: 1.35,
    warpBoost: 0.45,
    offset: Object.freeze({ view: -3, up: 2, right: 4 }),
  }),
  materials: Object.freeze({
    maxRoughness: 0.7,
    minSpecularIntensity: 0.18,
  }),
})
