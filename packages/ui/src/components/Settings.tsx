import { useState, type ReactNode } from 'react';
import type { ThemePreference } from '@golemancy/protocol';
import {
  getStoredLocale,
  setLocalePersisted,
  supportedLocales,
  useT,
  type Locale,
} from '../i18n/index.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { Icons } from './Icons.js';

const LOCALE_LABEL: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
};

function LanguageSelect() {
  const t = useT();
  const [choice, setChoice] = useState<Locale | 'auto'>(() => getStoredLocale() ?? 'auto');
  return (
    <select
      className="select select--native"
      value={choice}
      onChange={(e) => {
        const next = e.target.value as Locale | 'auto';
        setChoice(next);
        void setLocalePersisted(next);
      }}
    >
      <option value="auto">{t('settings.general.language.auto', 'Auto detect')}</option>
      {supportedLocales.map((loc) => (
        <option key={loc} value={loc}>
          {LOCALE_LABEL[loc]}
        </option>
      ))}
    </select>
  );
}

export type SettingsSectionId =
  | 'general'
  | 'appear'
  | 'provider'
  | 'tools'
  | 'browser'
  | 'mcp'
  | 'hooks'
  | 'data'
  | 'security'
  | 'usage'
  | 'about';

const NAV: ReadonlyArray<{
  id: SettingsSectionId;
  labelKey: string;
  fallback: string;
  icon: ReactNode;
}> = [
  {
    id: 'general',
    labelKey: 'settings.nav.general',
    fallback: 'General',
    icon: <Icons.Settings size={15} />,
  },
  {
    id: 'appear',
    labelKey: 'settings.nav.appearance',
    fallback: 'Appearance',
    icon: <Icons.Sun size={15} />,
  },
  {
    id: 'provider',
    labelKey: 'settings.nav.providers',
    fallback: 'Providers',
    icon: <Icons.Sparkle size={15} />,
  },
  {
    id: 'tools',
    labelKey: 'settings.nav.toolsSkills',
    fallback: 'Tools & Skills',
    icon: <Icons.Tool size={15} />,
  },
  {
    id: 'browser',
    labelKey: 'settings.nav.browser',
    fallback: 'Browser profiles',
    icon: <Icons.Globe size={15} />,
  },
  {
    id: 'mcp',
    labelKey: 'settings.nav.mcp',
    fallback: 'MCP servers',
    icon: <Icons.Layers size={15} />,
  },
  {
    id: 'hooks',
    labelKey: 'settings.nav.hooks',
    fallback: 'Hooks',
    icon: <Icons.Hook size={15} />,
  },
  {
    id: 'data',
    labelKey: 'settings.nav.localData',
    fallback: 'Local data',
    icon: <Icons.Database size={15} />,
  },
  {
    id: 'security',
    labelKey: 'settings.nav.security',
    fallback: 'Security',
    icon: <Icons.Shield size={15} />,
  },
  {
    id: 'usage',
    labelKey: 'settings.nav.usage',
    fallback: 'Usage & billing',
    icon: <Icons.Gauge size={15} />,
  },
  { id: 'about', labelKey: 'settings.nav.about', fallback: 'About', icon: <Icons.Doc size={15} /> },
];

export type SettingsScreenProps = {
  section?: SettingsSectionId;
  onSelectSection?: (id: SettingsSectionId) => void;
  onBack?: () => void;
  // Apps can inject section content that is not part of the design-system
  // library — typically when wiring OS-level services (Tauri keychain,
  // file system) that this package must stay agnostic of.
  renderSection?: (id: SettingsSectionId) => ReactNode | null | undefined;
};

export function SettingsScreen({
  section = 'general',
  onSelectSection,
  onBack,
  renderSection,
}: SettingsScreenProps) {
  const t = useT();
  return (
    <div className="settings">
      <aside className="settings__nav">
        <button type="button" className="back-row" onClick={onBack}>
          <Icons.Back size={15} />
          <span>{t('settings.backToApp', 'Back to app')}</span>
        </button>
        <nav className="settings__list">
          {NAV.map((s) => (
            <button
              type="button"
              key={s.id}
              className="settings__item"
              data-active={s.id === section || undefined}
              onClick={() => onSelectSection?.(s.id)}
            >
              {s.icon}
              <span>{t(s.labelKey, s.fallback)}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="settings__main">
        <div className="settings__inner">
          <SettingsContent section={section} renderSection={renderSection} />
        </div>
      </main>
    </div>
  );
}

function SettingsContent({
  section,
  renderSection,
}: {
  section: SettingsSectionId;
  renderSection?: (id: SettingsSectionId) => ReactNode | null | undefined;
}) {
  if (section === 'general') return <GeneralSection />;
  if (section === 'appear') return <AppearanceSection />;
  const injected = renderSection?.(section);
  if (injected) return <>{injected}</>;
  const t = useT();
  const label = NAV.find((s) => s.id === section);
  return <h2 className="page__title">{label ? t(label.labelKey, label.fallback) : section}</h2>;
}

function Toggle({ on = true }: { on?: boolean }) {
  return (
    <span className="toggle" data-on={on || undefined}>
      <span className="toggle__knob" />
    </span>
  );
}

function Radio({ on }: { on?: boolean }) {
  return (
    <span className="radio" data-on={on || undefined}>
      <span />
    </span>
  );
}

function SettingsGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="sgroup">
      <header className="sgroup__head">
        <h3 className="sgroup__label">{label}</h3>
        {hint ? <p className="sgroup__hint">{hint}</p> : null}
      </header>
      <div className="sgroup__body">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  desc,
  control,
}: {
  title: ReactNode;
  desc?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="srow">
      <div className="srow__text">
        <div className="srow__title">{title}</div>
        {desc ? <div className="srow__desc">{desc}</div> : null}
      </div>
      <div className="srow__ctrl">{control}</div>
    </div>
  );
}

function SelectRow({ title, desc, value }: { title: ReactNode; desc?: ReactNode; value: string }) {
  return (
    <div className="srow">
      <div className="srow__text">
        <div className="srow__title">{title}</div>
        {desc ? <div className="srow__desc">{desc}</div> : null}
      </div>
      <button type="button" className="select">
        <span>{value}</span>
        <Icons.ChevDown size={13} />
      </button>
    </div>
  );
}

function SliderRow({ title, value }: { title: ReactNode; value: string }) {
  return (
    <div className="srow">
      <div className="srow__text">
        <div className="srow__title">{title}</div>
      </div>
      <div className="slider">
        <div className="slider__track">
          <div className="slider__fill" style={{ width: '50%' }} />
        </div>
        <span className="slider__val">{value}</span>
      </div>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  sub,
  active,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  active?: boolean;
}) {
  return (
    <button type="button" className="mode-card" data-active={active || undefined}>
      <span className="mode-card__icon">{icon}</span>
      <div className="mode-card__text">
        <span className="mode-card__title">{title}</span>
        <span className="mode-card__sub">{sub}</span>
      </div>
      <Radio on={active} />
    </button>
  );
}

function ThemeCard({
  mode,
  label,
  active,
  onSelect,
}: {
  mode: ThemePreference;
  label: string;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      className="theme-card"
      data-active={active || undefined}
      onClick={onSelect}
    >
      <div className={`theme-card__preview theme-card__preview--${mode}`}>
        <div className="theme-card__bar" />
        <div className="theme-card__content">
          <div className="theme-card__line" />
          <div className="theme-card__line theme-card__line--short" />
        </div>
      </div>
      <span className="theme-card__label">{label}</span>
      <Radio on={active} />
    </button>
  );
}

function GeneralSection() {
  const t = useT();
  return (
    <>
      <h2 className="page__title">{t('settings.nav.general', 'General')}</h2>
      <SettingsGroup
        label={t('settings.general.workMode.label', 'Work mode')}
        hint={t(
          'settings.general.workMode.hint',
          'Choose how much technical detail Golemancy shows.',
        )}
      >
        <div className="mode-grid">
          <ModeCard
            icon={<Icons.Tool size={20} />}
            title={t('settings.general.workMode.builder.title', 'For builders')}
            sub={t('settings.general.workMode.builder.sub', 'Show tool calls, runs, and approvals')}
            active
          />
          <ModeCard
            icon={<Icons.Sparkle size={20} />}
            title={t('settings.general.workMode.everyday.title', 'For everyday work')}
            sub={t('settings.general.workMode.everyday.sub', 'Same power, less technical chrome')}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup label={t('settings.general.permissions.label', 'Permissions')}>
        <SettingRow
          title={t('settings.general.permissions.default.title', 'Default permissions')}
          desc={t(
            'settings.general.permissions.default.desc',
            'Read and edit files inside the workspace. Ask for additional access when needed.',
          )}
          control={<Toggle on />}
        />
        <SettingRow
          title={t('settings.general.permissions.autoReview.title', 'Auto-review')}
          desc={t(
            'settings.general.permissions.autoReview.desc',
            'Golemancy reviews requests for elevated access automatically. Auto-review can make mistakes.',
          )}
          control={<Toggle on />}
        />
        <SettingRow
          title={t('settings.general.permissions.fullAccess.title', 'Full access')}
          desc={t(
            'settings.general.permissions.fullAccess.desc',
            'Run with full access — edit any file and reach the network without approval. Significantly increases risk of leaks.',
          )}
          control={<Toggle on={false} />}
        />
      </SettingsGroup>

      <SettingsGroup label={t('settings.general.general.label', 'General')}>
        <SelectRow
          title={t('settings.general.openDestination.title', 'Default open destination')}
          desc={t(
            'settings.general.openDestination.desc',
            'Where files and folders open by default.',
          )}
          value="WebStorm"
        />
        <SettingRow
          title={t('settings.general.language.title', 'Language')}
          desc={t('settings.general.language.desc', 'Language for the app UI.')}
          control={<LanguageSelect />}
        />
        <SettingRow
          title={t('settings.general.menuBar.title', 'Show in menu bar')}
          desc={t(
            'settings.general.menuBar.desc',
            'Keep Golemancy reachable from the macOS menu bar.',
          )}
          control={<Toggle on />}
        />
        <SettingRow
          title={t('settings.general.launchAtLogin.title', 'Launch at login')}
          control={<Toggle on={false} />}
        />
      </SettingsGroup>
    </>
  );
}

function AppearanceSection() {
  const t = useT();
  const { preference, setPreference } = useTheme();
  return (
    <>
      <h2 className="page__title">{t('settings.nav.appearance', 'Appearance')}</h2>
      <SettingsGroup
        label={t('settings.appearance.theme.label', 'Theme')}
        hint={t(
          'settings.appearance.theme.hint',
          'Switch between light and dark. Follows the system by default.',
        )}
      >
        <div className="theme-grid">
          <ThemeCard
            mode="light"
            label={t('settings.appearance.theme.light', 'Light')}
            active={preference === 'light'}
            onSelect={() => setPreference('light')}
          />
          <ThemeCard
            mode="dark"
            label={t('settings.appearance.theme.dark', 'Dark')}
            active={preference === 'dark'}
            onSelect={() => setPreference('dark')}
          />
          <ThemeCard
            mode="system"
            label={t('settings.appearance.theme.system', 'System')}
            active={preference === 'system'}
            onSelect={() => setPreference('system')}
          />
        </div>
      </SettingsGroup>
      <SettingsGroup label={t('settings.appearance.typography.label', 'Typography')}>
        <SelectRow
          title={t('settings.appearance.typography.interface', 'Interface font')}
          value="SF Pro"
        />
        <SelectRow
          title={t('settings.appearance.typography.mono', 'Mono font')}
          desc={t(
            'settings.appearance.typography.monoDesc',
            'Used in Shell, code blocks and diffs.',
          )}
          value="SF Mono"
        />
        <SliderRow
          title={t('settings.appearance.typography.density', 'Density')}
          value={t('settings.appearance.typography.densityValue', 'Comfortable')}
        />
      </SettingsGroup>
      <SettingsGroup label={t('settings.appearance.workbench.label', 'Workbench')}>
        <SettingRow
          title={t('settings.appearance.workbench.dots.title', 'Show sidebar status dots')}
          desc={t(
            'settings.appearance.workbench.dots.desc',
            'Tiny indicators for running, approval needed, and errors.',
          )}
          control={<Toggle on />}
        />
        <SettingRow
          title={t('settings.appearance.workbench.reduceMotion', 'Reduce motion')}
          control={<Toggle on={false} />}
        />
      </SettingsGroup>
    </>
  );
}
