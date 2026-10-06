import { sessionApi } from '../../lib/session'
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await sessionApi()
  return children
}
