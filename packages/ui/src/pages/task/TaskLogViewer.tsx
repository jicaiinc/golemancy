import type { TaskLogEntry } from '@solocraft/shared'
import { PixelBadge } from '../../components'

interface TaskLogViewerProps {
  log: TaskLogEntry[]
}

const typeBadge: Record<TaskLogEntry['type'], 'info' | 'running' | 'success' | 'error' | 'idle'> = {
  start: 'info',
  tool_call: 'running',
  generation: 'idle',
  error: 'error',
  completed: 'success',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false })
}

export function TaskLogViewer({ log }: TaskLogViewerProps) {
  if (log.length === 0) {
    return <p className="text-[12px] text-text-dim py-2">No log entries</p>
  }

  return (
    <div className="flex flex-col gap-1">
      {log.map((entry, i) => (
        <div key={i} className="flex items-start gap-3 py-1.5 px-2 hover:bg-elevated/30">
          <span className="text-[11px] font-mono text-text-dim shrink-0 mt-0.5">
            {formatTime(entry.timestamp)}
          </span>
          <PixelBadge variant={typeBadge[entry.type]} className="shrink-0">
            {entry.type}
          </PixelBadge>
          <span className="text-[12px] text-text-secondary font-mono break-all">
            {entry.content}
          </span>
        </div>
      ))}
    </div>
  )
}
