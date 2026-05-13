import { useEffect, useRef, useState, type ReactNode } from 'react';
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

export type SidebarNavKey = 'new' | 'search' | 'skills' | 'automations';

export type SidebarProjectEntry = {
  id: string;
  name: string;
};

export type SidebarThreadEntry = {
  id: string;
  title: string | null;
  status: 'idle' | 'processing' | 'unread';
};

export type SidebarDraftEntry = {
  projectId: string;
};

export type SidebarActiveRef =
  | { kind: 'draft'; projectId: string }
  | { kind: 'thread'; threadId: string }
  | null;

export type SidebarProps = {
  activeNav?: SidebarNavKey;
  projects: ReadonlyArray<SidebarProjectEntry>;
  threadsByProject: Readonly<Record<string, ReadonlyArray<SidebarThreadEntry>>>;
  unassignedThreads?: ReadonlyArray<SidebarThreadEntry>;
  drafts: Readonly<Record<string, SidebarDraftEntry | undefined>>;
  activeRef: SidebarActiveRef;
  onSelectNav?: (nav: SidebarNavKey) => void;
  onOpenSettings?: () => void;
  onTopNewChat?: () => void;
  onCreateProject?: () => void;
  onRenameProject?: (id: string, name: string) => void;
  onDeleteProject?: (id: string) => void;
  onNewChatInProject?: (projectId: string) => void;
  onSelectThread?: (threadId: string) => void;
  onSelectDraft?: (projectId: string) => void;
  onRenameThread?: (id: string, title: string) => void;
  onDeleteThread?: (id: string) => void;
};

function useOutsideClick<T extends HTMLElement>(handler: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) handler();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [handler]);
  return ref;
}

type MenuItem = { label: string; onSelect: () => void; danger?: boolean };

function RowMenu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);
  return (
    <div className="row-menu" ref={ref} role="menu">
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          className="row-menu__item"
          data-danger={it.danger || undefined}
          onClick={(e) => {
            e.stopPropagation();
            it.onSelect();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: SidebarThreadEntry['status'] }) {
  if (status === 'processing') return <span className="session-spinner" aria-label="processing" />;
  if (status === 'unread') return <span className="session-unread" aria-label="unread" />;
  return <Icons.ChatDot size={14} />;
}

export function Sidebar({
  activeNav = 'new',
  projects,
  threadsByProject,
  unassignedThreads = [],
  drafts,
  activeRef,
  onSelectNav,
  onOpenSettings,
  onTopNewChat,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onNewChatInProject,
  onSelectThread,
  onSelectDraft,
  onRenameThread,
  onDeleteThread,
}: SidebarProps) {
  const t = useT();
  const [openProj, setOpenProj] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ kind: 'project' | 'thread'; id: string } | null>(null);
  const [renaming, setRenaming] = useState<{ kind: 'project' | 'thread'; id: string } | null>(null);

  // Auto-expand projects that contain the active session (or a draft).
  useEffect(() => {
    if (!activeRef) return;
    const expandId =
      activeRef.kind === 'draft'
        ? activeRef.projectId
        : findProjectIdForThread(threadsByProject, activeRef.threadId);
    if (expandId) setOpenProj((o) => ({ ...o, [expandId]: true }));
  }, [activeRef, threadsByProject]);

  const submitRename = (kind: 'project' | 'thread', id: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (kind === 'project') onRenameProject?.(id, trimmed);
    else onRenameThread?.(id, trimmed);
  };

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
            active={activeNav === 'new' && activeRef === null}
            onClick={() => {
              onSelectNav?.('new');
              onTopNewChat?.();
            }}
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

        <div className="projects-zone">
          <SectionLabel
            trailing={
              <div className="side-section__actions projects-zone__actions">
                <button
                  className="ghost-icon"
                  type="button"
                  title={t('sidebar.newProject', 'New project')}
                  onClick={onCreateProject}
                >
                  <Icons.FolderPlus size={14} />
                </button>
              </div>
            }
          >
            {t('sidebar.projects', 'Projects')}
          </SectionLabel>

          <div className="side-group">
            {projects.length === 0 ? (
              <div className="proj-empty">
                {t('sidebar.noProjects', 'No projects yet — click + to create one.')}
              </div>
            ) : null}
            {projects.map((p) => {
              const threads = threadsByProject[p.id] ?? [];
              const draft = drafts[p.id];
              const isOpen = openProj[p.id] ?? true;
              const isActiveProject =
                (activeRef?.kind === 'draft' && activeRef.projectId === p.id) ||
                (activeRef?.kind === 'thread' &&
                  threads.some((t) => t.id === activeRef.threadId));
              const isRenaming = renaming?.kind === 'project' && renaming.id === p.id;
              return (
                <div key={p.id}>
                  <div
                    className="side-row side-row--project"
                    data-active={isActiveProject || undefined}
                    onClick={() => setOpenProj((o) => ({ ...o, [p.id]: !isOpen }))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenProj((o) => ({ ...o, [p.id]: !isOpen }));
                      }
                    }}
                  >
                    <span className="side-row__icon">
                      <span className="chev" data-open={isOpen || undefined}>
                        <Icons.ChevRight size={12} />
                      </span>
                    </span>
                    <Icons.Project size={15} />
                    {isRenaming ? (
                      <InlineRename
                        initial={p.name}
                        onSubmit={(v) => {
                          submitRename('project', p.id, v);
                          setRenaming(null);
                        }}
                        onCancel={() => setRenaming(null)}
                      />
                    ) : (
                      <span className="side-row__label">{p.name}</span>
                    )}
                    <span className="proj-actions">
                      <button
                        type="button"
                        className="ghost-icon"
                        title={t('sidebar.projectMore', 'More')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenu((m) =>
                            m?.kind === 'project' && m.id === p.id
                              ? null
                              : { kind: 'project', id: p.id },
                          );
                        }}
                      >
                        <Icons.More size={14} />
                      </button>
                      <button
                        type="button"
                        className="ghost-icon"
                        title={t('sidebar.newChatHere', 'New chat in project')}
                        onClick={(e) => {
                          e.stopPropagation();
                          onNewChatInProject?.(p.id);
                          setOpenProj((o) => ({ ...o, [p.id]: true }));
                        }}
                      >
                        <Icons.NewChat size={14} />
                      </button>
                    </span>
                    {menu?.kind === 'project' && menu.id === p.id ? (
                      <RowMenu
                        items={[
                          {
                            label: t('sidebar.rename', 'Rename'),
                            onSelect: () => setRenaming({ kind: 'project', id: p.id }),
                          },
                          {
                            label: t('sidebar.delete', 'Delete'),
                            danger: true,
                            onSelect: () => onDeleteProject?.(p.id),
                          },
                        ]}
                        onClose={() => setMenu(null)}
                      />
                    ) : null}
                  </div>

                  {isOpen ? (
                    <div className="proj-chats">
                      {draft ? (
                        <button
                          type="button"
                          className="side-row side-row--chat"
                          data-active={
                            activeRef?.kind === 'draft' && activeRef.projectId === p.id
                              ? true
                              : undefined
                          }
                          onClick={() => onSelectDraft?.(p.id)}
                        >
                          <Icons.Edit size={13} />
                          <span className="side-row__label side-row__label--muted">
                            {t('sidebar.draft', 'New chat (draft)')}
                          </span>
                        </button>
                      ) : null}
                      {threads.length === 0 && !draft ? (
                        <div className="proj-empty">{t('sidebar.noChats', 'No chats')}</div>
                      ) : null}
                      {threads.map((th) => {
                        const isActive =
                          activeRef?.kind === 'thread' && activeRef.threadId === th.id;
                        const isThreadRenaming =
                          renaming?.kind === 'thread' && renaming.id === th.id;
                        return (
                          <div key={th.id} className="thread-row-wrap">
                            <button
                              type="button"
                              className="side-row side-row--chat"
                              data-active={isActive || undefined}
                              onClick={() => onSelectThread?.(th.id)}
                            >
                              <span className="side-row__icon">
                                <StatusDot status={th.status} />
                              </span>
                              {isThreadRenaming ? (
                                <InlineRename
                                  initial={th.title ?? ''}
                                  onSubmit={(v) => {
                                    submitRename('thread', th.id, v);
                                    setRenaming(null);
                                  }}
                                  onCancel={() => setRenaming(null)}
                                />
                              ) : (
                                <span className="side-row__label">
                                  {th.title ?? t('sidebar.untitledChat', '(untitled)')}
                                </span>
                              )}
                              <span className="thread-actions">
                                <button
                                  type="button"
                                  className="ghost-icon"
                                  title={t('sidebar.threadMore', 'More')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenu((m) =>
                                      m?.kind === 'thread' && m.id === th.id
                                        ? null
                                        : { kind: 'thread', id: th.id },
                                    );
                                  }}
                                >
                                  <Icons.More size={13} />
                                </button>
                              </span>
                            </button>
                            {menu?.kind === 'thread' && menu.id === th.id ? (
                              <RowMenu
                                items={[
                                  {
                                    label: t('sidebar.rename', 'Rename'),
                                    onSelect: () =>
                                      setRenaming({ kind: 'thread', id: th.id }),
                                  },
                                  {
                                    label: t('sidebar.delete', 'Delete'),
                                    danger: true,
                                    onSelect: () => onDeleteThread?.(th.id),
                                  },
                                ]}
                                onClose={() => setMenu(null)}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {unassignedThreads.length > 0 ? (
          <>
            <SectionLabel>{t('sidebar.unassigned', 'Unassigned')}</SectionLabel>
            <div className="side-group">
              {unassignedThreads.map((th) => {
                const isActive =
                  activeRef?.kind === 'thread' && activeRef.threadId === th.id;
                const isThreadRenaming =
                  renaming?.kind === 'thread' && renaming.id === th.id;
                return (
                  <div key={th.id} className="thread-row-wrap">
                    <button
                      type="button"
                      className="side-row side-row--chat"
                      data-active={isActive || undefined}
                      onClick={() => onSelectThread?.(th.id)}
                    >
                      <span className="side-row__icon">
                        <StatusDot status={th.status} />
                      </span>
                      {isThreadRenaming ? (
                        <InlineRename
                          initial={th.title ?? ''}
                          onSubmit={(v) => {
                            const trimmed = v.trim();
                            if (trimmed) onRenameThread?.(th.id, trimmed);
                            setRenaming(null);
                          }}
                          onCancel={() => setRenaming(null)}
                        />
                      ) : (
                        <span className="side-row__label">
                          {th.title ?? t('sidebar.untitledChat', '(untitled)')}
                        </span>
                      )}
                      <span className="thread-actions">
                        <button
                          type="button"
                          className="ghost-icon"
                          title={t('sidebar.threadMore', 'More')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenu((m) =>
                              m?.kind === 'thread' && m.id === th.id
                                ? null
                                : { kind: 'thread', id: th.id },
                            );
                          }}
                        >
                          <Icons.More size={13} />
                        </button>
                      </span>
                    </button>
                    {menu?.kind === 'thread' && menu.id === th.id ? (
                      <RowMenu
                        items={[
                          {
                            label: t('sidebar.rename', 'Rename'),
                            onSelect: () => setRenaming({ kind: 'thread', id: th.id }),
                          },
                          {
                            label: t('sidebar.delete', 'Delete'),
                            danger: true,
                            onSelect: () => onDeleteThread?.(th.id),
                          },
                        ]}
                        onClose={() => setMenu(null)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
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

function InlineRename({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="inline-rename"
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onSubmit(value)}
    />
  );
}

function findProjectIdForThread(
  byProject: Readonly<Record<string, ReadonlyArray<SidebarThreadEntry>>>,
  threadId: string,
): string | null {
  for (const [pid, list] of Object.entries(byProject)) {
    if (list.some((t) => t.id === threadId)) return pid;
  }
  return null;
}
