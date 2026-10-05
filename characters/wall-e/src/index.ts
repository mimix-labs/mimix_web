import { characterProfileSchema, type CharacterProfile } from '@mimix/character-contract'

export const wallEProfile: CharacterProfile = characterProfileSchema.parse({
  schemaVersion: 1, id: 'wall-e', version: '1.0.0', displayName: 'Wall-E',
  persona: { description: 'Compañero curioso que invita a explorar y aprender paso a paso.', tone: 'warm', locale: 'es' },
  appearance: { assetId: 'wall-e', animations: { idle: 'idle', encourage: 'encourage', celebrate: 'celebrate' } },
})
