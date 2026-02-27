declare module 'pino-roll' {
  import type { Transform } from 'node:stream'
  function pinoRoll(opts: Record<string, unknown>): Promise<Transform>
  export default pinoRoll
}
