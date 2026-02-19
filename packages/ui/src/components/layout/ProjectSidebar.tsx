import { useNavigate, useLocation, useParams } from 'react-router'
import { useAppStore } from '../../stores'

interface NavItem {
  label: string
  path: string
  icon: string
  /** Stable testid suffix for E2E selectors (e.g., 'agents' → data-testid="nav-agents") */
  testId: string
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '', icon: '[]', testId: 'dashboard' },
  { label: 'Chats', path: '/chat', icon: '>_', testId: 'chat' },
  { label: 'Automations', path: '/cron', icon: '::', testId: 'cron' },
  { label: 'Agents', path: '/agents', icon: '{}', testId: 'agents' },
  { label: 'Skills', path: '/skills', icon: '<>', testId: 'skills' },
  { label: 'MCP Servers', path: '/mcp-servers', icon: '~>', testId: 'mcp-servers' },
  { label: 'Conversation Tasks', path: '/tasks', icon: '#', testId: 'tasks' },
  { label: 'Artifacts', path: '/artifacts', icon: '..', testId: 'artifacts' },
  { label: 'Memory', path: '/memory', icon: '()', testId: 'memory' },
]

const configItems: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: '*', testId: 'settings' },
]

export function ProjectSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams()
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)

  const basePath = `/projects/${projectId}`

  function isActive(path: string): boolean {
    const full = basePath + path
    return path === ''
      ? location.pathname === full
      : location.pathname.startsWith(full)
  }

  if (sidebarCollapsed) {
    return (
      <aside data-testid="sidebar" className="w-14 shrink-0 bg-deep border-r-2 border-border-dim flex flex-col">
        <nav className="flex-1 py-2">
          {navItems.map(item => (
            <button
              key={item.path}
              data-testid={`nav-${item.testId}`}
              onClick={() => navigate(basePath + item.path)}
              className={`w-full h-10 flex items-center justify-center font-mono text-[12px] cursor-pointer ${
                isActive(item.path)
                  ? 'bg-elevated text-accent-green border-l-2 border-l-accent-green'
                  : 'text-text-secondary hover:text-text-primary hover:bg-elevated/50'
              }`}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </nav>
        <button
          onClick={toggleSidebar}
          className="h-10 flex items-center justify-center text-text-dim hover:text-text-secondary font-mono text-[14px] cursor-pointer border-t-2 border-border-dim"
        >
          &gt;&gt;
        </button>
      </aside>
    )
  }

  return (
    <aside data-testid="sidebar" className="w-60 shrink-0 bg-deep border-r-2 border-border-dim flex flex-col">
      {/* Navigation */}
      <nav className="flex-1 py-2">
        <div className="px-3 py-1">
          <span className="font-pixel text-[8px] text-text-dim">NAVIGATION</span>
        </div>
        {navItems.map(item => (
          <button
            key={item.path}
            data-testid={`nav-${item.testId}`}
            onClick={() => navigate(basePath + item.path)}
            className={`w-full text-left px-3 py-2 flex items-center gap-2 font-mono text-[12px] cursor-pointer ${
              isActive(item.path)
                ? 'bg-elevated text-text-primary border-l-2 border-l-accent-green'
                : 'text-text-secondary hover:text-text-primary hover:bg-elevated/50'
            }`}
          >
            <span className="w-4 text-center text-[10px]">{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div className="px-3 py-1 mt-2">
          <span className="font-pixel text-[8px] text-text-dim">CONFIG</span>
        </div>
        {configItems.map(item => (
          <button
            key={item.path}
            data-testid={`nav-${item.testId}`}
            onClick={() => navigate(basePath + item.path)}
            className={`w-full text-left px-3 py-2 flex items-center gap-2 font-mono text-[12px] cursor-pointer ${
              isActive(item.path)
                ? 'bg-elevated text-text-primary border-l-2 border-l-accent-green'
                : 'text-text-secondary hover:text-text-primary hover:bg-elevated/50'
            }`}
          >
            <span className="w-4 text-center text-[10px]">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Collapse */}
      <button
        onClick={toggleSidebar}
        className="h-10 flex items-center justify-center text-text-dim hover:text-text-secondary font-mono text-[12px] cursor-pointer border-t-2 border-border-dim"
      >
        &lt;&lt; Collapse
      </button>
    </aside>
  )
}
