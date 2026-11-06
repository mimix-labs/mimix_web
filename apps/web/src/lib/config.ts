import 'server-only'
import { readWebConfig } from './config-values'
export function webConfig() { return readWebConfig(process.env) }
