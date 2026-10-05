export const userId = '11111111-1111-4111-8111-111111111111'
export const conversationId = '22222222-2222-4222-8222-222222222222'
export const context = {
  schemaVersion: 1, userId, conversationId,
  objectives: [{ id: 'count', description: 'Contar objetos' }],
  campaign: { id: 'intro', version: '1.0.0', nodes: [
    { id: 'first', challengeId: 'math', challengeVersion: '1.0.0', status: 'available', canStart: true },
    { id: 'second', challengeId: 'science', challengeVersion: '1.0.0', status: 'locked', canStart: false },
  ] },
}
export const authorization = { userId, conversationId, permissions: ['agent:turn', 'learning:read'], capabilities: ['agent', 'progress'] }
export const input = { schemaVersion: 1, id: '33333333-3333-4333-8333-333333333333', message: '¿Qué puedo aprender?', history: [] }
