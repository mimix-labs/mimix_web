import { createHash, timingSafeEqual } from 'node:crypto'

// These shared secrets are temporary compatibility credentials, not user sessions.
function matches(received, expected) {
  if (typeof received !== 'string') return false
  return timingSafeEqual(
    createHash('sha256').update(received).digest(),
    createHash('sha256').update(expected).digest(),
  )
}

export function createBridgeAuth(bridgeToken, controlToken) {
  function bridge(required) {
    return (req, res, next) => {
      if (!bridgeToken) {
        return required
          ? res.status(503).json({ error: 'robot bridge is not configured' })
          : next()
      }
      if (!matches(req.get('X-Mimix-Robot-Token'), bridgeToken)) {
        return res.status(401).json({ error: 'invalid robot bridge token' })
      }
      return next()
    }
  }
  return {
    requireRobotBridge: bridge(false),
    requireConfiguredRobotBridge: bridge(true),
    requireRobotControl(req, res, next) {
      if (!bridgeToken || !controlToken) {
        return res.status(503).json({ error: 'remote robot control is disabled' })
      }
      if (!matches(req.get('X-Mimix-Control-Token'), controlToken)) {
        return res.status(401).json({ error: 'invalid robot control token' })
      }
      return next()
    },
  }
}
