import { webConfig } from '../../lib/config'
export const dynamic = 'force-dynamic'
export function GET() { webConfig(); return Response.json({ status: 'ok', service: 'mimix-web' }, { headers: { 'Cache-Control': 'no-store' } }) }
