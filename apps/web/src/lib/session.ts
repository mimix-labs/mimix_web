import 'server-only'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createApiClient } from './api'
import { webConfig } from './config'
export async function sessionApi() {
  const config = webConfig()
  if (!config.clerk) redirect('/acceso')
  const session = await auth()
  const token = session.isAuthenticated ? await session.getToken() : null
  if (!token) redirect('/acceso')
  return createApiClient(config.apiOrigin, token)
}
