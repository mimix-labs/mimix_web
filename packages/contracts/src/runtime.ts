import { z } from 'zod'
import { behaviorIntentSchema, capabilitySchema, challengeErrorSchema, speakInputSchema } from './challenge.js'
import { learningRecordSchema } from './learning.js'

const envelope = { v: z.literal(1), session: z.string().regex(/^[a-f0-9]{32}$/) }
const id = z.number().int().min(1).max(1000000)
const reply = { ...envelope, id }
export const helloSchema = z.strictObject({ ...envelope, kind: z.literal('hello') })
export const connectSchema = z.strictObject({
  ...envelope, kind: z.literal('connect'), capabilities: z.array(capabilitySchema).max(5),
  timeoutMs: z.number().int().min(50).max(30000),
})
export const commandSchema = z.strictObject({
  ...reply, kind: z.literal('command'), command: z.enum(['initialize', 'start', 'pause', 'resume', 'dispose']),
})
const call = { ...reply, kind: z.literal('call') }
export const callSchema = z.discriminatedUnion('method', [
  z.strictObject({ ...call, method: z.literal('agent.speak'), input: speakInputSchema }),
  z.strictObject({ ...call, method: z.literal('progress.record'), input: learningRecordSchema }),
  z.strictObject({ ...call, method: z.literal('embodiment.perform'), input: behaviorIntentSchema }),
])
const response = <Kind extends 'result' | 'ack'>(kind: Kind) => z.discriminatedUnion('ok', [
  z.strictObject({ ...reply, kind: z.literal(kind), ok: z.literal(true) }),
  z.strictObject({ ...reply, kind: z.literal(kind), ok: z.literal(false), error: challengeErrorSchema }),
])
export const childMessageSchema = z.union([
  callSchema, response('ack'),
  z.strictObject({ ...envelope, kind: z.literal('fault') }),
])
export const hostMessageSchema = z.union([
  commandSchema, response('result'),
  z.strictObject({ ...envelope, kind: z.literal('grants'), capabilities: z.array(capabilitySchema).max(5) }),
  z.strictObject({ ...envelope, kind: z.literal('abort') }),
])
export type RuntimeCall = z.infer<typeof callSchema>
export type RuntimeCommand = z.infer<typeof commandSchema>['command']
export type ChildMessage = z.infer<typeof childMessageSchema>
export type HostMessage = z.infer<typeof hostMessageSchema>
