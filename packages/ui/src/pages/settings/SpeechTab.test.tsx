import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { SpeechTab } from './SpeechTab'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { GlobalSettings } from '@golemancy/shared'

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, variants, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

const mockSettings: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
  },
  theme: 'dark',
  speechToText: {
    enabled: true,
    providerType: 'openai',
    model: 'gpt-4o-mini-transcribe',
    apiKey: 'sk-stt',
  },
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), clone: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    settings: {
      get: vi.fn().mockResolvedValue(mockSettings),
      update: vi.fn().mockImplementation((data) => Promise.resolve({ ...mockSettings, ...data })),
      testProvider: vi.fn().mockResolvedValue({ ok: true, latencyMs: 150 }),
    },
    cronJobs: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    skills: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), importZip: vi.fn() },
    mcp: { list: vi.fn(), getByName: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resolveNames: vi.fn() },
    dashboard: { getSummary: vi.fn(), getAgentStats: vi.fn(), getRecentChats: vi.fn(), getTokenTrend: vi.fn(), getTokenByModel: vi.fn(), getTokenByAgent: vi.fn(), getRuntimeStatus: vi.fn() },
    globalDashboard: {
      getSummary: vi.fn().mockResolvedValue({ todayTokens: { total: 0, input: 0, output: 0, callCount: 0 }, totalAgents: 0, activeChats: 0, totalChats: 0 }),
      getTokenByModel: vi.fn().mockResolvedValue([]),
      getTokenByAgent: vi.fn().mockResolvedValue([]),
      getTokenByProject: vi.fn().mockResolvedValue([]),
      getTokenTrend: vi.fn().mockResolvedValue([]),
      getRuntimeStatus: vi.fn().mockResolvedValue({ runningChats: [], runningCrons: [], upcoming: [], recentCompleted: [] }),
    },
    permissionsConfig: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
    },
    speech: {
      testProvider: vi.fn().mockResolvedValue({ ok: true }),
      getAudioUrl: vi.fn().mockReturnValue(''),
      getStorageUsage: vi.fn().mockResolvedValue({ totalBytes: 0, recordCount: 0 }),
    } as any,
    memories: {} as any,
    teams: {} as any,
  }
}

function renderSpeechTab() {
  return render(
    <MemoryRouter>
      <SpeechTab />
    </MemoryRouter>,
  )
}

describe('SpeechTab', () => {
  beforeEach(() => {
    configureServices(createTestServices())
    useAppStore.setState({
      settings: mockSettings,
      speechHistory: [],
      speechHistoryLoading: false,
      speechStorageUsage: null,
      loadSpeechHistory: vi.fn(),
      loadSpeechStorageUsage: vi.fn(),
      updateSettings: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('does not render a Save button (auto-save on blur/change)', () => {
    renderSpeechTab()
    const buttons = screen.queryAllByRole('button')
    const saveButtons = buttons.filter(b => b.textContent === 'Save' || b.textContent === 'Saving...')
    expect(saveButtons).toHaveLength(0)
  })

  it('does not have a speech-save-btn test id', () => {
    renderSpeechTab()
    expect(screen.queryByTestId('speech-save-btn')).not.toBeInTheDocument()
  })

  it('still renders the Test button', () => {
    renderSpeechTab()
    expect(screen.getByTestId('speech-test-btn')).toBeInTheDocument()
  })
})
