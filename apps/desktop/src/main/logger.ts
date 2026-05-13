import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'
import pino from 'pino'

function getLogsDir(): string {
  const dataDir = process.env.GOLEMANCY_DATA_DIR ?? path.join(os.homedir(), '.golemancy')
  return path.join(dataDir, 'logs')
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (app.isPackaged ? 'info' : 'debug'),
  ...(!app.isPackaged
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {
        transport: {
          target: 'pino-roll',
          options: {
            file: path.join(getLogsDir(), 'main'),
            frequency: 'daily',
            dateFormat: 'yyyy-MM-dd',
            mkdir: true,
            // symlink disabled: pino-roll hardcodes 'current.log', which would
            // conflict with server.log in the same directory.
            limit: { count: 6, removeOtherLogFiles: true },
          },
        },
      }),
})
