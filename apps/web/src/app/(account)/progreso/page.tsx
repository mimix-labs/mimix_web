import type { Metadata } from 'next'
import Link from 'next/link'
import { sessionApi } from '../../../lib/session'
import { ApiState } from '../../../components/api-state'
import { ProgressList } from '../../../components/progress-list'
import { ApiError } from '../../../lib/api'
export const metadata: Metadata = { title: 'Progreso' }
export default async function Progress({ searchParams }: { searchParams: Promise<{ after?: string | string[] }> }) {
  const api = await sessionApi()
  const { after } = await searchParams
  try {
    if (Array.isArray(after)) throw new ApiError(400)
    const page = await api.progress(after)
    return <><h1>Mi progreso</h1><p>Consulta tus intentos y los eventos de aprendizaje registrados.</p><ProgressList page={page} />{after && <p><Link href="/progreso">Volver a los primeros intentos</Link></p>}</>
  } catch (error) { return <><h1>Mi progreso</h1><ApiState error={error} retry="/progreso" /></> }
}
