import type { CampaignDefinition, CampaignProgress } from '@mimix/contracts'
export interface NodeFacts { nodeId: string; attempts: number; completedAttempts: number; activeAttemptId: string | null }
// Facts have already been scoped by owner and exact campaign version in the store.
export function projectCampaign(definition: CampaignDefinition, facts: NodeFacts[]): CampaignProgress {
  const byNode = new Map(facts.map(fact => [fact.nodeId, fact]))
  const completed = new Set(facts.filter(fact => fact.completedAttempts > 0).map(fact => fact.nodeId))
  const nodes = definition.nodes.map(node => {
    const fact = byNode.get(node.id)
    const blockedBy = node.prerequisites.filter(id => !completed.has(id))
    const activeAttemptId = fact?.activeAttemptId ?? null
    return { id: node.id, status: completed.has(node.id) ? 'completed' as const : activeAttemptId ? 'in_progress' as const : blockedBy.length ? 'locked' as const : 'available' as const,
      canStart: blockedBy.length === 0 && !activeAttemptId, blockedBy,
      attempts: fact?.attempts ?? 0, completedAttempts: fact?.completedAttempts ?? 0, activeAttemptId }
  })
  const completedNodes = nodes.filter(node => node.status === 'completed').length
  return { campaignId: definition.id, campaignVersion: definition.version,
    status: completedNodes === nodes.length ? 'completed' : nodes.some(node => node.attempts > 0) ? 'in_progress' : 'not_started',
    completedNodes, totalNodes: nodes.length, nodes }
}
