'use client'
export default function ErrorPage({ reset }: { reset: () => void }) { return <div role="alert"><h1>No pudimos cargar esta página</h1><p>Vuelve a intentarlo o regresa al inicio.</p><button className="button" onClick={reset}>Volver a intentar</button><p><a href="/">Ir al inicio</a></p></div> }
