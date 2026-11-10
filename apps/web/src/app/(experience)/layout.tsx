import { auth } from '@clerk/nextjs/server'
import { ExperienceShell } from '../../components/experience-shell'
import { webConfig } from '../../lib/config'
import '../welcome.css'

export default async function ExperienceLayout({ children }: { children: React.ReactNode }) {
  const config = webConfig()
  const signedIn = config.clerk ? (await auth()).isAuthenticated : false
  return <ExperienceShell authEnabled={config.clerk} initialSignedIn={signedIn} challengeOrigin={config.legacyOrigin}>{children}</ExperienceShell>
}
