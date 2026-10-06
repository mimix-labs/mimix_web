import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { webConfig } from '../lib/config'
import './globals.css'
export const metadata: Metadata = { title: { default: 'Mimix', template: '%s · Mimix' }, description: 'Explora Matemáticas y Ciencias y consulta tu progreso de aprendizaje.' }
export const dynamic = 'force-dynamic'
export default function RootLayout({ children }: { children: React.ReactNode }) {

  return <html lang="es"><body>{webConfig().clerk ? <ClerkProvider signInUrl="/acceso" signInFallbackRedirectUrl="/perfil" signUpFallbackRedirectUrl="/perfil">{children}</ClerkProvider> : children}</body></html>
}
