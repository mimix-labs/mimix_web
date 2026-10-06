import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import Link from 'next/link'
import { webConfig } from '../lib/config'
import './globals.css'
export const metadata: Metadata = { title: { default: 'Mimix', template: '%s · Mimix' }, description: 'Explora Matemáticas y Ciencias y consulta tu progreso de aprendizaje.' }
export const dynamic = 'force-dynamic'
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = <><a className="skip" href="#contenido">Saltar al contenido</a><header><Link className="brand" href="/">MIMIX</Link><nav aria-label="Principal"><Link href="/catalogo">Catálogo</Link><Link href="/progreso">Progreso</Link><Link href="/perfil">Perfil</Link><Link href="/acceso">Acceso</Link></nav></header><main id="contenido" tabIndex={-1}>{children}</main><footer>Explora a tu ritmo. El robot es opcional.</footer></>
  return <html lang="es"><body>{webConfig().clerk ? <ClerkProvider signInUrl="/acceso" signInFallbackRedirectUrl="/perfil" signUpFallbackRedirectUrl="/perfil">{content}</ClerkProvider> : content}</body></html>
}
