import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { KnowledgeBasePage } from './KnowledgeBasePage'
import { useAppStore } from '../../stores'
import { configureServices } from '../../services/container'
import type { ServiceContainer } from '../../services/container'
import type { ProjectId, GlobalSettings, Project, KBCollection, KBCollectionId } from '@golemancy/shared'

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, variants, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

const PROJECT_ID = 'proj-kb1' as ProjectId
const now = new Date().toISOString()

const testProject: Project = {
  id: PROJECT_ID,
  name: 'KB Test Project',
  description: 'Test project for KB page',
  icon: 'book',
  config: { maxConcurrentAgents: 3 },
  agentCount: 1,
  activeAgentCount: 0,
  lastActivityAt: now,
  createdAt: now,
  updatedAt: now,
}

const settingsWithEmbedding: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
  },
  theme: 'dark',
  embedding: { providerType: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-embed', testStatus: 'ok' },
}

const settingsNoEmbedding: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
  },
  theme: 'dark',
}

const settingsTestFailed: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-test', models: ['gpt-4o'], testStatus: 'ok' },
  },
  theme: 'dark',
  embedding: { providerType: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-embed', testStatus: 'untested' },
}

const sampleCollection: KBCollection = {
  id: 'kbc-test-1' as KBCollectionId,
  name: 'Test Collection',
  description: 'A test collection',
  tier: 'warm',
  documentCount: 3,
  totalChars: 5000,
  createdAt: now,
  updatedAt: now,
}

function createTestServices(): ServiceContainer {
  return {
    projects: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getTopologyLayout: vi.fn().mockResolvedValue({}), saveTopologyLayout: vi.fn() },
    agents: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    conversations: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), sendMessage: vi.fn(), saveMessage: vi.fn(), getMessages: vi.fn(), searchMessages: vi.fn(), delete: vi.fn() },
    tasks: { list: vi.fn(), getById: vi.fn() },
    workspace: { listDir: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn() },
    knowledgeBase: { listCollections: vi.fn(), createCollection: vi.fn(), updateCollection: vi.fn(), deleteCollection: vi.fn(), listDocuments: vi.fn(), ingestDocument: vi.fn(), uploadDocument: vi.fn(), getDocument: vi.fn(), deleteDocument: vi.fn(), search: vi.fn(), hasVectorData: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn(), testProvider: vi.fn(), testEmbedding: vi.fn() },
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
    speech: {} as any,
  }
}

function renderAtRoute() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/knowledge-base`]}>
      <Routes>
        <Route path="/projects/:projectId/knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="/settings" element={<div>Settings Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('KnowledgeBasePage', () => {
  beforeEach(() => {
    configureServices(createTestServices())
    useAppStore.setState({
      settings: settingsNoEmbedding,
      projects: [testProject],
      currentProjectId: PROJECT_ID,
      kbCollections: [],
      kbCollectionsLoading: false,
    })
  })

  it('renders page title', () => {
    renderAtRoute()
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument()
  })

  describe('embedding prompt', () => {
    it('shows embedding prompt when embedding not configured', () => {
      renderAtRoute()
      expect(screen.getByText(/Embedding must be configured/)).toBeInTheDocument()
      expect(screen.getByText('Configure Embedding')).toBeInTheDocument()
    })

    it('shows embedding prompt when testPassed is false', () => {
      useAppStore.setState({ settings: settingsTestFailed })
      renderAtRoute()
      expect(screen.getByText(/Embedding must be configured/)).toBeInTheDocument()
    })

    it('hides embedding prompt when embedding is configured with testPassed', () => {
      useAppStore.setState({ settings: settingsWithEmbedding })
      renderAtRoute()
      expect(screen.queryByText(/Embedding must be configured/)).not.toBeInTheDocument()
    })

    it('shows embedding prompt even when collections exist', () => {
      useAppStore.setState({
        settings: settingsTestFailed,
        kbCollections: [sampleCollection],
      })
      renderAtRoute()
      expect(screen.getByText(/Embedding must be configured/)).toBeInTheDocument()
    })

    it('hides embedding prompt when project has custom embedding', () => {
      const projectWithEmbedding: Project = {
        ...testProject,
        config: { ...testProject.config, embedding: { mode: 'custom', custom: { providerType: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-project-key', testStatus: 'ok' } } },
      }
      useAppStore.setState({
        settings: settingsWithEmbedding,
        projects: [projectWithEmbedding],
      })
      renderAtRoute()
      expect(screen.queryByText(/Embedding must be configured/)).not.toBeInTheDocument()
    })
  })
})
