import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import type { TaskId } from '@solocraft/shared'

export class AgentProcessManager {
  private processes = new Map<string, ChildProcess>()
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

    const workerPath = path.join(import.meta.dirname, 'worker.js')
    const child = fork(workerPath, { serialization: 'json' })

    child.send({ type: 'run', ...workerData, taskId })
    this.processes.set(taskId, child)

    if (onMessage) {
      child.on('message', onMessage)
    }

    child.on('exit', (code) => {
      this.processes.delete(taskId)
      onExit?.(code)
    })
  }

  async cancelAgent(taskId: TaskId): Promise<void> {
    const child = this.processes.get(taskId)
    if (!child) return

    child.send({ type: 'abort' })
    setTimeout(() => {
      if (this.processes.has(taskId)) {
        child.kill('SIGKILL')
        this.processes.delete(taskId)
      }
    }, 5000)
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
