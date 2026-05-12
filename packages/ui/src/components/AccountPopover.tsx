import { useT } from '../i18n/index.js';
import { Icons } from './Icons.js';

export type AccountPopoverProps = {
  email: string;
  onOpenSettings?: () => void;
  onOpenRateLimits?: () => void;
  onLogout?: () => void;
};

export function AccountPopover({
  email,
  onOpenSettings,
  onOpenRateLimits,
  onLogout,
}: AccountPopoverProps) {
  const t = useT();
  return (
    <div className="popover" role="menu">
      <div className="popover__head">
        <Icons.User size={16} />
        <span>{email}</span>
      </div>
      <div className="popover__row popover__row--muted">
        <Icons.Settings size={15} />
        <span>{t('account.personal', 'Personal account')}</span>
      </div>
      <div className="popover__sep" />
      <button type="button" className="popover__row" onClick={onOpenSettings}>
        <Icons.Settings size={15} />
        <span>{t('account.settings', 'Settings')}</span>
      </button>
      <div className="popover__sep" />
      <button type="button" className="popover__row" onClick={onOpenRateLimits}>
        <Icons.Gauge size={15} />
        <span>{t('account.rateLimits', 'Rate limits remaining')}</span>
        <Icons.ChevRight size={13} style={{ marginLeft: 'auto' }} />
      </button>
      <div className="popover__sep" />
      <button type="button" className="popover__row" onClick={onLogout}>
        <Icons.Logout size={15} />
        <span>{t('account.logout', 'Log out')}</span>
      </button>
    </div>
  );
}
