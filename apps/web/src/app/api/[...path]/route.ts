import { forwardActivityRequest } from '../../../lib/activity-api'
import { webConfig } from '../../../lib/config'

export const dynamic = 'force-dynamic'
export function GET(request: Request) { return forwardActivityRequest(request, webConfig().apiOrigin) }
export function POST(request: Request) { return forwardActivityRequest(request, webConfig().apiOrigin) }
