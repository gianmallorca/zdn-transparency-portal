import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Await } from '../components/Bits';
import QuestionEntry from '../components/visual/QuestionEntry';
import RelatableStat from '../components/visual/RelatableStat';
import TownPanel from '../components/visual/TownPanel';
import InfoTip from '../components/visual/InfoTip';
import { shortNameOf } from '../config';
import { count, plural } from '../lib/format';
import { POPULATION_CITATION, PROVINCE_POPULATION } from '../lib/population';
import { usePortal } from '../lib/portal-context';
import { summarise } from '../lib/scope';
import { groupByTown, TOWN_LABEL, type TownBucket, type TownId } from '../lib/towns';
import { useTitle } from '../lib/use-title';

const ProvinceMap = lazy(() => import('../components/visual/ProvinceMap'));

export default function VisualHome() {
  const { scope, config } = usePortal();
  useTitle(`Projects near you · ${shortNameOf(config)}`);
  return (
    <main className="page main visual-home">
      <Await state={scope} what="projects">
        {(s) => <HomeBody projects={s.projects} />}
      </Await>
    </main>
  );
}

function HomeBody({ projects }: { projects: import('../lib/scope').ScopedProject[] }) {
  const { config } = usePortal();
  const name = shortNameOf(config);
  const summary = useMemo(() => summarise(projects), [projects]);
  const { towns, districtWide, unmapped } = useMemo(() => groupByTown(projects), [projects]);
  const [bucket, setBucket] = useState<TownBucket | null>(null);

  const onSelectTown = useCallback((id: TownId) => {
    const found = towns.find((t) => t.townId === id);
    setBucket(
      found ?? {
        townId: id,
        label: TOWN_LABEL[id] ?? id,
        office: null,
        projects: [],
        totalPhp: 0,
      },
    );
  }, [towns]);

  return (
    <>
      <header className="visual-hero">
        <p className="eyebrow">FY 2027 · {name}</p>
        <h1>See where the budget goes</h1>
        <p className="lede">
          {plural(summary.rows, 'project')} for {name}. Tap your town on the map — exact pesos stay one tap away.
        </p>
      </header>

      <dl className="stats relatable-stats">
        <RelatableStat
          label="House bill total"
          amount={summary.house.php}
          accent
          tip="The version of the 2027 budget that passed the House (HB 10858). Compare with the President’s proposal; never add the two."
          population={PROVINCE_POPULATION}
        />
        <RelatableStat
          label="President’s proposal"
          amount={summary.nep.php}
          tip="The National Expenditure Program (NEP) — the budget the President submits to Congress."
          population={PROVINCE_POPULATION}
        />
        <div className="relatable-stat">
          <dt className="label">Projects</dt>
          <dd className="stat num">{count(summary.rows)}</dd>
          <dd className="stat-sub muted">{count(summary.groups.house_only.rows)} added only in the House bill</dd>
        </div>
      </dl>

      <section className="section map-section" aria-labelledby="map-h">
        <div className="map-section-head">
          <h2 id="map-h" className="section-h">Projects by town</h2>
          <InfoTip>
            Each municipality is shaded by total proposed funding in this portal’s live BetterGov data.
            Projects we cannot place in a town are listed under District-wide for their DPWH office.
          </InfoTip>
        </div>
        <Suspense fallback={<div className="map-skeleton" aria-busy="true">Loading map…</div>}>
          <ProvinceMap
            projects={projects}
            selectedTownId={bucket && bucket.townId !== '__district_wide__' ? bucket.townId : null}
            onSelectTown={onSelectTown}
          />
        </Suspense>

        {districtWide.length > 0 && (
          <div className="district-wide-block">
            <h3 className="friendly-compare-h">District-wide (no town in the title)</h3>
            <ul className="district-wide-list">
              {districtWide.map((b) => (
                <li key={b.label}>
                  <button type="button" className="district-wide-btn" onClick={() => setBucket(b)}>
                    <span>{b.label}</span>
                    <span className="muted">{plural(b.projects.length, 'project')}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="fine">
              {count(unmapped.length)} projects could not be mapped to a single municipality.
            </p>
          </div>
        )}
      </section>

      <QuestionEntry />

      <section className="section" aria-labelledby="more-h">
        <h2 id="more-h" className="section-h">Go deeper</h2>
        <div className="deep-links">
          <Link className="question-btn" to="/story">Story mode — how this budget is made</Link>
          <Link className="question-btn" to="/data">See the full data — tables and charts</Link>
          <Link className="question-btn" to="/explore?focus=changed">What changed from last year?</Link>
        </div>
      </section>

      <p className="fine population-cite">Population equivalents use {POPULATION_CITATION}</p>

      <TownPanel bucket={bucket} onClose={() => setBucket(null)} />
    </>
  );
}
