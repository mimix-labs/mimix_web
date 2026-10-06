import type { Metadata } from 'next'
import { UserButton } from '@clerk/nextjs'
import { sessionApi } from '../../../lib/session'
import { ApiState } from '../../../components/api-state'
export const metadata: Metadata = { title: 'Perfil' }
export default async function Profile() {
  const api = await sessionApi()
  try {
    const user = await api.me()
    return <><h1>Mi perfil</h1><p>Tu identidad en Mimix conserva tu aprendizaje entre sesiones.</p><dl className="card"><dt>Identificador Mimix</dt><dd>{user.id}</dd><dt>Cuenta creada</dt><dd><time dateTime={user.createdAt}>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(new Date(user.createdAt))}</time></dd></dl><p>Gestiona tu cuenta o cierra sesión:</p><UserButton /></>
  } catch (error) { return <><h1>Mi perfil</h1><ApiState error={error} retry="/perfil" /></> }
}
