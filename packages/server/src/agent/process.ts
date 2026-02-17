import type { ChildProcess } from 'node:child_process'
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

  // TODO: worker.js is a placeholder — replace with actual agent worker implementation.
  // Depends on: agent runtime loop, task execution pipeline, IPC message protocol.
  async spawnAgent(
    _taskId: TaskId,
    _workerData: Record<string, unknown>,
    _onMessage?: (msg: unknown) => void,
    _onExit?: (code: number | null) => void,
  ): Promise<void> {
    throw new Error('AgentProcessManager: worker not implemented yet')
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
