export function readWebConfig(env: Readonly<Record<string,string|undefined>>) {
  function origin(value: string, name: string) {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`Invalid ${name}`)
    if (env.NODE_ENV === 'production' && url.protocol !== 'https:' && !['localhost','127.0.0.1','api'].includes(url.hostname)) throw new Error(`${name} requires HTTPS`)
    return url.origin
  }
  const authMode=env.MIMIX_WEB_AUTH_MODE??'disabled'
  if(!['disabled','clerk'].includes(authMode))throw new Error('Invalid MIMIX_WEB_AUTH_MODE')
  if(authMode==='clerk'&&(!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY||!env.CLERK_SECRET_KEY))throw new Error('Clerk keys required')
  const worldMode=env.MIMIX_WORLD_MODE??'legacy'
  if(!['legacy','next'].includes(worldMode))throw new Error('Invalid MIMIX_WORLD_MODE')
  const dataBackend=env.MIMIX_DATA_BACKEND??'api'
  if(!['api','convex'].includes(dataBackend))throw new Error('Invalid MIMIX_DATA_BACKEND')
  if(dataBackend==='convex'&&(authMode!=='clerk'||!env.NEXT_PUBLIC_CONVEX_URL))throw new Error('Convex requires Clerk and NEXT_PUBLIC_CONVEX_URL')
  return {worldMode,clerk:authMode==='clerk',dataBackend,
    convexUrl:env.NEXT_PUBLIC_CONVEX_URL?origin(env.NEXT_PUBLIC_CONVEX_URL,'NEXT_PUBLIC_CONVEX_URL'):null,
    apiOrigin:origin(env.MIMIX_API_ORIGIN??'http://127.0.0.1:4000','MIMIX_API_ORIGIN'),
    legacyOrigin:origin(env.MIMIX_LEGACY_ORIGIN??'http://localhost:5173','MIMIX_LEGACY_ORIGIN'),
  }
}
