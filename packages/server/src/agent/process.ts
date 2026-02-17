import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import type { TaskId } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:process' })

export class AgentProcessManager {
  private processes = new Map<string, ChildProcess>()
  private killTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private maxConcurrent: number

  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent
  }

  async spawnAgent(
    taskId: TaskId,
    workerData: Record<string, unknown>,
    onMessage?: (msg: unknown) => void,
    onExit?: (code: number | null) => void,
  ): Promise<void> {
    if (this.processes.size >= this.maxConcurrent) {
      throw new Error(`Max concurrent agents (${this.maxConcurrent}) reached`)
    }

    log.debug({ taskId, running: this.processes.size }, 'spawning agent process')

    // TODO: worker.js is a placeholder — replace with actual agent worker implementation
    const workerPath = path.join(import.meta.dirname, 'worker.js')
    const child = fork(workerPath, { serialization: 'json' })

    child.send({ type: 'run', ...workerData, taskId })
    this.processes.set(taskId, child)

    if (onMessage) {
      child.on('message', onMessage)
    }

    child.on('exit', (code) => {
      log.debug({ taskId, code }, 'agent process exited')
      this.processes.delete(taskId)
      const timer = this.killTimers.get(taskId)
      if (timer) {
        clearTimeout(timer)
        this.killTimers.delete(taskId)
      }
      onExit?.(code)
    })
  }

  async cancelAgent(taskId: TaskId): Promise<void> {
    const child = this.processes.get(taskId)
    if (!child) return

    log.debug({ taskId }, 'cancelling agent process')
    child.send({ type: 'abort' })
    const timer = setTimeout(() => {
      this.killTimers.delete(taskId)
      if (this.processes.has(taskId)) {
        child.kill('SIGKILL')
        this.processes.delete(taskId)
      }
    }, 5000)
    this.killTimers.set(taskId, timer)
  }

  getRunningCount(): number {
    return this.processes.size
  }

  isRunning(taskId: TaskId): boolean {
    return this.processes.has(taskId)
  }

  async shutdownAll(): Promise<void> {
    const ids = [...this.processes.keys()]
    await Promise.all(ids.map(id => this.cancelAgent(id as TaskId)))
  }
}
