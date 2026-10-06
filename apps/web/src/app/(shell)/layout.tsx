import Link from 'next/link'
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <><a className="skip" href="#contenido">Saltar al contenido</a><header><Link className="brand" href="/">MIMIX</Link><nav aria-label="Principal"><Link href="/catalogo">Catálogo</Link><Link href="/progreso">Progreso</Link><Link href="/perfil">Perfil</Link><Link href="/acceso">Acceso</Link></nav></header><main id="contenido" tabIndex={-1}>{children}</main><footer>Explora a tu ritmo. El robot es opcional.</footer></>
}
