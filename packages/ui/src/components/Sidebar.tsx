import { useState, type ReactNode } from 'react';
import { useT } from '../i18n/index.js';
import { Icons } from './Icons.js';
import { Logo } from './Logo.js';

type SideRowProps = {
  icon: ReactNode;
  label: ReactNode;
  kbd?: string;
  active?: boolean;
  muted?: boolean;
  indent?: number;
  onClick?: () => void;
  trailing?: ReactNode;
};

function SideRow({ icon, label, kbd, active, muted, indent = 0, onClick, trailing }: SideRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="side-row"
      data-active={active || undefined}
      data-muted={muted || undefined}
      style={{ paddingLeft: 12 + indent }}
    >
      <span className="side-row__icon">{icon}</span>
      <span className="side-row__label">{label}</span>
      {kbd ? <span className="kbd">{kbd}</span> : null}
      {trailing}
    </button>
  );
}

function SectionLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="side-section">
      <span>{children}</span>
      {trailing}
    </div>
  );
}

export type ProjectEntry = {
  id: string;
  name: string;
  chats: ReadonlyArray<string>;
};

export type SidebarNavKey = 'new' | 'search' | 'skills' | 'automations';

export type SidebarProps = {
  activeNav?: SidebarNavKey;
  projects?: ReadonlyArray<ProjectEntry>;
  pinned?: ReadonlyArray<{ id: string; name: string; kbd?: string }>;
  onSelectNav?: (nav: SidebarNavKey) => void;
  onOpenSettings?: () => void;
};

const DEFAULT_PROJECTS: ReadonlyArray<ProjectEntry> = [
  { id: 'golemancy', name: 'golemancy', chats: ['Rebuild v0.2 brief', 'Onboarding copy', 'Provider model matrix'] },
  { id: 'colawd', name: 'colawd', chats: [] },
  { id: 'colawd2', name: 'colawd2', chats: ['Retention review prep'] },
  { id: 'caiyongji2026', name: 'caiyongji2026', chats: [] },
  { id: 'zzaship', name: 'zzaship', chats: [] },
  { id: 'nanowhisper', name: 'nanowhisper', chats: [] },
  { id: 'playground', name: 'Playground', chats: [] },
];

const DEFAULT_PINNED = [
  { id: 'design-kit', name: 'Design system kit', kbd: '⌘1' },
  { id: 'retention', name: 'Weekly retention review', kbd: '⌘2' },
] as const;

export function Sidebar({
  activeNav = 'new',
  projects = DEFAULT_PROJECTS,
  pinned = DEFAULT_PINNED,
  onSelectNav,
  onOpenSettings,
}: SidebarProps) {
  const t = useT();
  const [openProj, setOpenProj] = useState<Record<string, boolean>>({
    golemancy: true,
    colawd2: false,
  });

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="brand-row">
          <Logo size={20} />
          <span className="brand-name">Golemancy</span>
        </div>

        <div className="side-group">
          <SideRow
            icon={<Icons.NewChat size={16} />}
            label={t('sidebar.newChat', 'New chat')}
            kbd="⌘N"
            active={activeNav === 'new'}
            onClick={() => onSelectNav?.('new')}
          />
          <SideRow
            icon={<Icons.Search size={16} />}
            label={t('sidebar.search', 'Search')}
            kbd="⌘K"
            active={activeNav === 'search'}
            onClick={() => onSelectNav?.('search')}
          />
          <SideRow
            icon={<Icons.Skills size={16} />}
            label={t('sidebar.skills', 'Skills')}
            active={activeNav === 'skills'}
            onClick={() => onSelectNav?.('skills')}
          />
          <SideRow
            icon={<Icons.Automation size={16} />}
            label={t('sidebar.automations', 'Automations')}
            active={activeNav === 'automations'}
            onClick={() => onSelectNav?.('automations')}
          />
        </div>

        <SectionLabel>{t('sidebar.pinned', 'Pinned')}</SectionLabel>
        <div className="side-group">
          {pinned.map((p) => (
            <SideRow key={p.id} icon={<Icons.Pin size={15} />} label={p.name} kbd={p.kbd} />
          ))}
        </div>

        <SectionLabel
          trailing={
            <div className="side-section__actions">
              <button className="ghost-icon" type="button" title={t('sidebar.filter', 'Filter')}>
                <Icons.Filter size={14} />
              </button>
              <button
                className="ghost-icon"
                type="button"
                title={t('sidebar.newProject', 'New project')}
              >
                <Icons.Folder size={14} />
              </button>
            </div>
          }
        >
          {t('sidebar.projects', 'Projects')}
        </SectionLabel>

        <div className="side-group">
          {projects.map((p) => (
            <div key={p.id}>
              <button
                type="button"
                className="side-row side-row--project"
                onClick={() => setOpenProj((o) => ({ ...o, [p.id]: !o[p.id] }))}
              >
                <span className="side-row__icon">
                  <span className="chev" data-open={openProj[p.id] || undefined}>
                    <Icons.ChevRight size={12} />
                  </span>
                </span>
                <Icons.Project size={15} />
                <span className="side-row__label">{p.name}</span>
                <span className="proj-actions">
                  <span className="ghost-icon">
                    <Icons.More size={14} />
                  </span>
                  <span className="ghost-icon">
                    <Icons.Edit size={14} />
                  </span>
                </span>
              </button>
              {openProj[p.id] ? (
                <div className="proj-chats">
                  {p.chats.length === 0 ? (
                    <div className="proj-empty">{t('sidebar.noChats', 'No chats')}</div>
                  ) : (
                    p.chats.map((c) => (
                      <button key={c} type="button" className="side-row side-row--chat">
                        <Icons.ChatDot size={14} />
                        <span className="side-row__label">{c}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar__bottom">
        <SideRow
          icon={<Icons.Settings size={16} />}
          label={t('sidebar.settings', 'Settings')}
          onClick={onOpenSettings}
        />
      </div>
    </aside>
  );
}
