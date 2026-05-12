import { useState } from 'react';
import { useT } from '../i18n/index.js';
import { Icons } from './Icons.js';

export type ComposerProps = {
  placeholder?: string;
  initialValue?: string;
  projectName?: string;
  modelLabel?: string;
  modelStatus?: 'ok' | 'unknown' | 'error';
  onSubmit?: (text: string) => void;
};

export function Composer({
  placeholder,
  initialValue = '',
  projectName = 'golemancy',
  modelLabel = 'Claude Sonnet 4.5',
  modelStatus = 'ok',
  onSubmit,
}: ComposerProps) {
  const t = useT();
  const [value, setValue] = useState(initialValue);
  const effectivePlaceholder =
    placeholder ?? t('composer.placeholder', 'What should we build in golemancy?');

  const handleSubmit = () => {
    if (!value.trim() || !onSubmit) return;
    onSubmit(value);
    setValue('');
  };

  return (
    <div className="composer">
      <textarea
        className="composer__input"
        placeholder={effectivePlaceholder}
        rows={2}
        value={value}
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
          <button type="button" className="chip">
            <Icons.Project size={13} />
            <span>{projectName}</span>
            <Icons.ChevDown size={11} />
          </button>
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
          >
            <Icons.ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
