import type { CampaignDefinition } from '@mimix/contracts'
// Technical opt-in seed, not a final pedagogical campaign. Views do not emit completion.
export const officialIntro: CampaignDefinition = {
  schemaVersion: 1, id: 'official-intro', version: '1.0.0', title: 'Exploración inicial (semilla técnica)',
  nodes: [
    { id: 'shapes', challengeId: 'mathematics', challengeVersion: '1.0.0', prerequisites: [] },
    { id: 'elements', challengeId: 'science', challengeVersion: '1.0.0', prerequisites: ['shapes'] },
  ],
}
