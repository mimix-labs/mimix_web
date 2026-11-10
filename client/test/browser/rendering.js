import { expect } from '@playwright/test'

// Render integration tests wait for observable frames, not a minimum GPU rate.
// The unit tests still enforce the actual animation durations and damping.
export const expectRendered = expect.configure({ timeout: 30000 })
