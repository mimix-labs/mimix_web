import type { Metadata } from 'next'
import { AccountAccess } from '../../../../components/account-access'
import Link from 'next/link'
import { webConfig } from '../../../../lib/config'
export const metadata: Metadata = { title: 'Acceso' }
export default function Access() {
  return <><h1>Tu cuenta Mimix</h1>{webConfig().clerk ? <AccountAccess /> : <><p>El acceso a cuentas aún no está habilitado en este entorno.</p><Link href="/catalogo">Puedes seguir explorando los retos</Link></>}</>
}
