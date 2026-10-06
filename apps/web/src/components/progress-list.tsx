import Link from 'next/link'
import type { ProgressPage } from '../lib/api'
const states = { active: 'En curso', completed: 'Completado', abandoned: 'Abandonado' }
const names: Record<string, string> = { mathematics: 'Matemáticas', science: 'Ciencias' }
export function ProgressList({ page }: { page: ProgressPage }) {
  return <>{page.items.length ? <ul className="cards">{page.items.map(({ attempt, progress }) => <li className="card" key={attempt.id}><h2>{names[attempt.challengeId] ?? attempt.challengeId}</h2><p>{states[progress.status]} · Versión {attempt.challengeVersion}</p><dl><dt>Respuestas correctas</dt><dd>{progress.correctAnswers} de {progress.answers}</dd><dt>Pistas consultadas</dt><dd>{progress.hints}</dd></dl></li>)}</ul> : <p role="status">Aún no hay intentos registrados en esta página. Explorar los retos actuales no genera finalizaciones automáticas.</p>}{page.nextCursor && <Link className="button" href={`/progreso?after=${encodeURIComponent(page.nextCursor)}`}>Ver más intentos</Link>}</>
}
