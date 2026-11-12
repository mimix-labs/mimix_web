import Link from 'next/link'
export default function Home() {
  return <><p className="eyebrow">Aprende explorando</p><h1>Un mundo de Matemáticas y Ciencias</h1><p>Descubre figuras y elementos junto a RobotExpressive. Explora con teclado y ratón; los gestos y el robot son opcionales.</p><div className="actions"><Link className="button" href="/catalogo">Explorar retos</Link><a href="/mundo">Abrir el mundo 3D</a></div><p className="muted"> Puedes volver aquí para consultar tu cuenta y progreso.</p></>
}
