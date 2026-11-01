import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Await } from '../components/Bits';
import QuestionEntry from '../components/visual/QuestionEntry';
import RelatableStat from '../components/visual/RelatableStat';
import TownPanel from '../components/visual/TownPanel';
import TownPickButton from '../components/visual/TownPickButton';
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
  const { config, client } = usePortal();
  const name = shortNameOf(config);
  const summary = useMemo(() => summarise(projects), [projects]);
  const { towns, districtWide, unmapped } = useMemo(() => groupByTown(projects), [projects]);
  const [bucket, setBucket] = useState<TownBucket | null>(null);
  const [pointsNote, setPointsNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .datasetRegions('dpwh')
      .then((res) => {
        if (!cancelled) setPointsNote(res.data?.points_note ?? null);
      })
      .catch(() => {
        if (!cancelled) setPointsNote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

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
          <dd className="stat"><span className="stat-primary">{count(summary.rows)}</span></dd>
          <dd className="stat-sub muted">{count(summary.groups.house_only.rows)} added only in the House bill</dd>
        </div>
      </dl>

      <section className="section map-section" aria-labelledby="map-h">
        <div className="map-section-head">
          <h2 id="map-h" className="section-h">Projects by town</h2>
          <InfoTip label="How to read this" title="About the map">
            Each municipality is shaded by total proposed funding in this portal’s live BetterGov data.
            Projects we cannot place in a town are listed under District-wide for their DPWH office.
          </InfoTip>
        </div>
        <Suspense fallback={<div className="map-skeleton" aria-busy="true">Loading map…</div>}>
          <ProvinceMap
            projects={projects}
            selectedTownId={bucket && bucket.townId !== '__district_wide__' ? bucket.townId : null}
            onSelectTown={onSelectTown}
            pointsNote={pointsNote}
          />
        </Suspense>

        {districtWide.length > 0 && (
          <div className="district-wide-block">
            <h3 className="friendly-compare-h">District-wide (no town in the title)</h3>
            <ul className="district-wide-list">
              {districtWide.map((b) => (
                <li key={b.label}>
                  <TownPickButton
                    label={b.label}
                    bucket={b}
                    active={bucket?.label === b.label}
                    onPick={setBucket}
                  />
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
          <Link className="click-box question-btn" to="/story">
            <span className="click-box-copy">
              <span className="click-box-title">Story mode</span>
              <span className="click-box-sub">How this budget is made</span>
            </span>
            <ChevronRight className="click-box-chevron" size={18} strokeWidth={2.25} aria-hidden="true" />
          </Link>
          <Link className="click-box question-btn" to="/data">
            <span className="click-box-copy">
              <span className="click-box-title">See the full data</span>
              <span className="click-box-sub">Tables and charts</span>
            </span>
            <ChevronRight className="click-box-chevron" size={18} strokeWidth={2.25} aria-hidden="true" />
          </Link>
          <Link className="click-box question-btn" to="/explore?focus=changed">
            <span className="click-box-copy">
              <span className="click-box-title">What changed from last year?</span>
              <span className="click-box-sub">Office-by-office comparison</span>
            </span>
            <ChevronRight className="click-box-chevron" size={18} strokeWidth={2.25} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <p className="fine population-cite">Population equivalents use {POPULATION_CITATION}</p>

      <TownPanel bucket={bucket} onClose={() => setBucket(null)} />
    </>
  );
}
