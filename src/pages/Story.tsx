import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { DistrictCard, Envelope } from '../api/types';
import { Await } from '../components/Bits';
import FriendlyCompare, { type CompareRow } from '../components/visual/FriendlyCompare';
import RelatableStat from '../components/visual/RelatableStat';
import InfoTip from '../components/visual/InfoTip';
import { shortNameOf } from '../config';
import { deoShort, officeCompare, uniqueOffices } from '../lib/charts';
import { count, php, plural } from '../lib/format';
import { POPULATION_CITATION, PROVINCE_POPULATION } from '../lib/population';
import { usePortal } from '../lib/portal-context';
import { summarise, type ScopedProject } from '../lib/scope';
import { useTitle } from '../lib/use-title';

export default function Story() {
  const { scope, config } = usePortal();
  useTitle(`Story · ${shortNameOf(config)}`);
  return (
    <main className="page main story-page">
      <Await state={scope} what="projects">
        {(s) => <StoryBody projects={s.projects} />}
      </Await>
    </main>
  );
}

function StoryBody({ projects }: { projects: ScopedProject[] }) {
  const { config, districts } = usePortal();
  const name = shortNameOf(config);
  const summary = useMemo(() => summarise(projects), [projects]);
  const houseOnly = summary.groups.house_only;

  return (
    <>
      <header className="visual-hero">
        <p className="eyebrow">Story mode</p>
        <h1>How the 2027 budget reaches {name}</h1>
        <p className="lede">Four short steps. Every figure is live from the BetterGov Budget API.</p>
      </header>

      <article className="story-step" id="step-source">
        <p className="story-kicker">Step 1</p>
        <h2>Where the budget comes from</h2>
        <p>
          Each year the national government proposes and Congress amends a budget. This portal shows the lines that
          name {name} — roads, bridges, health facilities, farm roads, and irrigation — not the entire national budget.
        </p>
        <div className="story-visual">
          <dl className="stats relatable-stats">
            <div className="relatable-stat">
              <dt className="label">Projects in this portal</dt>
              <dd className="stat num">{count(summary.rows)}</dd>
              <dd className="stat-sub muted">Scoped to {name} via DPWH offices and place searches</dd>
            </div>
          </dl>
        </div>
      </article>

      <article className="story-step" id="step-nep">
        <p className="story-kicker">Step 2</p>
        <h2>
          The President’s proposal{' '}
          <InfoTip label="What's this?">
            The National Expenditure Program (NEP) is the budget the President submits to Congress.
          </InfoTip>
        </h2>
        <p>
          Before Congress votes, the executive publishes a proposal. For {name}, that proposal covers{' '}
          {plural(summary.nep.rows, 'project')} totaling {php(summary.nep.php)}.
        </p>
        <div className="story-visual">
          <dl className="stats relatable-stats">
            <RelatableStat
              label="President’s proposal for this portal"
              amount={summary.nep.php}
              population={PROVINCE_POPULATION}
            />
          </dl>
        </div>
      </article>

      <article className="story-step" id="step-house">
        <p className="story-kicker">Step 3</p>
        <h2>
          What the House changed{' '}
          <InfoTip label="What's this?">
            House Bill 10858 is the House version of the 2027 budget. Compare it with the proposal; never add the two.
          </InfoTip>
        </h2>
        <p>
          The House bill lists {plural(summary.house.rows, 'project')} for {name} totaling {php(summary.house.php)}.
          {houseOnly.rows > 0 && (
            <> {count(houseOnly.rows)} appear only in the House bill ({php(houseOnly.house_php)}) — insertion candidates to check.</>
          )}
        </p>
        <div className="story-visual">
          <dl className="stats relatable-stats">
            <RelatableStat
              label="House bill total"
              amount={summary.house.php}
              accent
              population={PROVINCE_POPULATION}
            />
            <div className="relatable-stat">
              <dt className="label">Only in the House bill</dt>
              <dd className="stat num">{count(houseOnly.rows)}</dd>
              <dd className="stat-sub muted">{php(houseOnly.house_php)}</dd>
            </div>
          </dl>
        </div>
      </article>

      <article className="story-step" id="step-meaning">
        <p className="story-kicker">Step 4</p>
        <h2>What this means for {name}</h2>
        <p>
          Compared with last year’s enacted budget, each district engineering office moved up or down.
          Green means more; gray means less. Open a row for exact pesos.
        </p>
        <div className="story-visual">
          <Await state={districts} what="office comparisons">
            {(list) => <OfficeFriendly list={list} />}
          </Await>
        </div>
      </article>

      <p className="fine">
        <Link to="/">Back to the map</Link>
        <span className="sep">·</span>
        <Link to="/data">See the full data</Link>
        <span className="sep">·</span>
        Population: {POPULATION_CITATION}
      </p>
    </>
  );
}

function OfficeFriendly({ list }: { list: Envelope<DistrictCard>[] }) {
  const offices = uniqueOffices(list.map((e) => e.data));
  const { rows } = officeCompare(offices);
  const compareRows: CompareRow[] = rows.map((r) => {
    const current = r.values.house ?? r.values.nep;
    const baseline = r.values.gaa2026;
    const delta = current != null && baseline != null ? current - baseline : null;
    const pct = delta != null && baseline ? (delta / baseline) * 100 : null;
    return {
      id: r.id,
      label: deoShort(r.full),
      deltaPhp: delta,
      pct,
      currentPhp: current,
      baselinePhp: baseline,
      baselineLabel: 'last year',
      currentLabel: '2027 House / proposal',
    };
  });
  return <FriendlyCompare title="District offices vs last year" rows={compareRows} />;
}
