import { useNavigate, useLocation, useParams } from 'react-router'
import { useAppStore } from '../../stores'
import { PixelDropdown } from '../base'

interface NavItem {
  label: string
  path: string
  icon: string
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '', icon: '[]' },
  { label: 'Chat', path: '/chat', icon: '>_' },
  { label: 'Agents', path: '/agents', icon: '{}' },
  { label: 'Skills', path: '/skills', icon: '<>' },
  { label: 'Tasks', path: '/tasks', icon: '#' },
  { label: 'Cron', path: '/cron', icon: '::' },
  { label: 'Artifacts', path: '/artifacts', icon: '[]' },
  { label: 'Memory', path: '/memory', icon: '()' },
]

const configItems: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: '*' },
]

export function ProjectSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams()
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const projects = useAppStore(s => s.projects)
  const currentProject = useAppStore(s => s.projects.find(p => p.id === s.currentProjectId))

  const basePath = `/projects/${projectId}`

  function isActive(path: string): boolean {
    const full = basePath + path
    return path === ''
      ? location.pathname === full
      : location.pathname.startsWith(full)
  }

  // Project switcher items
  const switcherItems = [
    ...projects.map(p => ({
      label: p.name,
      value: p.id,
      selected: p.id === projectId,
    })),
    { label: '← All Projects', value: '__lobby__' },
    { label: '◉ Dashboard', value: '__dashboard__' },
    { label: '⚙ Settings', value: '__settings__' },
  ]

  function handleProjectSwitch(value: string) {
    if (value === '__lobby__') {
      navigate('/')
    } else if (value === '__dashboard__') {
      navigate('/dashboard')
    } else if (value === '__settings__') {
      navigate('/settings')
    } else {
      navigate(`/projects/${value}`)
    }
  }

  if (sidebarCollapsed) {
    return (
      <aside data-testid="sidebar" className="w-14 shrink-0 bg-deep border-r-2 border-border-dim flex flex-col">
        <div className="p-2 border-b-2 border-border-dim">
          <PixelDropdown
            trigger={
              <button className="w-10 h-10 flex items-center justify-center font-pixel text-[10px] text-accent-green hover:bg-elevated cursor-pointer">
                SC
              </button>
            }
            items={switcherItems}
            onSelect={handleProjectSwitch}
            dividerAfter={[projects.length - 1]}
          />
        </div>
        <nav className="flex-1 py-2">
          {navItems.map(item => (
            <button
              key={item.path}
              data-testid={`nav-${item.label.toLowerCase()}`}
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
      {/* Project header with switcher */}
      <div className="p-3 border-b-2 border-border-dim">
        <PixelDropdown
          trigger={
            <button className="w-full text-left flex items-center gap-2 hover:bg-elevated/50 p-1 cursor-pointer transition-colors">
              <span className="font-pixel text-[10px] text-accent-green truncate flex-1">
                {currentProject?.name ?? 'SoloCraft'}
              </span>
              <span className="text-text-dim text-[10px]">▼</span>
            </button>
          }
          items={switcherItems}
          onSelect={handleProjectSwitch}
          dividerAfter={[projects.length - 1]}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2">
        <div className="px-3 py-1">
          <span className="font-pixel text-[8px] text-text-dim">NAVIGATION</span>
        </div>
        {navItems.map(item => (
          <button
            key={item.path}
            data-testid={`nav-${item.label.toLowerCase()}`}
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
            data-testid={`nav-${item.label.toLowerCase()}`}
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
