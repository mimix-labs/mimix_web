import Link from 'next/link'
import { ApiError } from '../lib/api'
export function ApiState({ error, retry }: { error: unknown; retry: '/perfil' | '/progreso' }) {
  if (!(error instanceof ApiError)) throw error
  const message = error.status === 401 ? 'Tu sesión ha vencido. Vuelve a acceder.' : error.status === 404 ? 'Esta información aún no está disponible en este entorno.' : error.status === 429 ? 'Has hecho varias consultas seguidas. Espera un momento y vuelve a intentar.' : error.status === 400 ? 'El enlace de progreso no es válido. Vuelve al inicio de tu progreso.' : 'No pudimos consultar esta información. Vuelve a intentarlo en un momento.'
  return <div className="card" role="status"><p>{message}</p><Link href={error.status === 401 ? '/acceso' : retry}>{error.status === 401 ? 'Acceder' : 'Volver a consultar'}</Link></div>
}
