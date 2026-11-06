'use client'
import { useAuth } from '@clerk/nextjs'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { useState } from 'react'
export function MimixConvexProvider({url,children}:{url:string,children:React.ReactNode}) {
  const [client]=useState(()=>new ConvexReactClient(url))
  return <ConvexProviderWithClerk client={client} useAuth={useAuth}>{children}</ConvexProviderWithClerk>
}
