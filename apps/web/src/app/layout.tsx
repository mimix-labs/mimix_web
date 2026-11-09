import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { mimixLocalization } from '../components/clerk-localization'
import { webConfig } from '../lib/config'
import './globals.css'
import { MimixConvexProvider } from '../components/convex-provider'
export const metadata: Metadata = { title: { default: 'Mimix', template: '%s · Mimix' }, description: 'Explora Matemáticas y Ciencias y consulta tu progreso de aprendizaje.' }
export const dynamic = 'force-dynamic'
export default function RootLayout({ children }: { children: React.ReactNode }) {

  const config=webConfig()
  const content=config.dataBackend==='convex' ? <MimixConvexProvider url={config.convexUrl!}>{children}</MimixConvexProvider> : children
  return <html lang="es"><body>{config.clerk ? <ClerkProvider localization={mimixLocalization} signInUrl="/acceso" signInFallbackRedirectUrl="/perfil" signUpFallbackRedirectUrl="/perfil">{content}</ClerkProvider> : content}</body></html>
}
