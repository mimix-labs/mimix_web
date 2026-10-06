import type { Metadata } from 'next'
import mathematics from '@mimix/challenge-mathematics/manifest.json'
import science from '@mimix/challenge-science/manifest.json'
import { challengeManifestSchema } from '@mimix/contracts'
import { webConfig } from '../../../lib/config'
export const metadata: Metadata = { title: 'Catálogo' }
export default function Catalog() {
  const manifests = [mathematics, science].map(value => challengeManifestSchema.parse(value))
  return <><h1>Explora los retos</h1><p>Elige qué quieres descubrir. Estos retos son de exploración abierta y no registran una finalización de aprendizaje automática.</p><ul className="cards">{manifests.map(manifest => <li className="card" key={manifest.id}><h2>{manifest.title}</h2><p>{manifest.objectives[0]?.description}</p><p className="muted">Versión {manifest.version}. Puedes usar teclado y ratón, o activar la cámara para los gestos.</p><a className="button" href={`${webConfig().legacyOrigin}/challenges/${manifest.id}/`}>Explorar {manifest.title}</a></li>)}</ul></>
}
