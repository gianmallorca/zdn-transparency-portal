import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { DistrictCard, Envelope, HgabDocument, NepRollupRow } from '../api/types';
import { Await, External } from '../components/Bits';
import FriendlyCompare, { type CompareRow } from '../components/visual/FriendlyCompare';
import HearingsMentions from '../components/visual/HearingsMentions';
import RelatableStat from '../components/visual/RelatableStat';
import InfoTip from '../components/visual/InfoTip';
import { shortNameOf } from '../config';
import { deoShort, officeCompare, uniqueOffices } from '../lib/charts';
import { count, php, plural } from '../lib/format';
import { POPULATION_CITATION, PROVINCE_POPULATION } from '../lib/population';
import { usePortal } from '../lib/portal-context';
import { summarise, type ScopedProject } from '../lib/scope';
import { useTitle } from '../lib/use-title';

const STEPS = [
  { id: 'step-source', n: 1, label: 'Source' },
  { id: 'step-nep', n: 2, label: 'Proposal' },
  { id: 'step-house', n: 3, label: 'House' },
  { id: 'step-meaning', n: 4, label: 'Local impact' },
  { id: 'step-hearings', n: 5, label: 'Hearings' },
  { id: 'step-region', n: 6, label: 'Region' },
] as const;

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
  const { config, districts, client } = usePortal();
  const name = shortNameOf(config);
  const summary = useMemo(() => summarise(projects), [projects]);
  const houseOnly = summary.groups.house_only;
  const [docs, setDocs] = useState<HgabDocument[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .documents()
      .then((res) => {
        if (!cancelled) setDocs(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <>
      <header className="visual-hero story-hero">
        <p className="eyebrow">Story mode</p>
        <h1>How the 2027 budget reaches {name}</h1>
        <p className="lede">
          Follow the path from the national proposal to what shows up for {name}. Every figure is live from the BetterGov Budget API.
        </p>
        <nav className="story-jump" aria-label="Story steps">
          {STEPS.map((s) => (
            <a key={s.id} className="story-jump-link" href={`#${s.id}`}>
              <span className="story-jump-n" aria-hidden="true">{s.n}</span>
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <ol className="story-timeline">
        <li className="story-node" id="step-source">
          <div className="story-marker" aria-hidden="true">
            <span className="story-dot">1</span>
          </div>
          <article className="story-step">
            <p className="story-phase">National budget</p>
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
        </li>

        <li className="story-node" id="step-nep">
          <div className="story-marker" aria-hidden="true">
            <span className="story-dot">2</span>
          </div>
          <article className="story-step">
            <p className="story-phase">Executive</p>
            <h2>
              The President’s proposal{' '}
              <InfoTip label="What is NEP?" title="NEP">
                The National Expenditure Program is the budget the President submits to Congress.
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
        </li>

        <li className="story-node" id="step-house">
          <div className="story-marker" aria-hidden="true">
            <span className="story-dot">3</span>
          </div>
          <article className="story-step">
            <p className="story-phase">Congress</p>
            <h2>
              What the House changed{' '}
              <InfoTip label="Why compare?" title="House bill">
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
        </li>

        <li className="story-node" id="step-meaning">
          <div className="story-marker" aria-hidden="true">
            <span className="story-dot">4</span>
          </div>
          <article className="story-step">
            <p className="story-phase">On the ground</p>
            <h2>
              What this means for {name}{' '}
              <InfoTip label="What's this?" title="District comparison">
                Each district engineering office compared with last year’s enacted budget. Green means more; gray means less.
              </InfoTip>
            </h2>
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
        </li>

        <li className="story-node" id="step-hearings">
          <div className="story-marker" aria-hidden="true">
            <span className="story-dot">5</span>
          </div>
          <article className="story-step">
            <p className="story-phase">Deliberation</p>
            <h2>
              What was said in Congress{' '}
              <InfoTip label="What's this?" title="Hearing mentions">
                Budget API summaries of House appropriations hearings that mention {name}. Quoted “said” lines are exact; no commentary added.
              </InfoTip>
            </h2>
            <p>House appropriations hearing topics and spoken moments that mention {name}.</p>
            <div className="story-visual">
              <HearingsMentions
                query="Zamboanga del Norte"
                emptyMessage="No hearing mentions found"
                showHeading={false}
              />
            </div>
          </article>
        </li>

        <li className="story-node is-last" id="step-region">
          <div className="story-marker" aria-hidden="true">
            <span className="story-dot">6</span>
          </div>
          <article className="story-step">
            <p className="story-phase">Wider context</p>
            <h2>
              Region IX context{' '}
              <InfoTip label="What's this?" title="Region rollup">
                The NEP’s region rollup for Zamboanga Peninsula — every agency, not only this portal’s ZDN lines.
              </InfoTip>
            </h2>
            <div className="story-visual">
              <RegionIxCard />
            </div>
          </article>
        </li>
      </ol>

      <section className="story-sources" aria-labelledby="sources-h">
        <h2 id="sources-h" className="section-h">See the full data</h2>
        <p className="section-lede">
          Source documents behind the 2027 comparison. PDF page ranges are file positions (what #page=N uses), not the numbers printed on the pages.
        </p>
        {docs == null && (
          <p className="state" role="status">
            <span className="spinner" aria-hidden="true" /> Loading documents…
          </p>
        )}
        {docs != null && docs.length === 0 && (
          <p className="section-empty">No source documents returned.</p>
        )}
        {docs != null && docs.length > 0 && (
          <ul className="source-doc-list">
            {docs.map((d) => (
              <li key={d.key}>
                <p className="source-doc-title">
                  {d.source_url ? <External href={d.source_url}>{d.title}</External> : d.title}
                </p>
                <p className="fine">
                  {d.stage_label}
                  {d.pages && (
                    <>
                      <span className="sep">·</span>
                      PDF pages {d.pages.from}–{d.pages.to}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="story-foot">
          <div className="story-foot-links">
            <Link to="/">Back to the map</Link>
            <Link to="/explore">Explore by town</Link>
            <Link to="/data">Tables and charts</Link>
            <Link to="/about">About the data</Link>
          </div>
          <p className="fine">Population: {POPULATION_CITATION}</p>
        </div>
      </section>
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
  return (
    <FriendlyCompare
      title="District offices vs last year"
      rows={compareRows}
      emptyMessage="No district office comparison available for this portal"
    />
  );
}

function RegionIxCard() {
  const { client } = usePortal();
  const [row, setRow] = useState<NepRollupRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .nepRegionRollup()
      .then((res) => {
        if (cancelled) return;
        const hit =
          res.data.find((r) => /region ix/i.test(r.description) || r.code === '09') ?? null;
        setRow(hit);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (error) {
    return (
      <p className="state state-error" role="alert">
        Could not load region rollup. {error}
      </p>
    );
  }
  if (row === undefined) {
    return (
      <p className="state" role="status">
        <span className="spinner" aria-hidden="true" /> Loading Region IX…
      </p>
    );
  }
  if (row == null) {
    return <p className="section-empty">No Region IX row in the NEP region rollup.</p>;
  }

  const delta = row.amount - row.base_amount;
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;

  return (
    <div className={`region-ix-card dir-${dir}`}>
      <p className="label">{row.description}</p>
      <p className="region-ix-line">
        <span className={`friendly-arrow dir-${dir}`} aria-hidden="true">
          <Icon size={28} strokeWidth={2.25} />
        </span>
        <span>
          <span className="num">{php(row.amount)}</span>
          <span className="muted"> vs </span>
          <span className="num">{php(row.base_amount)}</span>
          <span className="muted"> baseline</span>
        </span>
      </p>
      <p className="fine">All agencies, whole Region IX — not only ZDN.</p>
    </div>
  );
}
