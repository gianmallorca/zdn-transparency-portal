import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DistrictCard, Envelope } from '../api/types';
import { Await } from '../components/Bits';
import FriendlyCompare, { type CompareRow } from '../components/visual/FriendlyCompare';
import ProjectCard from '../components/visual/ProjectCard';
import TownPanel from '../components/visual/TownPanel';
import { shortNameOf } from '../config';
import { deoShort, officeCompare, uniqueOffices } from '../lib/charts';
import { count, plural } from '../lib/format';
import { usePortal } from '../lib/portal-context';
import type { ScopedProject } from '../lib/scope';
import { groupByTown, TOWN_LABEL, type TownBucket } from '../lib/towns';
import { useTitle } from '../lib/use-title';

type Focus = 'town' | 'changed' | 'health' | 'house' | '';

export default function Explore() {
  const { scope, config } = usePortal();
  const [params] = useSearchParams();
  const focus = (params.get('focus') ?? '') as Focus;
  useTitle(`Explore · ${shortNameOf(config)}`);

  return (
    <main className="page main">
      <Await state={scope} what="projects">
        {(s) => <ExploreBody projects={s.projects} focus={focus} />}
      </Await>
    </main>
  );
}

function ExploreBody({ projects, focus }: { projects: ScopedProject[]; focus: Focus }) {
  const { districts, config } = usePortal();
  const name = shortNameOf(config);
  const { towns, districtWide } = useMemo(() => groupByTown(projects), [projects]);
  const [bucket, setBucket] = useState<TownBucket | null>(null);

  const health = useMemo(() => projects.filter((p) => p.dataset === 'hfep'), [projects]);
  const houseOnly = useMemo(() => projects.filter((p) => p.bridge_group === 'house_only'), [projects]);

  const title =
    focus === 'town' ? "What's being built in my town?"
    : focus === 'changed' ? 'What changed from last year?'
    : focus === 'health' ? 'Which health projects are funded?'
    : focus === 'house' ? 'What did Congress add?'
    : 'Explore projects';

  return (
    <>
      <header className="visual-hero">
        <p className="eyebrow"><Link to="/">Map</Link><span className="sep">·</span>Explore</p>
        <h1>{title}</h1>
        <p className="lede">Live figures for {name} from the BetterGov Budget API.</p>
      </header>

      {(focus === 'town' || focus === '') && (
        <section className="section" aria-labelledby="town-pick-h">
          <h2 id="town-pick-h" className="section-h">Pick a town</h2>
          <div className="town-picker">
            {towns.map((t) => (
              <button key={t.townId} type="button" className="town-pick-btn" onClick={() => setBucket(t)}>
                <span>{TOWN_LABEL[t.townId] ?? t.label}</span>
                <span className="muted">{plural(t.projects.length, 'project')}</span>
              </button>
            ))}
          </div>
          {districtWide.length > 0 && (
            <>
              <h3 className="friendly-compare-h">District-wide</h3>
              <div className="town-picker">
                {districtWide.map((b) => (
                  <button key={b.label} type="button" className="town-pick-btn" onClick={() => setBucket(b)}>
                    <span>{b.label}</span>
                    <span className="muted">{plural(b.projects.length, 'project')}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {focus === 'changed' && (
        <Await state={districts} what="office year comparisons">
          {(list) => <YearCompare list={list} />}
        </Await>
      )}

      {focus === 'health' && (
        <section className="section" aria-labelledby="health-h">
          <h2 id="health-h" className="section-h">{plural(health.length, 'health project')}</h2>
          <div className="pcard-grid">
            {health.map((p) => <ProjectCard key={p.key} project={p} />)}
          </div>
          {health.length === 0 && <p className="state">No health-facility lines in scope.</p>}
        </section>
      )}

      {focus === 'house' && (
        <section className="section" aria-labelledby="house-h">
          <h2 id="house-h" className="section-h">{count(houseOnly.length)} lines only in the House bill</h2>
          <p className="section-lede">These are insertion candidates to check — not confirmed additions.</p>
          <div className="pcard-grid">
            {houseOnly.map((p) => <ProjectCard key={p.key} project={p} />)}
          </div>
          {houseOnly.length === 0 && <p className="state">No House-only lines in scope.</p>}
        </section>
      )}

      <p className="fine"><Link to="/data">See the full data</Link><span className="sep">·</span><Link to="/">Back to the map</Link></p>
      <TownPanel bucket={bucket} onClose={() => setBucket(null)} />
    </>
  );
}

function YearCompare({ list }: { list: Envelope<DistrictCard>[] }) {
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
      baselineLabel: 'last year (2026 enacted)',
      currentLabel: '2027 House / proposal',
    };
  });

  return (
    <FriendlyCompare
      title="Each district office vs last year’s enacted budget"
      rows={compareRows}
    />
  );
}
