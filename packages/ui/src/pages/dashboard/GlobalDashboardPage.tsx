import { useEffect, useState, useMemo, useCallback } from 'react'
import type {
  DashboardSummary, DashboardTokenTrend, DashboardTokenByModel, DashboardTokenByAgent,
  RuntimeStatus, TimeRange, ProjectId,
} from '@golemancy/shared'
import { GlobalLayout } from '../../app/layouts/GlobalLayout'
import { getServices } from '../../services/container'
import { useWs } from '../../providers/WebSocketProvider'
import { PixelCard, PixelSpinner, PixelTabs } from '../../components'
import { TimeRangeSelector, TokenSummaryCards, TokenBreakdownTable, RuntimeStatusPanel } from './components'
import { formatTokens } from './utils'

interface TokenByProject {
  projectId: ProjectId
  projectName: string
  inputTokens: number
  outputTokens: number
  callCount: number
}

// --- Token Trend Chart (prop-driven for local state) ---
function GlobalTokenTrendChart({ data, timeRange }: { data: DashboardTokenTrend[]; timeRange: TimeRange }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const slicedData = useMemo(() => {
    if (timeRange === 'today') return data
    if (timeRange === '7d') return data.slice(-7)
    if (timeRange === '30d') return data.slice(-30)
    return data
  }, [data, timeRange])

  const maxTotal = useMemo(() => {
    if (slicedData.length === 0) return 1
    return Math.max(...slicedData.map(d => d.inputTokens + d.outputTokens), 1)
  }, [slicedData])

  if (slicedData.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="font-pixel text-[9px] text-text-dim">No token data available</p>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-6 w-12 flex flex-col justify-between text-[9px] text-text-dim font-mono">
          <span>{formatTokens(maxTotal)}</span>
          <span>{formatTokens(Math.floor(maxTotal / 2))}</span>
          <span>0</span>
        </div>
        <div className="ml-14 flex items-end gap-[2px] h-40">
          {slicedData.map((d, i) => {
            const total = d.inputTokens + d.outputTokens
            const heightPct = (total / maxTotal) * 100
            const inputPct = total > 0 ? (d.inputTokens / total) * 100 : 50
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col justify-end relative cursor-pointer group"
                style={{ height: '100%' }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {hoveredIdx === i && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-elevated border-2 border-border-dim shadow-pixel-drop px-2 py-1 z-10 whitespace-nowrap">
                    <div className="text-[9px] font-mono text-text-primary">{d.date}</div>
                    <div className="text-[8px] font-mono text-accent-blue">In: {formatTokens(d.inputTokens)}</div>
                    <div className="text-[8px] font-mono text-accent-emerald">Out: {formatTokens(d.outputTokens)}</div>
                  </div>
                )}
                <div className="w-full transition-all duration-150" style={{ height: `${heightPct}%` }}>
                  <div className="w-full bg-accent-blue/70 hover:bg-accent-blue" style={{ height: `${inputPct}%` }} />
                  <div className="w-full bg-accent-emerald/70 hover:bg-accent-emerald" style={{ height: `${100 - inputPct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="ml-14 flex gap-[2px] mt-1">
          {slicedData.map((d, i) => {
            const interval = Math.max(1, Math.ceil(slicedData.length / 10))
            const showLabel = i % interval === 0
            return (
              <div key={d.date} className="flex-1 text-center">
                {showLabel && (
                  <span className="text-[8px] text-text-dim font-mono">
                    {timeRange === 'today' ? d.date : d.date.slice(5)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-accent-blue/70" />
          <span className="text-[9px] text-text-dim font-mono">Input</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-accent-emerald/70" />
          <span className="text-[9px] text-text-dim font-mono">Output</span>
        </div>
      </div>
    </div>
  )
}

// --- Main Global Dashboard Page ---
export function GlobalDashboardPage() {
  const { addListener } = useWs()

  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('today')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [tokenByModel, setTokenByModel] = useState<(DashboardTokenByModel & { projectId: ProjectId; projectName: string })[]>([])
  const [tokenByAgent, setTokenByAgent] = useState<(DashboardTokenByAgent & { projectId: ProjectId; projectName: string })[]>([])
  const [tokenByProject, setTokenByProject] = useState<TokenByProject[]>([])
  const [tokenTrend, setTokenTrend] = useState<DashboardTokenTrend[]>([])
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null)

  const [tokenTab, setTokenTab] = useState('trend')

  const loadData = useCallback(async (range: TimeRange) => {
    const svc = getServices().globalDashboard
    try {
      const [s, byModel, byAgent, byProject, trend, runtime] = await Promise.all([
        svc.getSummary(range),
        svc.getTokenByModel(range),
        svc.getTokenByAgent(range),
        svc.getTokenByProject(range),
        svc.getTokenTrend(undefined, range),
        svc.getRuntimeStatus(),
      ])
      setSummary(s)
      setTokenByModel(byModel)
      setTokenByAgent(byAgent)
      setTokenByProject(byProject)
      setTokenTrend(trend)
      setRuntimeStatus(runtime)
    } catch (err) {
      console.error('Failed to load global dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load on mount and when timeRange changes
  useEffect(() => {
    loadData(timeRange)
  }, [loadData, timeRange])

  // WS: runtime events → refresh runtime status
  useEffect(() => {
    const events = ['runtime:chat_started', 'runtime:chat_ended', 'runtime:cron_started', 'runtime:cron_ended']
    const cleanups = events.map(evt =>
      addListener(evt, async () => {
        const status = await getServices().globalDashboard.getRuntimeStatus()
        setRuntimeStatus(status)
      }),
    )
    return () => cleanups.forEach(fn => fn())
  }, [addListener])

  // WS: token:recorded → debounced reload
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const cleanup = addListener('token:recorded', () => {
      clearTimeout(timer)
      timer = setTimeout(() => loadData(timeRange), 2000)
    })
    return () => {
      clearTimeout(timer)
      cleanup()
    }
  }, [addListener, loadData, timeRange])

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range)
  }

  // Breakdown data mapped for TokenBreakdownTable
  const breakdownByProject = useMemo(() =>
    tokenByProject.map(p => ({
      label: p.projectName,
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      callCount: p.callCount,
    })),
    [tokenByProject],
  )

  const breakdownByModel = useMemo(() =>
    tokenByModel.map(m => ({
      label: m.model,
      sublabel: `${m.provider} · ${m.projectName}`,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      callCount: m.callCount,
    })),
    [tokenByModel],
  )

  const breakdownByAgent = useMemo(() =>
    tokenByAgent.map(a => ({
      label: a.agentName,
      sublabel: a.projectName,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      callCount: a.callCount,
    })),
    [tokenByAgent],
  )

  return (
    <GlobalLayout>
      <div className="max-w-[1400px] mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-pixel text-[14px] text-text-primary">Global Dashboard</h1>
          <p className="mt-1 text-text-secondary text-[13px]">Cross-project overview</p>
        </div>

        {loading && !summary ? (
          <div className="flex items-center justify-center h-64">
            <PixelSpinner label="Loading dashboard..." />
          </div>
        ) : (
          <>
            {/* Section 1: Token Usage — TimeRange + Summary */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-pixel text-[11px] text-text-secondary">TOKEN USAGE</h2>
                <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
              </div>
              <TokenSummaryCards summary={summary} />
            </div>

            {/* Section 2: Unified Token Details — Trend / By Project / By Model / By Agent */}
            <div className="mb-6">
              <PixelCard variant="default">
                <div className="mb-4">
                  <PixelTabs
                    tabs={[
                      { id: 'trend', label: 'Trend' },
                      { id: 'by-project', label: 'By Project' },
                      { id: 'by-model', label: 'By Model' },
                      { id: 'by-agent', label: 'By Agent' },
                    ]}
                    activeTab={tokenTab}
                    onTabChange={setTokenTab}
                  />
                </div>
                {tokenTab === 'trend' && <GlobalTokenTrendChart data={tokenTrend} timeRange={timeRange} />}
                {tokenTab === 'by-project' && <TokenBreakdownTable title="TOKEN BY PROJECT" data={breakdownByProject} inline />}
                {tokenTab === 'by-model' && <TokenBreakdownTable title="TOKEN BY MODEL" data={breakdownByModel} inline />}
                {tokenTab === 'by-agent' && <TokenBreakdownTable title="TOKEN BY AGENT" data={breakdownByAgent} inline />}
              </PixelCard>
            </div>

            {/* Section 3: Runtime Status */}
            <div className="mb-6">
              <RuntimeStatusPanel status={runtimeStatus} />
            </div>

            {/* Section 4: Overview - Top Projects */}
            <PixelCard variant="default">
              <h3 className="font-pixel text-[10px] text-text-secondary mb-3">TOP PROJECTS</h3>
              {tokenByProject.length === 0 ? (
                <p className="text-[10px] text-text-dim text-center py-4">No project data</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {tokenByProject.map(p => (
                    <div key={p.projectId} className="flex items-center gap-3 px-2 py-1.5 hover:bg-elevated/50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] text-text-primary font-mono truncate block">{p.projectName}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-[10px] text-text-secondary font-mono">
                          {formatTokens(p.inputTokens + p.outputTokens)} tokens · {p.callCount} calls
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PixelCard>
          </>
        )}
      </div>
    </GlobalLayout>
  )
}
