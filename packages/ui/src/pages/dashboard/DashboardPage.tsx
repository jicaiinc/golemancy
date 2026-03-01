import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { ProjectId, ConversationId, CronJobId, TimeRange } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { useWs } from '../../providers/WebSocketProvider'
import { PixelCard, PixelSpinner, PixelTabs } from '../../components'
import { TimeRangeSelector, TokenSummaryCards, TokenBreakdownTable, RuntimeStatusPanel, OverviewPanel } from './components'
import { formatTokens } from './utils'

// --- Token Trend Chart (pure div + Tailwind, no chart library) ---
function TokenTrendChart() {
  const { t } = useTranslation('dashboard')
  const tokenTrend = useAppStore(s => s.dashboardTokenTrend)
  const timeRange = useAppStore(s => s.dashboardTimeRange)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const data = useMemo(() => {
    if (timeRange === 'today') return tokenTrend
    if (timeRange === '7d') return tokenTrend.slice(-7)
    if (timeRange === '30d') return tokenTrend.slice(-30)
    return tokenTrend
  }, [tokenTrend, timeRange])

  const maxTotal = useMemo(() => {
    if (data.length === 0) return 1
    return Math.max(...data.map(d => d.inputTokens + d.outputTokens), 1)
  }, [data])

  if (data.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="font-pixel text-[9px] text-text-dim">{t('chart.noData')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-6 w-12 flex flex-col justify-between text-[9px] text-text-dim font-mono">
          <span>{formatTokens(maxTotal)}</span>
          <span>{formatTokens(Math.floor(maxTotal / 2))}</span>
          <span>0</span>
        </div>

        {/* Bars */}
        <div className="ml-14 flex items-end gap-[2px] h-40">
          {data.map((d, i) => {
            const total = d.inputTokens + d.outputTokens
            const heightPct = (total / maxTotal) * 100
            const inputPct = total > 0 ? (d.inputTokens / total) * 100 : 50
            const outputPct = 100 - inputPct
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
                    <div className="text-[8px] font-mono text-accent-blue">{t('chart.tooltipIn', { tokens: formatTokens(d.inputTokens) })}</div>
                    <div className="text-[8px] font-mono text-accent-emerald">{t('chart.tooltipOut', { tokens: formatTokens(d.outputTokens) })}</div>
                  </div>
                )}
                <div className="w-full transition-all duration-150" style={{ height: `${heightPct}%` }}>
                  <div className="w-full bg-accent-blue/70 hover:bg-accent-blue" style={{ height: `${inputPct}%` }} />
                  <div className="w-full bg-accent-emerald/70 hover:bg-accent-emerald" style={{ height: `${outputPct}%` }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* X-axis date labels */}
        <div className="ml-14 flex gap-[2px] mt-1">
          {data.map((d, i) => {
            const interval = Math.max(1, Math.ceil(data.length / 10))
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

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-accent-blue/70" />
          <span className="text-[9px] text-text-dim font-mono">{t('chart.legendInput')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-accent-emerald/70" />
          <span className="text-[9px] text-text-dim font-mono">{t('chart.legendOutput')}</span>
        </div>
      </div>
    </div>
  )
}

// --- Main Dashboard Page ---
export function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const { projectId } = useParams()
  const navigate = useNavigate()
  const project = useCurrentProject()
  const loadDashboard = useAppStore(s => s.loadDashboard)
  const setTimeRange = useAppStore(s => s.setDashboardTimeRange)
  const loadRuntimeStatus = useAppStore(s => s.loadRuntimeStatus)
  const dashboardLoading = useAppStore(s => s.dashboardLoading)
  const summary = useAppStore(s => s.dashboardSummary)
  const tokenByModel = useAppStore(s => s.dashboardTokenByModel)
  const tokenByAgent = useAppStore(s => s.dashboardTokenByAgent)
  const runtimeStatus = useAppStore(s => s.dashboardRuntimeStatus)
  const agentStats = useAppStore(s => s.dashboardAgentStats)
  const recentChats = useAppStore(s => s.dashboardRecentChats)
  const timeRange = useAppStore(s => s.dashboardTimeRange)
  const { addListener } = useWs()

  const [tokenTab, setTokenTab] = useState('trend')

  const handleOpenChat = useCallback((convId: ConversationId) => {
    navigate(`chat?conv=${convId}`)
  }, [navigate])

  const handleOpenAutomation = useCallback((_cronJobId: CronJobId) => {
    navigate('cron')
  }, [navigate])

  // Load on mount
  useEffect(() => {
    if (projectId) {
      loadDashboard(projectId as ProjectId)
    }
  }, [projectId, loadDashboard])

  // Listen for WS runtime events → refresh runtime status
  useEffect(() => {
    if (!projectId) return
    const events = ['runtime:chat_started', 'runtime:chat_ended', 'runtime:cron_started', 'runtime:cron_ended']
    const cleanups = events.map(evt =>
      addListener(evt, () => loadRuntimeStatus(projectId as ProjectId))
    )
    return () => cleanups.forEach(fn => fn())
  }, [projectId, addListener, loadRuntimeStatus])

  // Listen for token:recorded → debounced reload
  useEffect(() => {
    if (!projectId) return
    let timer: ReturnType<typeof setTimeout>
    const cleanup = addListener('token:recorded', () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        loadDashboard(projectId as ProjectId)
      }, 2000)
    })
    return () => {
      clearTimeout(timer)
      cleanup()
    }
  }, [projectId, addListener, loadDashboard])

  // Breakdown data mapped for the table
  const breakdownByAgent = useMemo(() =>
    tokenByAgent.map(a => ({
      label: a.agentName,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      callCount: a.callCount,
    })),
    [tokenByAgent],
  )

  const breakdownByModel = useMemo(() =>
    tokenByModel.map(m => ({
      label: m.model,
      sublabel: m.provider,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      callCount: m.callCount,
    })),
    [tokenByModel],
  )

  if (dashboardLoading && !summary) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner label={t('page.loading')} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[1400px] mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-pixel text-[14px] text-text-primary">{project?.name ?? t('page.titleFallback')}</h1>
          <p className="mt-1 text-text-secondary text-[13px]">{project?.description ?? t('page.descriptionFallback')}</p>
        </div>

        {/* Section 1: Token Usage — TimeRange + Summary */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-pixel text-[11px] text-text-secondary">{t('tokenUsage.title')}</h2>
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>
          <TokenSummaryCards summary={summary} />
        </div>

        {/* Section 2: Unified Token Details — Trend / By Agent / By Model */}
        <div className="mb-6">
          <PixelCard variant="default">
            <div className="mb-4">
              <PixelTabs
                tabs={[
                  { id: 'trend', label: t('tabs.trend') },
                  { id: 'by-agent', label: t('tabs.byAgent') },
                  { id: 'by-model', label: t('tabs.byModel') },
                ]}
                activeTab={tokenTab}
                onTabChange={setTokenTab}
              />
            </div>
            {tokenTab === 'trend' && <TokenTrendChart />}
            {tokenTab === 'by-agent' && <TokenBreakdownTable title={t('table.titleByAgent')} data={breakdownByAgent} inline />}
            {tokenTab === 'by-model' && <TokenBreakdownTable title={t('table.titleByModel')} data={breakdownByModel} inline />}
          </PixelCard>
        </div>

        {/* Section 3: Runtime Status */}
        <div className="mb-6">
          <RuntimeStatusPanel status={runtimeStatus} onOpenChat={handleOpenChat} onOpenCron={handleOpenAutomation} />
        </div>

        {/* Section 4: Overview */}
        <OverviewPanel agentStats={agentStats} recentChats={recentChats} />
      </div>
    </div>
  )
}
