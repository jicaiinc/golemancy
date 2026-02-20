import type {
  Project, Agent, Conversation, Message, ConversationTask, MemoryEntry, GlobalSettings,
  CronJob, Skill, MCPServerConfig, PermissionsConfigFile,
  DashboardSummary, DashboardAgentStats, DashboardRecentChat, DashboardTokenTrend,
  DashboardTokenByModel, DashboardTokenByAgent, RuntimeStatus,
  ProjectId, AgentId, ConversationId, MessageId, TaskId, MemoryId, SkillId, ToolId,
  CronJobId, PermissionsConfigId,
} from '@golemancy/shared'
import { DEFAULT_AGENT_SYSTEM_PROMPT, DEFAULT_PERMISSIONS_CONFIG } from '@golemancy/shared'

const now = new Date().toISOString()
const hourAgo = new Date(Date.now() - 3600_000).toISOString()
const dayAgo = new Date(Date.now() - 86400_000).toISOString()

// --- Projects ---
export const SEED_PROJECTS: Project[] = [
  {
    id: 'proj-1' as ProjectId,
    name: 'Content Biz',
    description: 'Content creation and distribution pipeline',
    icon: 'pickaxe',
    config: { maxConcurrentAgents: 3 },
    mainAgentId: 'agent-1' as AgentId,
    agentCount: 3,
    activeAgentCount: 1,
    lastActivityAt: hourAgo,
    createdAt: dayAgo,
    updatedAt: hourAgo,
  },
  {
    id: 'proj-2' as ProjectId,
    name: 'E-Commerce Ops',
    description: 'Cross-border e-commerce automation',
    icon: 'sword',
    config: { maxConcurrentAgents: 5 },
    agentCount: 5,
    activeAgentCount: 0,
    lastActivityAt: dayAgo,
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
]

// --- Agents ---
export const SEED_AGENTS: Agent[] = [
  {
    id: 'agent-1' as AgentId,
    projectId: 'proj-1' as ProjectId,
    name: 'Writer',
    description: 'Content creation and blog writing assistant',
    status: 'running',
    systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
    modelConfig: { provider: 'openai', model: 'gpt-4o' },
    skillIds: ['skill-1' as SkillId, 'skill-2' as SkillId],
    tools: [
      { id: 'tool-1' as ToolId, name: 'web_search', description: 'Search the web', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
    ],
    subAgents: [],
    mcpServers: ['filesystem'],
    builtinTools: { bash: true },
    createdAt: dayAgo,
    updatedAt: hourAgo,
  },
  {
    id: 'agent-2' as AgentId,
    projectId: 'proj-1' as ProjectId,
    name: 'Researcher',
    description: 'Information gathering and analysis',
    status: 'idle',
    systemPrompt: 'You are a research assistant...',
    modelConfig: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
    skillIds: ['skill-3' as SkillId, 'skill-4' as SkillId],
    tools: [
      { id: 'tool-1' as ToolId, name: 'web_search', description: 'Search the web', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
      { id: 'tool-2' as ToolId, name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
    ],
    subAgents: [],
    mcpServers: [],
    builtinTools: { bash: true },
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'agent-3' as AgentId,
    projectId: 'proj-1' as ProjectId,
    name: 'Team Lead',
    description: 'Orchestrates Writer and Researcher',
    status: 'idle',
    systemPrompt: 'You are a team lead coordinating agents...',
    modelConfig: { provider: 'openai', model: 'gpt-4o' },
    skillIds: [],
    tools: [],
    subAgents: [
      { agentId: 'agent-1' as AgentId, role: 'Content Creation' },
      { agentId: 'agent-2' as AgentId, role: 'Information Gathering' },
    ],
    mcpServers: [],
    builtinTools: { bash: true },
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  // Project 2 agents
  {
    id: 'agent-4' as AgentId,
    projectId: 'proj-2' as ProjectId,
    name: 'Product Scout',
    description: 'Scans marketplaces for trending products',
    status: 'idle',
    systemPrompt: 'You scout for trending products...',
    modelConfig: { provider: 'openai', model: 'gpt-4o' },
    skillIds: ['skill-5' as SkillId],
    tools: [{ id: 'tool-1' as ToolId, name: 'web_search', description: 'Search the web', inputSchema: {} }],
    subAgents: [],
    mcpServers: [],
    builtinTools: { bash: true },
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'agent-5' as AgentId,
    projectId: 'proj-2' as ProjectId,
    name: 'Listing Writer',
    description: 'Creates product listings and descriptions',
    status: 'idle',
    systemPrompt: 'You create compelling product listings...',
    modelConfig: { provider: 'openai', model: 'gpt-4o' },
    skillIds: ['skill-6' as SkillId],
    tools: [],
    subAgents: [],
    mcpServers: [],
    builtinTools: { bash: true },
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
]

// --- Conversations ---
export const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1' as ConversationId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    title: 'Blog Draft: AI Trends',
    messages: [
      {
        id: 'msg-1' as MessageId,
        conversationId: 'conv-1' as ConversationId,
        role: 'user',
        parts: [{ type: 'text', text: 'Write a blog post about AI trends in 2025.' }],
        content: 'Write a blog post about AI trends in 2025.',
        inputTokens: 0,
        outputTokens: 0,
        provider: '',
        model: '',
        createdAt: hourAgo,
        updatedAt: hourAgo,
      },
      {
        id: 'msg-2' as MessageId,
        conversationId: 'conv-1' as ConversationId,
        role: 'assistant',
        parts: [{ type: 'text', text: 'I\'ll research and write that for you. Let me start by searching for the latest trends...' }],
        content: 'I\'ll research and write that for you. Let me start by searching for the latest trends...',
        inputTokens: 1250,
        outputTokens: 480,
        provider: '',
        model: '',
        createdAt: hourAgo,
        updatedAt: hourAgo,
      },
    ],
    lastMessageAt: hourAgo,
    createdAt: hourAgo,
    updatedAt: hourAgo,
  },
]

// --- Tasks ---
export const SEED_CONVERSATION_TASKS: ConversationTask[] = [
  {
    id: 'task-1' as TaskId,
    conversationId: 'conv-1' as ConversationId,
    subject: 'Draft blog post',
    description: 'Write a blog post about AI trends',
    status: 'in_progress',
    activeForm: 'Drafting blog post',
    blocks: [],
    blockedBy: [],
    createdAt: hourAgo,
    updatedAt: now,
  },
  {
    id: 'task-2' as TaskId,
    conversationId: 'conv-1' as ConversationId,
    subject: 'Competitor analysis',
    description: 'Scan competitor websites',
    status: 'completed',
    blocks: [],
    blockedBy: [],
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'task-3' as TaskId,
    conversationId: 'conv-1' as ConversationId,
    subject: 'Social media posts',
    description: 'Create social posts for blog promotion',
    status: 'pending',
    blocks: [],
    blockedBy: ['task-1' as TaskId],
    createdAt: now,
    updatedAt: now,
  },
]

// --- Memory ---
export const SEED_MEMORIES: MemoryEntry[] = [
  {
    id: 'mem-1' as MemoryId,
    projectId: 'proj-1' as ProjectId,
    content: 'Target audience prefers long-form content (2000+ words)',
    source: 'Researcher',
    tags: ['content-strategy', 'audience'],
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'mem-2' as MemoryId,
    projectId: 'proj-1' as ProjectId,
    content: 'Best posting times: Tuesday 9am, Thursday 2pm EST',
    source: 'Writer',
    tags: ['content-strategy', 'scheduling'],
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'mem-3' as MemoryId,
    projectId: 'proj-1' as ProjectId,
    content: 'Competitor A uses Tailwind + Next.js for their blog. Competitor B uses WordPress with custom theme.',
    source: 'Researcher',
    tags: ['competitors', 'tech-stack'],
    createdAt: hourAgo,
    updatedAt: hourAgo,
  },
  {
    id: 'mem-4' as MemoryId,
    projectId: 'proj-1' as ProjectId,
    content: 'Primary keyword targets: "AI automation", "solopreneur tools", "one-person business"',
    source: 'Researcher',
    tags: ['seo', 'keywords'],
    createdAt: hourAgo,
    updatedAt: hourAgo,
  },
]

// --- Global Settings ---
export const SEED_SETTINGS: GlobalSettings = {
  providers: {
    anthropic: { name: 'Anthropic', sdkType: 'anthropic', apiKey: 'sk-ant-mock-key', models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-6'], testStatus: 'ok' },
    openai: { name: 'OpenAI', sdkType: 'openai', apiKey: 'sk-mock-key', models: ['gpt-4o', 'gpt-4o-mini'], testStatus: 'ok' },
  },
  defaultModel: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  theme: 'dark',
}

// --- Dashboard Seed Data ---
export const SEED_DASHBOARD_SUMMARY: DashboardSummary = {
  todayTokens: { total: 48_520, input: 32_180, output: 16_340, callCount: 42 },
  totalAgents: 5,
  activeChats: 2,
  totalChats: 8,
}

export const SEED_DASHBOARD_AGENT_STATS: DashboardAgentStats[] = [
  {
    agentId: 'agent-1' as AgentId,
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentName: 'Writer',
    model: 'gpt-4o',
    status: 'running',
    totalTokens: 125_430,
    conversationCount: 4,
    taskCount: 6,
    completedTasks: 4,
    failedTasks: 0,
    lastActiveAt: hourAgo,
  },
  {
    agentId: 'agent-2' as AgentId,
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentName: 'Researcher',
    model: 'claude-sonnet-4-5-20250929',
    status: 'idle',
    totalTokens: 89_200,
    conversationCount: 3,
    taskCount: 5,
    completedTasks: 5,
    failedTasks: 0,
    lastActiveAt: dayAgo,
  },
  {
    agentId: 'agent-3' as AgentId,
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentName: 'Team Lead',
    model: 'gpt-4o',
    status: 'idle',
    totalTokens: 45_600,
    conversationCount: 2,
    taskCount: 3,
    completedTasks: 2,
    failedTasks: 1,
    lastActiveAt: dayAgo,
  },
  {
    agentId: 'agent-4' as AgentId,
    projectId: 'proj-2' as ProjectId,
    projectName: 'E-Commerce Ops',
    agentName: 'Product Scout',
    model: 'gpt-4o',
    status: 'idle',
    totalTokens: 32_100,
    conversationCount: 2,
    taskCount: 4,
    completedTasks: 3,
    failedTasks: 0,
    lastActiveAt: dayAgo,
  },
  {
    agentId: 'agent-5' as AgentId,
    projectId: 'proj-2' as ProjectId,
    projectName: 'E-Commerce Ops',
    agentName: 'Listing Writer',
    model: 'gpt-4o',
    status: 'idle',
    totalTokens: 18_750,
    conversationCount: 1,
    taskCount: 2,
    completedTasks: 2,
    failedTasks: 0,
    lastActiveAt: dayAgo,
  },
]

export const SEED_DASHBOARD_RECENT_CHATS: DashboardRecentChat[] = [
  {
    conversationId: 'conv-1' as ConversationId,
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentId: 'agent-1' as AgentId,
    agentName: 'Writer',
    title: 'Blog Draft: AI Trends',
    messageCount: 12,
    totalTokens: 24_500,
    lastMessageAt: hourAgo,
  },
  {
    conversationId: 'conv-2' as ConversationId,
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentId: 'agent-2' as AgentId,
    agentName: 'Researcher',
    title: 'Keyword Research Q1',
    messageCount: 8,
    totalTokens: 18_200,
    lastMessageAt: dayAgo,
  },
  {
    conversationId: 'conv-3' as ConversationId,
    projectId: 'proj-2' as ProjectId,
    projectName: 'E-Commerce Ops',
    agentId: 'agent-4' as AgentId,
    agentName: 'Product Scout',
    title: 'Trending Products Feb 2026',
    messageCount: 6,
    totalTokens: 12_800,
    lastMessageAt: dayAgo,
  },
]

// Generate 14 days of token trend data
function generateTokenTrend(days: number): DashboardTokenTrend[] {
  const result: DashboardTokenTrend[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const date = d.toISOString().split('T')[0]
    // Vary tokens to make the chart interesting
    const base = 20_000 + Math.floor(Math.random() * 30_000)
    const inputRatio = 0.55 + Math.random() * 0.15
    result.push({
      date,
      inputTokens: Math.floor(base * inputRatio),
      outputTokens: Math.floor(base * (1 - inputRatio)),
    })
  }
  return result
}

export const SEED_DASHBOARD_TOKEN_TREND: DashboardTokenTrend[] = generateTokenTrend(30)

// --- Dashboard: Token By Model ---
export const SEED_DASHBOARD_TOKEN_BY_MODEL: DashboardTokenByModel[] = [
  { provider: 'openai', model: 'gpt-4o', inputTokens: 85_200, outputTokens: 42_600, callCount: 28 },
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', inputTokens: 52_400, outputTokens: 26_100, callCount: 14 },
]

// --- Dashboard: Token By Agent ---
export const SEED_DASHBOARD_TOKEN_BY_AGENT: DashboardTokenByAgent[] = [
  { agentId: 'agent-1' as AgentId, agentName: 'Writer', inputTokens: 62_300, outputTokens: 31_150, callCount: 18 },
  { agentId: 'agent-2' as AgentId, agentName: 'Researcher', inputTokens: 45_100, outputTokens: 22_550, callCount: 12 },
  { agentId: 'agent-3' as AgentId, agentName: 'Team Lead', inputTokens: 30_200, outputTokens: 15_000, callCount: 12 },
]

// --- Dashboard: Runtime Status ---
export const SEED_DASHBOARD_RUNTIME_STATUS: RuntimeStatus = {
  runningChats: [
    { conversationId: 'conv-1' as ConversationId, projectId: 'proj-1' as ProjectId, agentId: 'agent-1' as AgentId, agentName: 'Writer', title: 'Blog Draft: AI Trends', startedAt: new Date(Date.now() - 120_000).toISOString() },
  ],
  runningCrons: [],
  upcoming: [
    { cronJobId: 'cron-1' as CronJobId, projectId: 'proj-1' as ProjectId, cronJobName: 'Daily Summary', agentId: 'agent-1' as AgentId, agentName: 'Writer', nextRunAt: new Date(Date.now() + 3600_000).toISOString() },
    { cronJobId: 'cron-2' as CronJobId, projectId: 'proj-1' as ProjectId, cronJobName: 'Weekly Competitor Scan', agentId: 'agent-2' as AgentId, agentName: 'Researcher', nextRunAt: new Date(Date.now() + 86400_000).toISOString() },
  ],
  recentCompleted: [
    { type: 'chat', id: 'conv-2', projectId: 'proj-1' as ProjectId, agentName: 'Researcher', title: 'Market Analysis', completedAt: new Date(Date.now() - 7200_000).toISOString(), status: 'success', durationMs: 45_000, totalTokens: 18_200 },
    { type: 'cron', id: 'cronrun-1', projectId: 'proj-1' as ProjectId, agentName: 'Writer', title: 'Daily Summary', completedAt: new Date(Date.now() - 14400_000).toISOString(), status: 'success', durationMs: 12_000, totalTokens: 8_500, cronJobId: 'cron-1' as CronJobId },
  ],
}

// --- Cron Jobs ---
export const SEED_CRON_JOBS: CronJob[] = [
  {
    id: 'cron-1' as CronJobId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    name: 'Daily Summary',
    cronExpression: '0 9 * * *',
    enabled: true,
    scheduleType: 'cron',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'cron-2' as CronJobId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-2' as AgentId,
    name: 'Weekly Competitor Scan',
    cronExpression: '0 8 * * 1',
    enabled: true,
    scheduleType: 'cron',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'cron-3' as CronJobId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    name: 'Social Media Posting',
    cronExpression: '0 14 * * 2,4',
    enabled: false,
    scheduleType: 'cron',
    createdAt: dayAgo,
    updatedAt: hourAgo,
  },
]

// --- Skills ---
export const SEED_SKILLS: Skill[] = [
  {
    id: 'skill-1' as SkillId,
    projectId: 'proj-1' as ProjectId,
    name: 'Blog Writing',
    description: 'Write SEO-optimized blog posts',
    instructions: '# Blog Writing\n\nWrite engaging, SEO-optimized blog posts.\n\n## Guidelines\n- Use clear headings and subheadings\n- Include relevant keywords naturally\n- Keep paragraphs short and scannable',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'skill-2' as SkillId,
    projectId: 'proj-1' as ProjectId,
    name: 'Social Media',
    description: 'Create posts for Twitter, LinkedIn',
    instructions: '# Social Media\n\nCreate engaging social media posts.\n\n## Platforms\n- Twitter: concise, hashtags, max 280 chars\n- LinkedIn: professional tone, longer format',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'skill-3' as SkillId,
    projectId: 'proj-1' as ProjectId,
    name: 'Research',
    description: 'Deep research on topics',
    instructions: '# Research\n\nConduct thorough research on given topics.\n\n## Process\n- Search multiple sources\n- Cross-reference findings\n- Summarize key insights',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'skill-4' as SkillId,
    projectId: 'proj-1' as ProjectId,
    name: 'Data Analysis',
    description: 'Analyze data and generate reports',
    instructions: '# Data Analysis\n\nAnalyze data sets and generate actionable reports.\n\n## Approach\n- Identify trends and patterns\n- Create visualizations\n- Provide recommendations',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'skill-5' as SkillId,
    projectId: 'proj-2' as ProjectId,
    name: 'Product Research',
    description: 'Find trending products',
    instructions: '# Product Research\n\nScan marketplaces for trending products.\n\n## Sources\n- Amazon bestsellers\n- AliExpress trending\n- Social media product mentions',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'skill-6' as SkillId,
    projectId: 'proj-2' as ProjectId,
    name: 'Copywriting',
    description: 'Write product descriptions',
    instructions: '# Copywriting\n\nWrite compelling product descriptions and copy.\n\n## Guidelines\n- Highlight key benefits\n- Use persuasive language\n- Include bullet points for features',
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
]

// --- Permissions Configs ---
export const SEED_PERMISSIONS_CONFIGS: PermissionsConfigFile[] = [
  DEFAULT_PERMISSIONS_CONFIG,
  {
    id: 'perm-strict-dev' as PermissionsConfigId,
    title: 'Strict Dev',
    mode: 'sandbox',
    config: {
      allowWrite: ['{{workspaceDir}}'],
      denyRead: ['~/.ssh', '~/.aws', '**/.env', '**/.env.*', '**/*.pem', '**/*.key'],
      denyWrite: ['/etc', '/usr', '/bin'],
      networkRestrictionsEnabled: true,
      allowedDomains: ['*.github.com', 'registry.npmjs.org'],
      deniedDomains: [],
      deniedCommands: ['sudo *', 'rm -rf /'],
      applyToMCP: false,
    },
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
]

// --- MCP Servers ---
export const SEED_MCP_SERVERS: MCPServerConfig[] = [
  {
    name: 'filesystem',
    transportType: 'stdio',
    description: 'Local filesystem access via MCP',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    enabled: true,
  },
  {
    name: 'github',
    transportType: 'stdio',
    description: 'GitHub API integration',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: 'ghp_***' },
    enabled: true,
  },
  {
    name: 'web-search',
    transportType: 'sse',
    description: 'Web search via SSE endpoint',
    url: 'http://localhost:3100/sse',
    enabled: false,
  },
]
