import { useT } from '../i18n/index.js';
import { Composer, type ComposerProps } from './Composer.js';
import { Logo } from './Logo.js';
import { PracticeCard, type PracticeEntry } from './PracticeCard.js';

const DEFAULT_PRACTICES: ReadonlyArray<PracticeEntry> = [
  {
    art: 'deck',
    tag: 'Pitch deck',
    title: 'Investor-ready PPT from a one-line brief',
    sub: 'Outline → evidence → slides',
  },
  {
    art: 'site',
    tag: 'Landing page',
    title: 'Ship a credible product site in an hour',
    sub: 'Template → copy → publish',
  },
  {
    art: 'doc',
    tag: 'Research',
    title: 'Brief with verifiable sources & boundaries',
    sub: 'Search → cite → review',
  },
  {
    art: 'flow',
    tag: 'Workflow',
    title: 'Automate retention review across PostHog',
    sub: 'Pull → diff → reply',
  },
  {
    art: 'video',
    tag: 'Short video',
    title: 'Turn a thread into a captioned short',
    sub: 'Script → cuts → export',
  },
  {
    art: 'data',
    tag: 'Local data',
    title: 'Query your Notion + Drive without leaks',
    sub: 'Index → filter → answer',
  },
];

export type HomeProps = {
  practices?: ReadonlyArray<PracticeEntry>;
  composer?: ComposerProps;
  onShufflePractices?: () => void;
};

export function Home({ practices = DEFAULT_PRACTICES, composer, onShufflePractices }: HomeProps) {
  const t = useT();
  return (
    <div className="home">
      <div className="home__inner">
        <div className="home__hero">
          <Logo size={44} />
          <h1 className="home__title">
            {t('home.heroTitle', 'From AI generation, to AI delivery.')}
          </h1>
          <p className="home__sub">
            {t(
              'home.heroSub',
              'A local-first AI workbench. Production-grade workflows you can ship.',
            )}
          </p>
        </div>
        <Composer {...composer} />
        <div className="best">
          <div className="best__head">
            <span className="best__title">{t('home.bestPractices', 'Best practices')}</span>
            <button type="button" className="best__refresh" onClick={onShufflePractices}>
              {t('home.shuffle', 'Shuffle')}
            </button>
          </div>
          <div className="best__grid">
            {practices.map((p) => (
              <PracticeCard key={p.tag} entry={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
