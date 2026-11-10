import type { Metadata } from 'next'
import { AccountAccess } from '../../../../components/account-access'
export const metadata: Metadata = { title: 'Acceso' }
export default function Access() {
  return <AccountAccess />
}
