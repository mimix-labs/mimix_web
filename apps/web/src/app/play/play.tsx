'use client'
import dynamic from 'next/dynamic'
const World = dynamic(() => import('./world'), { ssr: false, loading: () => <p role="status">Preparando tu aventura…</p> })
export default function Play({ challengeOrigin }: { challengeOrigin: string }) { return <World challengeOrigin={challengeOrigin} /> }
