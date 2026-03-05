import { useNavigate, useLocation, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'

interface NavItem {
  key: string
  path: string
  icon: string
  /** Stable testid suffix for E2E selectors (e.g., 'agents' → data-testid="nav-agents") */
  testId: string
}

const navItems: NavItem[] = [
  { key: 'item.dashboard', path: '', icon: '[]', testId: 'dashboard' },
  { key: 'item.chats', path: '/chat', icon: '>_', testId: 'chat' },
  { key: 'item.automations', path: '/cron', icon: '::', testId: 'cron' },
  { key: 'item.agents', path: '/agents', icon: '{}', testId: 'agents' },
  { key: 'item.teams', path: '/teams', icon: '&&', testId: 'teams' },
  { key: 'item.skills', path: '/skills', icon: '<>', testId: 'skills' },
  { key: 'item.mcpServers', path: '/mcp-servers', icon: '~>', testId: 'mcp-servers' },
  { key: 'item.artifacts', path: '/artifacts', icon: '..', testId: 'artifacts' },
]

const configItems: NavItem[] = [
  { key: 'item.settings', path: '/settings', icon: '*', testId: 'settings' },
]

export function ProjectSidebar() {
  const { t } = useTranslation('nav')
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
              title={t(item.key)}
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
          <span className="font-pixel text-[8px] text-text-dim">{t('sidebar.navigation')}</span>
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
            {t(item.key)}
          </button>
        ))}

        <div className="px-3 py-1 mt-2">
          <span className="font-pixel text-[8px] text-text-dim">{t('sidebar.config')}</span>
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
            {t(item.key)}
          </button>
        ))}
      </nav>

      {/* Collapse */}
      <button
        onClick={toggleSidebar}
        className="h-10 flex items-center justify-center text-text-dim hover:text-text-secondary font-mono text-[12px] cursor-pointer border-t-2 border-border-dim"
      >
        {t('sidebar.collapse')}
      </button>
    </aside>
  )
}
