import type { Metadata } from 'next'
import { SignIn, UserButton, Show } from '@clerk/nextjs'
import Link from 'next/link'
import { webConfig } from '../../../../lib/config'
export const metadata: Metadata = { title: 'Acceso' }
export default function Access() {
  return <><h1>Tu cuenta Mimix</h1>{webConfig().clerk ? <><Show when="signed-out"><SignIn routing="path" path="/acceso" /></Show><Show when="signed-in"><p>Tu sesión está activa.</p><UserButton /><p><Link href="/perfil">Ver mi perfil</Link></p></Show></> : <><p>El acceso a cuentas aún no está habilitado en este entorno.</p><Link href="/catalogo">Puedes seguir explorando los retos</Link></>}</>
}
