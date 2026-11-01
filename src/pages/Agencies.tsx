/**
 * /agencies — every ZDN-attributable line across departments: NEP FY2027
 * operating units and agencies, GAA 2020–2026 programs, and House-bill rows
 * for the four project lists. NEP and House amounts stay in separate columns.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GAA_YEARS } from '../api/types';
import { shortNameOf } from '../config';
import { Disclaimers, External } from '../components/Bits';
import { PageHead } from '../components/Chrome';
import {
  agenciesCsv, loadAgencies, type AgenciesResult, type AgencyLine, type DeptTotal,
} from '../lib/agencies';
import { downloadText } from '../lib/csv';
import { count, php, phpFull, plural } from '../lib/format';
import { departmentShort } from '../lib/gaa';
import { usePortal, type Async } from '../lib/portal-context';
import { useTitle } from '../lib/use-title';
import { ZDN_MATCH_RULES } from '../lib/zdn';

const PAGE = 80;
const SOURCE_LABEL: Record<AgencyLine['source'], string> = {
  'nep-ou': 'NEP operating unit',
  'nep-agency': 'NEP agency',
  gaa: 'GAA program',
  hgab: 'House bill / NEP project',
};

export default function Agencies() {
  const { config, client, scope } = usePortal();
  const name = shortNameOf(config);
  useTitle(`All agencies · ${name}`);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [state, setState] = useState<Async<AgenciesResult>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    // Async agency rollup; progress callbacks update UI after the fetch starts.
    const run = () => {
      setState({ status: 'loading' });
      loadAgencies(client, (done, total) => live && setProgress({ done, total })).then(
        (value) => live && setState({ status: 'ready', value }),
        (error) => live && setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
      );
    };
    queueMicrotask(run);
    return () => {
      live = false;
    };
  }, [client, attempt]);

  const disclaimers = scope.status === 'ready' ? scope.value.disclaimers : [];

  return (
    <main className="page main">
      <PageHead
        eyebrow={<>All agencies<span className="sep">·</span>{name}</>}
        title={
          state.status === 'ready'
            ? `${plural(state.value.lines.length, 'budget line')} matched to ${name}`
            : `Every agency’s ZDN lines we can read from the Budget API`
        }
      >
        <p>
          Beyond DPWH roads, farm-to-market roads, health facilities and irrigation: DepEd divisions and schools,
          JRMSU, DENR PENRO, provincial hospitals, DAR, and every other department line whose operating unit or
          title names {name}. Amounts are budgeted, not spent. The NEP and the House bill are compared, never added.
        </p>
      </PageHead>

      {state.status === 'loading' ? (
        <div className="state" role="status">
          <span className="spinner" aria-hidden="true" /> Reading NEP operating units, GAA programs and House bill lines
          {progress && progress.total > 0 && <> · {count(progress.done)} of {count(progress.total)}</>}…
        </div>
      ) : state.status === 'error' ? (
        <div className="state state-error" role="alert">
          <p><strong>Could not load agency lines.</strong> {state.error.message}</p>
          <button type="button" className="button" onClick={() => { setState({ status: 'loading' }); setAttempt((n) => n + 1); }}>Try again</button>
        </div>
      ) : (
        <AgenciesView result={state.value} />
      )}

      <section className="section" aria-labelledby="ag-rules-h">
        <h2 id="ag-rules-h" className="section-h">How a line is matched to {name}</h2>
        <ul className="plain-list fine-list">
          {ZDN_MATCH_RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="fine">
          Full methodology: <Link to="/about#zdn-match-h">About the data</Link>.
        </p>
      </section>

      {disclaimers.length > 0 && (
        <section className="section" aria-labelledby="ag-disc-h">
          <h2 id="ag-disc-h" className="section-h">Notices</h2>
          <Disclaimers items={disclaimers} />
        </section>
      )}
    </main>
  );
}

function AgenciesView({ result }: { result: AgenciesResult }) {
  const { config } = usePortal();
  const { lines, totals, gaps } = result;
  const nepTotal = totals.reduce((a, t) => a + t.nep_php, 0);
  const houseTotal = totals.reduce((a, t) => a + t.house_php, 0);

  return (
    <>
      <section className="section" aria-labelledby="ag-tot-h">
        <h2 id="ag-tot-h" className="section-h">By department</h2>
        <p className="section-lede">
          NEP FY2027 figures are matched operating units and agencies only. House-bill figures are named projects in the
          four program lists. Enacted GAA years are program families whose names match. Columns are separate documents.
        </p>
        <DeptChart totals={totals} nepTotal={nepTotal} />
        <div className="table ag-dept" role="table" aria-label="Department totals">
          <div className="tr th" role="row">
            <span role="columnheader">Department</span>
            <span role="columnheader" className="r">NEP 2027</span>
            <span role="columnheader" className="r">House bill</span>
            <span role="columnheader" className="r">GAA 2026</span>
            <span role="columnheader" className="r">Lines</span>
          </div>
          {totals.map((t) => (
            <div className="tr" role="row" key={t.department_id}>
              <span role="cell"><strong>{t.short}</strong></span>
              <span role="cell" className="r num" data-label="NEP 2027" title={t.nep_rows ? phpFull(t.nep_php) : undefined}>
                {t.nep_rows ? php(t.nep_php) : '—'}
              </span>
              <span role="cell" className="r num" data-label="House bill" title={t.house_rows ? phpFull(t.house_php) : undefined}>
                {t.house_rows ? php(t.house_php) : '—'}
              </span>
              <span role="cell" className="r num" data-label="GAA 2026" title={t.gaa['2026'].rows ? phpFull(t.gaa['2026'].php) : undefined}>
                {t.gaa['2026'].rows ? php(t.gaa['2026'].php) : '—'}
              </span>
              <span role="cell" className="r num" data-label="Lines">{count(t.lines)}</span>
            </div>
          ))}
          <div className="tr" role="row">
            <span role="cell"><strong>Listed departments</strong></span>
            <span role="cell" className="r num" data-label="NEP 2027">{nepTotal ? php(nepTotal) : '—'}</span>
            <span role="cell" className="r num" data-label="House bill">{houseTotal ? php(houseTotal) : '—'}</span>
            <span role="cell" className="r num" data-label="GAA 2026">—</span>
            <span role="cell" className="r num" data-label="Lines">{count(lines.length)}</span>
          </div>
        </div>
        <p className="fine">
          The NEP column ({php(nepTotal)}) and the House bill column ({php(houseTotal)}) are two versions of FY2027 — never
          one total. GAA 2026 is enacted law for a prior year.
        </p>
      </section>

      <section className="section" aria-labelledby="ag-gap-h">
        <h2 id="ag-gap-h" className="section-h">What these figures cannot show</h2>
        <ul className="plain-list fine-list">
          {gaps.filter((g) => result.totals.some((t) => t.department_id === g.department_id) || ['05', '20', '14', '10', '13', '07', '18', '08'].includes(g.department_id)).map((g) => (
            <li key={g.department_id}><strong>{g.short}.</strong> {g.note}</li>
          ))}
        </ul>
      </section>

      <LineTable lines={lines} fileStem={config.id} />
    </>
  );
}

function DeptChart({ totals, nepTotal }: { totals: DeptTotal[]; nepTotal: number }) {
  const rows = totals.filter((t) => t.nep_php > 0).slice(0, 12);
  if (!rows.length || nepTotal <= 0) return null;
  return (
    <figure className="chart">
      <figcaption>
        <h3 className="sub-h">NEP FY2027 share by department</h3>
        <p>Each bar is that department’s matched NEP operating units and agencies as a share of the NEP column above — not of the national budget, and not including the House bill.</p>
      </figcaption>
      <div className="ag-share" role="list">
        {rows.map((t) => {
          const pct = (t.nep_php / nepTotal) * 100;
          return (
            <div className="ag-share-row" role="listitem" key={t.department_id}>
              <span className="ag-share-label" title={t.department}>{t.short}</span>
              <span className="ag-share-track" aria-hidden="true">
                <span className="ag-share-fill k-nep" style={{ '--p': `${pct}%` } as CSSProperties} />
              </span>
              <span className="ag-share-fig num">
                {php(t.nep_php)}
                <span className="muted"> · {pct.toFixed(0)}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function LineTable({ lines, fileStem }: { lines: AgencyLine[]; fileStem: string }) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const dept = params.get('dept') ?? '';
  const source = params.get('source') ?? '';
  const sort = params.get('sort') ?? 'nep';
  const [shown, setShown] = useState(PAGE);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setShown(PAGE);
  };

  const departments = useMemo(() => {
    const n = new Map<string, { label: string; rows: number }>();
    for (const r of lines) {
      const d = n.get(r.department_id) ?? { label: departmentShort(r.department), rows: 0 };
      d.rows++;
      n.set(r.department_id, d);
    }
    return [...n.entries()].sort((a, b) => b[1].rows - a[1].rows);
  }, [lines]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    let rows = lines.filter((r) => {
      if (dept && r.department_id !== dept) return false;
      if (source && r.source !== source) return false;
      if (words.length) {
        const hay = `${r.title} ${r.department} ${r.agency ?? ''} ${r.operating_unit ?? ''} ${r.program ?? ''}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const amount = (r: AgencyLine) => {
      if (sort === 'house') return r.house_php ?? -1;
      if (sort === 'gaa') return r.gaa['2026'] ?? -1;
      if (sort === 'title') return null;
      return r.nep_php ?? -1;
    };
    rows = [...rows].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      return (amount(b) ?? -1) - (amount(a) ?? -1) || a.title.localeCompare(b.title);
    });
    return rows;
  }, [lines, q, dept, source, sort]);

  const narrowed = filtered.length !== lines.length;

  return (
    <section className="section" id="lines" aria-labelledby="ag-list-h">
      <div className="list-head">
        <h2 id="ag-list-h" className="section-h">
          {narrowed ? `${count(filtered.length)} of ${plural(lines.length, 'line')}` : `Every matched line (${count(lines.length)})`}
        </h2>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => downloadText(`${fileStem}-all-agencies.csv`, agenciesCsv(filtered))}
        >
          Download CSV{narrowed ? ` (${count(filtered.length)})` : ''}
        </button>
      </div>

      <div className="toolbar">
        <label className="field field-grow">
          <span className="label">Search</span>
          <input type="search" value={q} placeholder="School, PENRO, hospital, road…" onChange={(e) => setParam('q', e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Department</span>
          <select value={dept} onChange={(e) => setParam('dept', e.target.value)}>
            <option value="">All departments</option>
            {departments.map(([id, d]) => <option key={id} value={id}>{d.label} ({count(d.rows)})</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Source</span>
          <select value={source} onChange={(e) => setParam('source', e.target.value)}>
            <option value="">All sources</option>
            {(Object.keys(SOURCE_LABEL) as AgencyLine['source'][]).map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Sort</span>
          <select value={sort} onChange={(e) => setParam('sort', e.target.value)}>
            <option value="nep">NEP amount</option>
            <option value="house">House bill amount</option>
            <option value="gaa">GAA 2026 amount</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>

      {narrowed && (
        <p className="filter-sums">
          {count(filtered.length)} shown
          <span className="sep">·</span>
          <button type="button" className="link-button" onClick={() => { setParams(new URLSearchParams(), { replace: true }); setShown(PAGE); }}>Clear filters</button>
        </p>
      )}

      {filtered.length > 0 && (
        <div className="table ag-lines" role="table" aria-label="Matched budget lines">
          <div className="tr th" role="row">
            <span role="columnheader">Line</span>
            <span role="columnheader" className="r">NEP 2027</span>
            <span role="columnheader" className="r">House</span>
            <span role="columnheader" className="r">GAA 2026</span>
          </div>
          {filtered.slice(0, shown).map((r) => <LineRow key={r.key} r={r} />)}
        </div>
      )}
      {filtered.length === 0 && <p className="state">No line matches. Try fewer words or clear the filters.</p>}
      {filtered.length > shown && (
        <div className="more">
          <span className="muted">Showing {count(shown)} of {count(filtered.length)}</span>
          <button type="button" className="button" onClick={() => setShown((n) => n + PAGE)}>Show {count(Math.min(PAGE, filtered.length - shown))} more</button>
          <button type="button" className="button button-quiet" onClick={() => setShown(filtered.length)}>Show all</button>
        </div>
      )}
      <p className="fine">
        A dash means that document has no such line — not zero. GAA columns for other years are in the CSV.
        {GAA_YEARS.length ? ` Enacted years covered: ${GAA_YEARS[0]}–${GAA_YEARS[GAA_YEARS.length - 1]}.` : ''}
      </p>
    </section>
  );
}

function LineRow({ r }: { r: AgencyLine }) {
  return (
    <div className="tr" role="row">
      <span role="cell" className="td-project">
        <span className="gname"><External href={r.url}>{r.title}</External></span>
        <span className="project-meta">
          <span className="label">{departmentShort(r.department)}</span>
          {r.operating_unit && r.operating_unit !== r.title && <span className="muted">{r.operating_unit}</span>}
          {r.agency && r.source !== 'nep-agency' && <span className="muted">{r.agency}</span>}
          {r.program && r.program !== r.title && <span className="muted">{r.program}</span>}
          <span className="tag">{SOURCE_LABEL[r.source]}</span>
          {r.reasons.slice(0, 3).map((p) => <span key={p} className="tag tag-place">names {p}</span>)}
          <External href={r.api_url}>API</External>
        </span>
      </span>
      <span role="cell" className={`r num${r.nep_php == null ? ' none' : ''}`} data-label="NEP 2027" title={r.nep_php != null ? phpFull(r.nep_php) : undefined}>
        {php(r.nep_php)}
      </span>
      <span role="cell" className={`r num${r.house_php == null ? ' none' : ''}`} data-label="House" title={r.house_php != null ? phpFull(r.house_php) : undefined}>
        {php(r.house_php)}
      </span>
      <span role="cell" className={`r num${r.gaa['2026'] == null ? ' none' : ''}`} data-label="GAA 2026" title={r.gaa['2026'] != null ? phpFull(r.gaa['2026']) : undefined}>
        {php(r.gaa['2026'])}
      </span>
    </div>
  );
}
