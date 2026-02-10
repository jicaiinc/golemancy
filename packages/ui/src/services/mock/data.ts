import type {
  Project, Agent, Conversation, Message, Task, Artifact, MemoryEntry, GlobalSettings,
  ActivityEntry,
  ProjectId, AgentId, ConversationId, MessageId, TaskId, ArtifactId, MemoryId, SkillId, ToolId,
} from '@solocraft/shared'

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
    workingDirectory: '~/projects/content-biz',
    config: { maxConcurrentAgents: 3 },
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
    workingDirectory: '~/projects/ecommerce-ops',
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
    systemPrompt: 'You are a professional content writer...',
    modelConfig: { provider: 'openai', model: 'gpt-4o', temperature: 0.7 },
    skills: [
      { id: 'skill-1' as SkillId, name: 'Blog Writing', description: 'Write SEO-optimized blog posts' },
      { id: 'skill-2' as SkillId, name: 'Social Media', description: 'Create posts for Twitter, LinkedIn' },
    ],
    tools: [
      { id: 'tool-1' as ToolId, name: 'web_search', description: 'Search the web', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
    ],
    subAgents: [],
    currentTaskId: 'task-1' as TaskId,
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
    skills: [
      { id: 'skill-3' as SkillId, name: 'Research', description: 'Deep research on topics' },
      { id: 'skill-4' as SkillId, name: 'Data Analysis', description: 'Analyze data and generate reports' },
    ],
    tools: [
      { id: 'tool-1' as ToolId, name: 'web_search', description: 'Search the web', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
      { id: 'tool-2' as ToolId, name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
    ],
    subAgents: [],
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
    skills: [],
    tools: [],
    subAgents: [
      { agentId: 'agent-1' as AgentId, role: 'Content Creation' },
      { agentId: 'agent-2' as AgentId, role: 'Information Gathering' },
    ],
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
    skills: [{ id: 'skill-5' as SkillId, name: 'Product Research', description: 'Find trending products' }],
    tools: [{ id: 'tool-1' as ToolId, name: 'web_search', description: 'Search the web', inputSchema: {} }],
    subAgents: [],
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
    skills: [{ id: 'skill-6' as SkillId, name: 'Copywriting', description: 'Write product descriptions' }],
    tools: [],
    subAgents: [],
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
        content: 'Write a blog post about AI trends in 2025.',
        createdAt: hourAgo,
        updatedAt: hourAgo,
      },
      {
        id: 'msg-2' as MessageId,
        conversationId: 'conv-1' as ConversationId,
        role: 'assistant',
        content: 'I\'ll research and write that for you. Let me start by searching for the latest trends...',
        toolCalls: [
          { toolId: 'tool-1' as ToolId, toolName: 'web_search', input: { query: 'AI trends 2025' }, output: '12 results found', duration: 1200 },
        ],
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
export const SEED_TASKS: Task[] = [
  {
    id: 'task-1' as TaskId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    title: 'Draft blog post',
    description: 'Write a blog post about AI trends',
    status: 'running',
    progress: 60,
    tokenUsage: 2134,
    log: [
      { timestamp: hourAgo, type: 'start', content: 'Task initiated' },
      { timestamp: hourAgo, type: 'tool_call', content: 'web_search("AI trends 2025")' },
      { timestamp: hourAgo, type: 'generation', content: 'Generating draft...' },
    ],
    startedAt: hourAgo,
    createdAt: hourAgo,
    updatedAt: now,
  },
  {
    id: 'task-2' as TaskId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-2' as AgentId,
    title: 'Competitor analysis',
    description: 'Scan competitor websites',
    status: 'completed',
    progress: 100,
    tokenUsage: 890,
    log: [
      { timestamp: dayAgo, type: 'start', content: 'Task initiated' },
      { timestamp: dayAgo, type: 'completed', content: 'Analysis complete' },
    ],
    startedAt: dayAgo,
    completedAt: dayAgo,
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'task-3' as TaskId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    title: 'Social media posts',
    description: 'Create social posts for blog promotion',
    status: 'pending',
    progress: 0,
    tokenUsage: 0,
    log: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'task-4' as TaskId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-2' as AgentId,
    title: 'SEO keyword research',
    description: 'Find top keywords for content strategy',
    status: 'failed',
    progress: 35,
    tokenUsage: 450,
    log: [
      { timestamp: dayAgo, type: 'start', content: 'Task initiated' },
      { timestamp: dayAgo, type: 'tool_call', content: 'web_search("SEO keywords 2025")' },
      { timestamp: dayAgo, type: 'error', content: 'Rate limit exceeded, aborting' },
    ],
    startedAt: dayAgo,
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
]

// --- Artifacts ---
export const SEED_ARTIFACTS: Artifact[] = [
  {
    id: 'artifact-1' as ArtifactId,
    projectId: 'proj-1' as ProjectId,
    taskId: 'task-2' as TaskId,
    agentId: 'agent-2' as AgentId,
    title: 'Competitor Analysis Report',
    type: 'text',
    content: '# Competitor Analysis\n\n## Key Findings\n\n- Competitor A focuses on short-form content\n- Competitor B has strong SEO presence\n- Gap opportunity in long-form technical guides',
    size: 2048,
    createdAt: dayAgo,
    updatedAt: dayAgo,
  },
  {
    id: 'artifact-2' as ArtifactId,
    projectId: 'proj-1' as ProjectId,
    taskId: 'task-1' as TaskId,
    agentId: 'agent-1' as AgentId,
    title: 'blog_draft.py',
    type: 'code',
    content: 'import openai\n\ndef generate_blog_post(topic: str) -> str:\n    """Generate a blog post using AI."""\n    client = openai.Client()\n    response = client.chat.completions.create(\n        model="gpt-4o",\n        messages=[{"role": "user", "content": f"Write about {topic}"}]\n    )\n    return response.choices[0].message.content',
    mimeType: 'text/x-python',
    size: 512,
    createdAt: hourAgo,
    updatedAt: hourAgo,
  },
  {
    id: 'artifact-3' as ArtifactId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-1' as AgentId,
    title: 'hero-banner.png',
    type: 'image',
    content: '',
    mimeType: 'image/png',
    size: 245760,
    createdAt: hourAgo,
    updatedAt: hourAgo,
  },
  {
    id: 'artifact-4' as ArtifactId,
    projectId: 'proj-1' as ProjectId,
    agentId: 'agent-2' as AgentId,
    title: 'keywords.csv',
    type: 'data',
    content: 'keyword,volume,difficulty\nAI trends,12000,high\nmachine learning,8500,medium',
    mimeType: 'text/csv',
    filePath: '/output/keywords.csv',
    size: 4096,
    createdAt: dayAgo,
    updatedAt: dayAgo,
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
  providers: [
    { provider: 'openai', apiKey: 'sk-***', defaultModel: 'gpt-4o' },
  ],
  defaultProvider: 'openai',
  theme: 'dark',
  userProfile: {
    name: 'Solo Crafter',
    email: 'crafter@solocraft.dev',
  },
  defaultWorkingDirectoryBase: '~/projects',
}

// --- Dashboard Activity Feed ---
const twoHoursAgo = new Date(Date.now() - 7200_000).toISOString()
const threeHoursAgo = new Date(Date.now() - 10800_000).toISOString()

export const SEED_ACTIVITIES: ActivityEntry[] = [
  {
    id: 'activity-1',
    type: 'agent_started',
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentId: 'agent-1' as AgentId,
    agentName: 'Writer',
    description: 'Writer agent started working',
    timestamp: hourAgo,
  },
  {
    id: 'activity-2',
    type: 'task_created',
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentId: 'agent-1' as AgentId,
    agentName: 'Writer',
    description: 'Started: Write blog post about AI trends',
    timestamp: hourAgo,
  },
  {
    id: 'activity-3',
    type: 'task_completed',
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentId: 'agent-2' as AgentId,
    agentName: 'Researcher',
    description: 'Completed: Gather SEO keywords for Q1 campaign',
    timestamp: twoHoursAgo,
  },
  {
    id: 'activity-4',
    type: 'artifact_created',
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentId: 'agent-1' as AgentId,
    agentName: 'Writer',
    description: 'Created artifact: blog-post-draft.md',
    timestamp: twoHoursAgo,
  },
  {
    id: 'activity-5',
    type: 'agent_stopped',
    projectId: 'proj-2' as ProjectId,
    projectName: 'E-Commerce Ops',
    agentId: 'agent-4' as AgentId,
    agentName: 'Inventory Bot',
    description: 'Inventory Bot stopped after completing all tasks',
    timestamp: threeHoursAgo,
  },
  {
    id: 'activity-6',
    type: 'task_failed',
    projectId: 'proj-2' as ProjectId,
    projectName: 'E-Commerce Ops',
    agentId: 'agent-5' as AgentId,
    agentName: 'Price Tracker',
    description: 'Failed: Sync competitor prices — API rate limited',
    timestamp: dayAgo,
  },
  {
    id: 'activity-7',
    type: 'message_sent',
    projectId: 'proj-1' as ProjectId,
    projectName: 'Content Biz',
    agentId: 'agent-2' as AgentId,
    agentName: 'Researcher',
    description: 'Researcher sent keywords list to Writer',
    timestamp: dayAgo,
  },
]
