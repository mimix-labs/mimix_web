'use client'
import { SignIn, UserButton, Show } from '@clerk/nextjs'
import Link from 'next/link'
export function AccountAccess() {
  return <><Show when="signed-out"><SignIn routing="path" path="/acceso" withSignUp /></Show><Show when="signed-in"><p>Tu sesión está activa.</p><UserButton /><p><Link href="/perfil" prefetch={false}>Ver mi perfil</Link></p></Show></>
}
