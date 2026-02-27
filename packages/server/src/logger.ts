import path from 'node:path'
import pino from 'pino'
import { getLogsDir } from './utils/paths'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {
        transport: {
          target: path.join(import.meta.dirname, 'log-transport.js'),
          options: {
            file: path.join(getLogsDir(), 'server'),
            frequency: 'daily',
            dateFormat: 'yyyy-MM-dd',
            mkdir: true,
            // symlink disabled: pino-roll hardcodes 'current.log', which would
            // conflict with main.log in the same directory.
            limit: { count: 6, removeOtherLogFiles: true },
          },
        },
      }),
})
