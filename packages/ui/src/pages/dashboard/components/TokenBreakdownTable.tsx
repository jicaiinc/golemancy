import { PixelCard } from '../../../components'
import { formatTokens } from '../utils'

interface BreakdownRow {
  label: string
  sublabel?: string
  inputTokens: number
  outputTokens: number
  callCount: number
}

interface TokenBreakdownTableProps {
  title: string
  data: BreakdownRow[]
  onRowClick?: (index: number) => void
}

export function TokenBreakdownTable({ title, data, onRowClick }: TokenBreakdownTableProps) {
  if (data.length === 0) {
    return (
      <PixelCard variant="default" className="py-6 text-center">
        <p className="font-pixel text-[9px] text-text-dim">No data</p>
      </PixelCard>
    )
  }

  const maxTotal = Math.max(...data.map(d => d.inputTokens + d.outputTokens), 1)

  return (
    <PixelCard variant="default">
      <h3 className="font-pixel text-[10px] text-text-secondary mb-3">{title}</h3>
      {/* Header */}
      <div className="grid grid-cols-[1fr_5rem_5rem_4rem_8rem] gap-2 px-2 py-1 border-b-2 border-border-dim">
        <span className="text-[9px] text-text-dim font-mono">Name</span>
        <span className="text-[9px] text-text-dim font-mono text-right">Input</span>
        <span className="text-[9px] text-text-dim font-mono text-right">Output</span>
        <span className="text-[9px] text-text-dim font-mono text-right">Calls</span>
        <span className="text-[9px] text-text-dim font-mono">Ratio</span>
      </div>
      {/* Rows */}
      <div className="max-h-64 overflow-y-auto">
        {data.map((row, idx) => {
          const total = row.inputTokens + row.outputTokens
          const pct = (total / maxTotal) * 100
          const inputPct = total > 0 ? (row.inputTokens / total) * 100 : 0
          return (
            <div
              key={row.label + idx}
              className={`grid grid-cols-[1fr_5rem_5rem_4rem_8rem] gap-2 px-2 py-1.5 hover:bg-elevated/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => onRowClick?.(idx)}
            >
              <div className="min-w-0">
                <span className="text-[11px] text-text-primary font-mono truncate block">{row.label}</span>
                {row.sublabel && <span className="text-[9px] text-text-dim">{row.sublabel}</span>}
              </div>
              <span className="text-[11px] text-accent-blue font-mono text-right">{formatTokens(row.inputTokens)}</span>
              <span className="text-[11px] text-accent-emerald font-mono text-right">{formatTokens(row.outputTokens)}</span>
              <span className="text-[11px] text-text-secondary font-mono text-right">{row.callCount}</span>
              <div className="flex items-center gap-1">
                <div className="flex-1 h-2 bg-elevated overflow-hidden">
                  <div className="h-full flex" style={{ width: `${pct}%` }}>
                    <div className="bg-accent-blue/70" style={{ width: `${inputPct}%` }} />
                    <div className="bg-accent-emerald/70" style={{ width: `${100 - inputPct}%` }} />
                  </div>
                </div>
                <span className="text-[9px] text-text-dim font-mono w-8 text-right">{formatTokens(total)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </PixelCard>
  )
}
