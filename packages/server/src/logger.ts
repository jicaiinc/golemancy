import path from 'node:path'
import pino from 'pino'
import { getLogsDir } from './utils/paths'

const isDev = process.env.NODE_ENV !== 'production'

async function createLogger(): Promise<pino.Logger> {
  if (isDev) {
    return pino({
      level: process.env.LOG_LEVEL ?? 'debug',
      transport: { target: 'pino-pretty', options: { colorize: true } },
    })
  }

  // In production, create pino-roll stream directly instead of using pino's
  // `transport` option. The transport system delegates to thread-stream which
  // spawns a Worker thread — this breaks in ESM bundles because thread-stream
  // tries to resolve its own lib/worker.js via __dirname (unavailable in ESM)
  // and the file doesn't exist separately after bundling.
  const pinoRoll = (await import('pino-roll')).default
  const stream = await pinoRoll({
    file: path.join(getLogsDir(), 'server'),
    frequency: 'daily',
    dateFormat: 'yyyy-MM-dd',
    mkdir: true,
    // symlink disabled: pino-roll hardcodes 'current.log', which would
    // conflict with main.log in the same directory.
    limit: { count: 6, removeOtherLogFiles: true },
  })
  return pino({ level: process.env.LOG_LEVEL ?? 'info' }, stream)
}

export const logger = await createLogger()
