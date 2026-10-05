import { pedagogicalContextSchema, type PedagogicalContext, type Recommendation } from '@mimix/agent-contract'

/** Pure advice over a host-owned snapshot. Does not unlock or start attempts. */
export function recommendNext(input: PedagogicalContext): Recommendation[] {
  const { campaign } = pedagogicalContextSchema.parse(input)
  if (!campaign) return []
  const node = campaign.nodes.find(node => node.status === 'in_progress')
    ?? campaign.nodes.find(node => node.status === 'available' && node.canStart)
  return node ? [{
    kind: node.status === 'in_progress' ? 'resume_challenge' : 'start_challenge',
    campaignId: campaign.id, campaignVersion: campaign.version, nodeId: node.id,
    challengeId: node.challengeId, challengeVersion: node.challengeVersion,
  }] : []
}
