import Link from 'next/link'
import { webConfig } from '../lib/config'
export default function Home() {
  return <><p className="eyebrow">Aprende explorando</p><h1>Un mundo de Matemáticas y Ciencias</h1><p>Descubre figuras y elementos junto a Wall-E. Explora con teclado y ratón; los gestos y el robot son opcionales.</p><div className="actions"><Link className="button" href="/catalogo">Explorar retos</Link><a href={webConfig().legacyOrigin}>Abrir el mundo 3D</a></div><p className="muted">El mundo 3D se abre en la experiencia actual de Mimix. Puedes volver aquí para consultar tu cuenta y progreso.</p></>
}
