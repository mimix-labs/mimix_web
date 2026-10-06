import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server'
import { webConfig } from './lib/config'
// Early navigation redirect only; each protected resource also calls sessionApi().
const isAccountRoute = (request: NextRequest) => ['/perfil', '/progreso'].includes(request.nextUrl.pathname)
const clerk = clerkMiddleware(async (auth, request) => {
  if (isAccountRoute(request) && !(await auth()).isAuthenticated) {
    return NextResponse.redirect(new URL('/acceso', request.url))
  }
}, { jwtKey: process.env.CLERK_JWT_KEY })
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (webConfig().clerk) return clerk(request, event)
  if (isAccountRoute(request)) return NextResponse.redirect(new URL('/acceso', request.url))
  return NextResponse.next()
}
export const config = { matcher: ['/((?!_next|healthz|.*\\.(?:png|jpg|svg|ico|css|js)$).*)'] }
