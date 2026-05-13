import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';
import { Icons } from './Icons.js';

export type ComposerProjectOption = {
  id: string;
  name: string;
};

export type ComposerProps = {
  placeholder?: string;
  initialValue?: string;
  projectName?: string;
  modelLabel?: string;
  modelStatus?: 'ok' | 'unknown' | 'error';
  disabled?: boolean;
  onSubmit?: (text: string) => void;
  projects?: ReadonlyArray<ComposerProjectOption>;
  activeProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  onCreateProject?: () => void;
};

export function Composer({
  placeholder,
  initialValue = '',
  projectName,
  modelLabel = 'Claude Sonnet 4.5',
  modelStatus = 'ok',
  disabled = false,
  onSubmit,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
}: ComposerProps) {
  const t = useT();
  const displayProjectName = projectName ?? t('composer.noProject', 'No project');
  const [value, setValue] = useState(initialValue);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const projectSwitchable = !!(projects && (onSelectProject || onCreateProject));

  useEffect(() => {
    if (!projectMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!projectMenuRef.current) return;
      if (!projectMenuRef.current.contains(e.target as Node)) setProjectMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [projectMenuOpen]);
  const effectivePlaceholder =
    placeholder ?? t('composer.placeholder', 'What should we build in golemancy?');

  const handleSubmit = () => {
    if (disabled || !value.trim() || !onSubmit) return;
    onSubmit(value);
    setValue('');
  };

  return (
    <div className="composer" data-disabled={disabled || undefined}>
      <textarea
        className="composer__input"
        placeholder={effectivePlaceholder}
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="composer__bar">
        <div className="composer__left">
          <button type="button" className="chip chip--icon" title={t('composer.attach', 'Attach')}>
            <Icons.Plus size={15} />
          </button>
          <button type="button" className="chip">
            <Icons.Skills size={13} />
            <span>{t('composer.skills', 'Skills')}</span>
          </button>
          <div className="composer__project" ref={projectMenuRef}>
            <button
              type="button"
              className="chip"
              onClick={() =>
                projectSwitchable ? setProjectMenuOpen((open) => !open) : undefined
              }
              aria-haspopup={projectSwitchable ? 'menu' : undefined}
              aria-expanded={projectSwitchable ? projectMenuOpen : undefined}
            >
              <Icons.Project size={13} />
              <span>{displayProjectName}</span>
              <Icons.ChevDown size={11} />
            </button>
            {projectSwitchable && projectMenuOpen ? (
              <div className="row-menu composer__project-menu" role="menu">
                {projects!.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitem"
                    className="row-menu__item"
                    data-active={p.id === activeProjectId || undefined}
                    onClick={() => {
                      setProjectMenuOpen(false);
                      if (p.id !== activeProjectId) onSelectProject?.(p.id);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
                {onCreateProject ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="row-menu__item row-menu__item--accent"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      onCreateProject();
                    }}
                  >
                    + {t('composer.newProject', 'New project')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button type="button" className="chip">
            <Icons.At size={13} />
            <span>{t('composer.mention', 'Mention')}</span>
          </button>
        </div>
        <div className="composer__right">
          <button type="button" className="chip">
            <span className={`dot dot--${modelStatus === 'ok' ? 'ok' : 'idle'}`} />
            <span>{modelLabel}</span>
            <Icons.ChevDown size={11} />
          </button>
          <button
            type="button"
            className="chip chip--icon"
            title={t('composer.dictate', 'Dictate')}
          >
            <Icons.Mic size={15} />
          </button>
          <button
            type="button"
            className="send"
            title={t('composer.send', 'Send')}
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
          >
            <Icons.ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
