/**
 * Charts for the portal's own figures. Bars are decorative; every amount is
 * also text. The NEP and the House bill are drawn as two columns, never one
 * total. A missing amount is a dash, not a zero-height bar standing for ₱0.
 */
import { Link } from 'react-router-dom';
import type { DistrictCard, DistrictOffice, Envelope } from '../api/types';
import { GAA_YEARS } from '../api/types';
import { php, phpDelta, phpFull, plural } from '../lib/format';
import {
  changeMax, columnTotal, compareMax, deoShort, districtShares, extremeMove, largestInGroup, largestInHouse,
  officeChanges, officeCompare, officeShares, officeTrends, programShares, PROGRAM_PLAIN, sharePct,
  uniqueOffices, type ChangePart, type ChangeRow, type CompareSeries, type ShareRow, type TrendSeries,
  type VersionMoney,
} from '../lib/charts';
import { usePortal } from '../lib/portal-context';
import type { ScopedProject } from '../lib/scope';
import { Await, StatusChip } from './Bits';

const TREND_COLORS = ['var(--ink)', 'var(--accent)', 'var(--positive)', 'var(--neutral)'];

const CHANGE_LEGEND: { group: ChangePart['group']; sw: string; text: string }[] = [
  { group: 'house_only', sw: 'k-house', text: 'In the House bill only · insertion candidates' },
  { group: 'increased', sw: 'k-up', text: 'Higher in the House bill' },
  { group: 'nep_only', sw: 'k-cut', text: 'In the NEP only · deletion candidates' },
  { group: 'decreased', sw: 'k-down', text: 'Lower in the House bill' },
];

export default function Figures({ projects }: { projects: ScopedProject[] }) {
  const { districts } = usePortal();
  return (
    <section className="section" id="charts" aria-labelledby="charts-h">
      <h2 id="charts-h" className="section-h">The same figures, set side by side</h2>
      <p className="section-lede">
        Each chart uses amounts already published for this province. The NEP and the House bill are two versions of the 2027
        budget: they are compared, never added. A dash means that document has no such figure, not zero. Lines that appear in
        only one version are candidates to check, not confirmed insertions or deletions.
      </p>

      <Await state={districts} what="office charts">
        {(list) => <OfficeCharts list={list} />}
      </Await>

      <ProgramShare projects={projects} />
      <Largest projects={projects} />
    </section>
  );
}

function OfficeCharts({ list }: { list: Envelope<DistrictCard>[] }) {
  const cards = list.map((e) => e.data);
  const offices = uniqueOffices(cards);
  if (!offices.length) return null;
  const districts = districtShares(cards);
  return (
    <>
      <Compare offices={offices} />
      <Change offices={offices} />
      <Share
        heading="Named projects, by office"
        note="Each office’s own 2027 ledger of named projects. The two columns are the two documents: a percent is a share of that column, not of a combined budget. Lines listed under the Central Office, or found only because the title names the province, are not in these bars."
        rows={officeShares(offices)}
        houseScope="named projects"
        nepScope="named projects"
      />
      {districts.some((d) => d.hint) && (
        <Share
          heading="Named projects, by legislative district"
          note="A district is the sum of the offices that serve only that district. An office serving more than one district is not split, so it stays out of these bars."
          rows={districts}
          houseScope="named projects"
          nepScope="named projects"
        />
      )}
    </>
  );
}

function Compare({ offices }: { offices: DistrictOffice[] }) {
  const { series, rows } = officeCompare(offices);
  const max = compareMax(rows);
  return (
    <figure className="chart">
      <figcaption>
        <h3 className="sub-h">2025 and 2026, then the two 2027 proposals</h3>
        <p>
          The enacted years and the 2027 NEP are the whole office. The 2027 House bill is named projects only, so its bar is
          not the rest of the same total and is not added to the NEP.
        </p>
      </figcaption>
      <ul className="legend">
        {series.map((s) => (
          <li key={s.key}><i className={`sw ${s.sw}`} aria-hidden="true" />{s.label} · {s.scope}</li>
        ))}
      </ul>
      <ul className="cmp">
        {rows.map((row) => (
          <li key={row.id} className="cmp-office">
            <Link to={`/gaa#${row.id}`} title={row.full}>{row.short}</Link>
            <ul>
              {series.map((s) => (
                <SeriesLine key={s.key} series={s} value={row.values[s.key]} max={max} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function SeriesLine({ series, value, max }: { series: CompareSeries; value: number | null; max: number }) {
  return (
    <li className="cmp-line">
      <span>
        <span className="label">{series.label}</span>
        <span className="cmp-scope">{series.scope}</span>
      </span>
      <span className="num">{php(value)}</span>
      <span className="hbar" aria-hidden="true">
        {value != null && value > 0 && <span className={series.sw} style={{ width: `${(value / max) * 100}%` }} />}
      </span>
    </li>
  );
}

function Change({ offices }: { offices: DistrictOffice[] }) {
  const rows = officeChanges(offices);
  const max = changeMax(rows);
  const present = new Set(rows.flatMap((r) => [...r.plus, ...r.minus].map((p) => p.group)));
  const anyReview = rows.some((r) => r.scopeReview > 0);
  const anyHeld = rows.some((r) => r.heldOut > 0);
  const anyUnconfirmed = rows.some((r) => r.unconfirmed > 0);
  return (
    <figure className="chart">
      <figcaption>
        <h3 className="sub-h">What the House bill changed, by office</h3>
        <p>
          Named projects on one ledger, so the two versions can be compared. Bars grow from the center: House-bill-only
          candidates to the right, NEP-only candidates to the left. Unchanged lines are left out. The number is the office’s
          net, House bill minus NEP, not a sum of the two documents.
        </p>
      </figcaption>
      <ul className="legend">
        {CHANGE_LEGEND.filter((item) => present.has(item.group)).map((item) => (
          <li key={item.group}><i className={`sw ${item.sw}`} aria-hidden="true" />{item.text}</li>
        ))}
      </ul>
      <ul className="divs">
        {rows.map((row) => <ChangeLine key={row.id} row={row} max={max} />)}
      </ul>
      {(anyReview || anyHeld || anyUnconfirmed) && (
        <p className="fine">
          {anyUnconfirmed && <>Unconfirmed matches are included in the House-bill-only candidates and flagged on the office cards. </>}
          {anyReview && <>A different stretch of the same road is not counted as a change. </>}
          {anyHeld && <>Lines whose two versions name different offices are held out of these bars.</>}
        </p>
      )}
    </figure>
  );
}

function ChangeLine({ row, max }: { row: ChangeRow; max: number }) {
  const width = (amount: number) => `${(amount / max) * 100}%`;
  return (
    <li className="div-row">
      <Link to={`/gaa#${row.id}`} title={row.full}>{row.short}</Link>
      <div className="div-track" aria-hidden="true">
        <span className="div-side neg">
          {row.minus.map((p) => <span key={p.group} className={partClass(p)} style={{ width: width(p.amount) }} />)}
        </span>
        <span className="div-side pos">
          {row.plus.map((p) => <span key={p.group} className={partClass(p)} style={{ width: width(p.amount) }} />)}
        </span>
      </div>
      <span className={`num delta ${row.net != null && row.net > 0 ? 'up' : row.net != null && row.net < 0 ? 'down' : ''}`}>{phpDelta(row.net)}</span>
      <p className="div-parts">
        <PartList parts={row.plus} sign="+" />
        <PartList parts={row.minus} sign="−" />
        {!row.plus.length && !row.minus.length && <span className="muted">No change on the named-project ledger.</span>}
      </p>
    </li>
  );
}

function partClass(p: ChangePart): string {
  if (p.group === 'increased') return 'k-up';
  if (p.group === 'decreased') return 'k-down';
  if (p.group === 'nep_only') return 'k-cut';
  return 'k-house';
}

function PartList({ parts, sign }: { parts: ChangePart[]; sign: '+' | '−' }) {
  if (!parts.length) return null;
  return (
    <>
      {parts.map((p) => (
        <span key={p.group}>{p.label} {sign}{php(p.amount)} · {plural(p.rows, 'line')}</span>
      ))}
    </>
  );
}

function Share({
  heading, note, rows, houseScope, nepScope, footnote,
}: {
  heading: string;
  note: string;
  rows: ShareRow[];
  houseScope: string;
  nepScope: string;
  footnote?: string;
}) {
  const houseTotal = columnTotal(rows, 'house');
  const nepTotal = columnTotal(rows, 'nep');
  return (
    <figure className="chart">
      <figcaption>
        <h3 className="sub-h">{heading}</h3>
        <p>{note}</p>
      </figcaption>
      <div className="share" role="table" aria-label={heading}>
        <div className="share-row share-head" role="row">
          <span role="columnheader" />
          <span role="columnheader">House bill<span className="cmp-scope">{houseScope} · {php(houseTotal)}</span></span>
          <span role="columnheader">NEP<span className="cmp-scope">{nepScope} · {php(nepTotal)}</span></span>
        </div>
        {rows.map((row) => (
          <div className="share-row" role="row" key={row.id}>
            <span role="rowheader" title={row.title}>
              {row.label}
              {row.hint && <span className="cmp-scope">{row.hint}</span>}
            </span>
            <ShareCell doc="House bill" money={row.house} total={houseTotal} sw="k-house" />
            <ShareCell doc="NEP" money={row.nep} total={nepTotal} sw="k-nep" />
          </div>
        ))}
      </div>
      {footnote && <p className="fine">{footnote}</p>}
    </figure>
  );
}

function ShareCell({ doc, money, total, sw }: { doc: string; money: VersionMoney; total: number | null; sw: string }) {
  const pct = sharePct(money.php, total);
  const width = money.php != null && total ? `${Math.min(100, (money.php / total) * 100)}%` : '0%';
  return (
    <span role="cell">
      <span className="share-doc label">{doc}</span>
      <span className="share-fig num">{php(money.php)}{money.php != null && <> · {pct}</>}</span>
      <span className="hbar" aria-hidden="true">
        {money.php != null && money.php > 0 && <span className={sw} style={{ width }} />}
      </span>
    </span>
  );
}

function ProgramShare({ projects }: { projects: ScopedProject[] }) {
  const { rows, absent } = programShares(projects);
  if (!rows.length) return null;
  const who = absent.map((k) => PROGRAM_PLAIN[k]).join(' and ');
  return (
    <Share
      heading="2027 projects in this portal, by program"
      note="Every line this portal lists, including a project found because its title names the province. Again the columns are separate documents. A program with no amount in a document shows a dash."
      rows={rows}
      houseScope="lines with a House bill amount"
      nepScope="lines with an NEP amount"
      footnote={absent.length ? `${who}: no line in this portal names the province, so ${absent.length === 1 ? 'it is' : 'they are'} not in the bars.` : undefined}
    />
  );
}

function Largest({ projects }: { projects: ScopedProject[] }) {
  const house = largestInHouse(projects);
  const added = largestInGroup(projects, 'house_only');
  const cut = largestInGroup(projects, 'nep_only');
  const up = extremeMove(projects, 'up');
  const down = extremeMove(projects, 'down');
  if (!house.length && !added.length && !cut.length) return null;
  return (
    <div className="chart">
      <h3 className="sub-h">The largest lines</h3>
      <p>
        Ranked within one document. The bar is that document’s amount, not a total of NEP and House bill.
      </p>
      {house.length > 0 && (
        <RankedList
          heading="Largest in the House bill"
          rows={house}
          sw="k-house"
          lead={(r) => php(r.house)}
        />
      )}
      <div className="rank-grid">
        {added.length > 0 && (
          <RankedList
            heading="Largest House-bill-only candidates"
            rows={added}
            sw="k-house"
            lead={(r) => php(r.house)}
          />
        )}
        {cut.length > 0 && (
          <RankedList
            heading="Largest NEP-only candidates"
            rows={cut}
            sw="k-cut"
            lead={(r) => php(r.nep)}
          />
        )}
      </div>
      {(up || down) && (
        <p className="fine">
          {up && <MoveNote dir="up" project={up.project} count={up.count} />}
          {up && down && ' '}
          {down && <MoveNote dir="down" project={down.project} count={down.count} />}
        </p>
      )}
    </div>
  );
}

function MoveNote({ dir, project, count }: { dir: 'up' | 'down'; project: ScopedProject; count: number }) {
  const word = dir === 'up' ? 'higher' : 'lower';
  return (
    <>
      {plural(count, 'matched line is', 'matched lines are')} {word} in the House bill than in the NEP.
      {' '}The largest {dir === 'up' ? 'raise' : 'cut'} is{' '}
      <Link to={`/projects/${project.dataset}/${encodeURIComponent(project.id)}`}>{project.title}</Link>
      {' '}({phpDelta(project.delta_php)}).
    </>
  );
}

function RankedList({
  heading, rows, sw, lead,
}: {
  heading: string;
  rows: ReturnType<typeof largestInHouse>;
  sw: string;
  lead: (row: ReturnType<typeof largestInHouse>[number]) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.bar));
  return (
    <div className="ranks">
      <h4 className="label ranks-h">{heading}</h4>
      <ol>
        {rows.map((r) => (
          <li key={r.key}>
            <Link to={r.href} className="rank-title">{r.title}</Link>
            <span className="rank-meta">
              <StatusChip group={r.group} label={r.status} held={r.held} />
              <span className="label">{PROGRAM_PLAIN[r.dataset]}</span>
              {r.office && <span>{deoShort(r.office)}</span>}
            </span>
            <span className="hbar" aria-hidden="true"><span className={sw} style={{ width: `${(r.bar / max) * 100}%` }} /></span>
            <span className="rank-figs num">
              <strong>{lead(r)}</strong>
              <span className="muted">NEP {php(r.nep)} · House {php(r.house)} · {phpDelta(r.delta)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const TREND_W = 800;
const TREND_H = 280;
const TREND_PAD = { l: 64, r: 16, t: 16, b: 32 };

export function OfficeTrend({ offices }: { offices: DistrictOffice[] }) {
  const series = officeTrends(offices);
  const known = series.flatMap((s) => s.points.map((p) => p.php)).filter((n): n is number => n != null);
  if (!known.length) return null;
  const max = Math.max(...known);
  const innerW = TREND_W - TREND_PAD.l - TREND_PAD.r;
  const innerH = TREND_H - TREND_PAD.t - TREND_PAD.b;
  const x = (i: number) => TREND_PAD.l + (i / (GAA_YEARS.length - 1)) * innerW;
  const y = (v: number) => TREND_PAD.t + (1 - v / max) * innerH;
  const ticks = [0, max / 2, max];
  return (
    <figure className="chart" id="office-trend">
      <figcaption>
        <h3 className="sub-h">Enacted budget, 2020–2026, one line per office</h3>
        <p>
          The whole office, as the GAA lists it. A gap means that year’s GAA did not list the office, not a budget of zero.
          The 2027 NEP and House bill are proposals, so they are not on this line.
        </p>
      </figcaption>
      <ul className="legend">
        {series.map((s, i) => (
          <li key={s.id}><i className="sw sw-line" style={{ background: TREND_COLORS[i % TREND_COLORS.length] }} aria-hidden="true" />{s.full}</li>
        ))}
      </ul>
      <div className="trend-scroll">
        <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} role="img" aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={TREND_PAD.l} x2={TREND_W - TREND_PAD.r} y1={y(t)} y2={y(t)} stroke="var(--rule-soft)" />
              <text x={TREND_PAD.l - 8} y={y(t) + 4} textAnchor="end" fill="var(--ink-3)" fontSize="12">{php(t)}</text>
            </g>
          ))}
          {GAA_YEARS.map((year, i) => (
            <text key={year} x={x(i)} y={TREND_H - 8} textAnchor="middle" fill="var(--ink-3)" fontSize="12">{year}</text>
          ))}
          {series.map((s, i) => <TrendLine key={s.id} series={s} color={TREND_COLORS[i % TREND_COLORS.length]} x={x} y={y} />)}
        </svg>
      </div>
      <table className="sr-only">
        <caption>Enacted DPWH office budgets, 2020 to 2026, in pesos. A blank cell means the office was not listed that year.</caption>
        <thead>
          <tr>
            <th scope="col">Office</th>
            {GAA_YEARS.map((year) => <th key={year} scope="col">{year}</th>)}
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.id}>
              <th scope="row">{s.full}</th>
              {s.points.map((p) => <td key={p.year}>{p.php == null ? 'Not listed' : phpFull(p.php)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function TrendLine({
  series, color, x, y,
}: {
  series: TrendSeries;
  color: string;
  x: (i: number) => number;
  y: (v: number) => number;
}) {
  const segments: string[] = [];
  let current = '';
  series.points.forEach((p, i) => {
    if (p.php == null) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.php).toFixed(1)}`;
  });
  if (current) segments.push(current);
  return (
    <g>
      {segments.map((d) => <path key={d} d={d} fill="none" stroke={color} strokeWidth="2.5" />)}
      {series.points.map((p, i) => p.php != null && (
        <circle key={p.year} cx={x(i)} cy={y(p.php)} r="4" fill={color}>
          <title>{`${series.full}, ${p.year}: ${phpFull(p.php)}`}</title>
        </circle>
      ))}
    </g>
  );
}
