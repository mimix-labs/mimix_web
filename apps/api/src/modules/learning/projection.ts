import type { attemptProgress, learningEvents } from '../../database/schema.js'
export type Progress = typeof attemptProgress.$inferSelect
export function project(previous: Progress | undefined, event: typeof learningEvents.$inferSelect): Progress {
  if (event.sequence === 1 && event.type === 'attempt_started' && !previous) return { attemptId: event.attemptId, status: 'active', lastSequence: 1, answers: 0, correctAnswers: 0, hints: 0 }
  if (!previous || previous.status !== 'active' || event.sequence !== previous.lastSequence + 1) throw new Error('Invalid learning history')
  return { ...previous, lastSequence: event.sequence,
    answers: previous.answers + Number(event.type === 'answer_submitted'),
    correctAnswers: previous.correctAnswers + Number(event.type === 'answer_submitted' && event.payload.correct === true),
    hints: previous.hints + Number(event.type === 'hint_requested'),
    status: event.type === 'attempt_completed' ? 'completed' : event.type === 'attempt_abandoned' ? 'abandoned' : 'active',
  }
}
