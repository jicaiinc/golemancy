import { app } from 'electron'
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (app.isPackaged ? 'info' : 'debug'),
  ...(!app.isPackaged
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
})
