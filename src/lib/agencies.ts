/**
 * Every ZDN-attributable budget line the BetterGov Budget API can support:
 * NEP FY2027 operating units and agencies, GAA FY2020–2026 program families,
 * and FY2027 House-bill program rows (the four HGAB lists).
 *
 * Department NEP totals use NEP rollups only. House-bill amounts come only from
 * HGAB rows. The two are never added. GAA year totals use enacted program rows.
 */
import type { DatasetKey } from '../config';
import type { Client } from '../api/client';
import { MAX_ROWS_PER_QUERY } from '../api/client';
import type { GaaDepartment, GaaProgram, NepDepartment, NepRollupRow, ProjectRow } from '../api/types';
import { GAA_YEARS } from '../api/types';
import { departmentShort, hasYear } from './gaa';
import {
  matchZdn, ZDN_EXTRA_DEPARTMENTS, ZDN_EXTRA_QUERIES, ZDN_GAA_AGENCIES, ZDN_PRIMARY_QUERIES,
} from './zdn';

export type AgencyLineSource = 'nep-ou' | 'nep-agency' | 'gaa' | 'hgab';

export interface AgencyLine {
  key: string;
  source: AgencyLineSource;
  /** Dataset key when source is hgab. */
  dataset?: DatasetKey;
  department_id: string;
  department: string;
  agency: string | null;
  operating_unit: string | null;
  program: string | null;
  title: string;
  nep_php: number | null;
  /** FY2026 GAA baseline on NEP rollups; null elsewhere. */
  base_php: number | null;
  house_php: number | null;
  /** Enacted amounts by year; only gaa rows fill these. null = no line that year. */
  gaa: Record<string, number | null>;
  reasons: string[];
  url: string;
  api_url: string;
}

export interface AgencyQuery {
  kind: 'nep-ou' | 'nep-agency' | 'gaa-q' | 'gaa-agency' | 'hgab';
  label: string;
  department_id?: string;
  department?: string;
  matched: number;
  kept: number;
  api: string;
}

export interface DeptTotal {
  department_id: string;
  department: string;
  short: string;
  nep_php: number;
  nep_rows: number;
  house_php: number;
  house_rows: number;
  gaa: Record<string, { php: number; rows: number }>;
  lines: number;
}

export interface AgencyGap {
  department_id: string;
  department: string;
  short: string;
  note: string;
}

export interface AgenciesResult {
  lines: AgencyLine[];
  queries: AgencyQuery[];
  departments: NepDepartment[];
  gaaDepartments: GaaDepartment[];
  /** Per-department totals; NEP and House stay separate. */
  totals: DeptTotal[];
  /** What the data cannot show for major agencies. */
  gaps: AgencyGap[];
}

const cache = new Map<string, Promise<AgenciesResult>>();

export function loadAgencies(
  client: Client,
  onProgress?: (done: number, total: number) => void,
): Promise<AgenciesResult> {
  const key = client.base;
  let hit = cache.get(key);
  if (!hit) {
    hit = resolveAgencies(client, onProgress);
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}

export async function resolveAgencies(
  client: Client,
  onProgress?: (done: number, total: number) => void,
): Promise<AgenciesResult> {
  const nepDepts = (await client.nepDepartments()).data;
  const gaaDepts = (await client.gaaDepartments()).data;
  const gaaById = new Map(gaaDepts.map((d) => [d.id, d]));

  // Progress: NEP OUs + NEP agencies + GAA place×dept + GAA known agencies + HGAB place×dataset.
  const hgabDatasets: DatasetKey[] = ['dpwh', 'fmr', 'hfep', 'nia'];
  const gaaJobsList = gaaDepts.flatMap((d) => {
    const qs = ZDN_EXTRA_DEPARTMENTS.has(d.id)
      ? [...ZDN_PRIMARY_QUERIES, ...ZDN_EXTRA_QUERIES]
      : ZDN_PRIMARY_QUERIES;
    return qs.map((q) => ({ d, q }));
  });
  const hgabJobsList = hgabDatasets.flatMap((dataset) =>
    [...ZDN_PRIMARY_QUERIES, ...ZDN_EXTRA_QUERIES].map((q) => ({ dataset, q })),
  );
  const totalJobs =
    nepDepts.length * 2 + gaaJobsList.length + ZDN_GAA_AGENCIES.length + hgabJobsList.length;
  let done = 0;
  const tick = () => onProgress?.(++done, totalJobs);
  onProgress?.(0, totalJobs);

  const queries: AgencyQuery[] = [];
  const byKey = new Map<string, AgencyLine>();

  const add = (line: AgencyLine) => {
    const seen = byKey.get(line.key);
    if (!seen) {
      byKey.set(line.key, line);
      return;
    }
    for (const r of line.reasons) if (!seen.reasons.includes(r)) seen.reasons.push(r);
    // Prefer non-null amounts if a later source fills a gap (should not collide on key).
    if (seen.nep_php == null && line.nep_php != null) seen.nep_php = line.nep_php;
    if (seen.house_php == null && line.house_php != null) seen.house_php = line.house_php;
    if (seen.base_php == null && line.base_php != null) seen.base_php = line.base_php;
  };

  // --- NEP operating units & agencies --------------------------------------
  for (let i = 0; i < nepDepts.length; i += 4) {
    const batch = nepDepts.slice(i, i + 4);
    await Promise.all(
      batch.map(async (d) => {
        const [ous, agencies] = await Promise.all([
          client.nepRollup(d.id, 'operating_unit').finally(tick),
          client.nepRollup(d.id, 'agency').finally(tick),
        ]);
        keepNepRollup(client, d, 'operating_unit', ous.rows, queries, add);
        keepNepRollup(client, d, 'agency', agencies.rows, queries, add);
      }),
    );
  }

  // --- GAA place searches --------------------------------------------------
  for (let i = 0; i < gaaJobsList.length; i += 8) {
    const slice = gaaJobsList.slice(i, i + 8);
    await Promise.all(
      slice.map(async ({ d, q }) => {
        const { first, rows, truncated } = await client.gaaPrograms(d.id, q).finally(tick);
        const matched = first.meta.matched ?? rows.length;
        let kept = 0;
        for (const r of rows) {
          const m = matchZdn(r.name);
          if (!m.matched) continue;
          kept++;
          add(gaaLine(client, d, r, m.reasons, `search:${q}`));
        }
        if (matched > 0) {
          queries.push({
            kind: 'gaa-q',
            label: `GAA programs naming “${q}”`,
            department_id: d.id,
            department: d.description,
            matched: truncated ? matched : rows.length,
            kept,
            api: client.href(`/api/v1/gaa/departments/${d.id}/programs`, { q }),
          });
        }
      }),
    );
  }

  // --- GAA whole agencies (JRMSU, …) ---------------------------------------
  for (const a of ZDN_GAA_AGENCIES) {
    const d = gaaById.get(a.department_id) ?? {
      id: a.department_id,
      slug: a.department_id,
      description: a.department_id,
      years: {},
    };
    const { first, rows } = await client.gaaPrograms(a.department_id, '', { agency_id: a.agency_id }).finally(tick);
    const matched = first.meta.matched ?? rows.length;
    for (const r of rows) add(gaaLine(client, d as GaaDepartment, r, [a.label], 'agency'));
    queries.push({
      kind: 'gaa-agency',
      label: `GAA programs under ${a.label}`,
      department_id: a.department_id,
      department: (d as GaaDepartment).description,
      matched,
      kept: rows.length,
      api: client.href(`/api/v1/gaa/departments/${a.department_id}/programs`, { agency_id: a.agency_id }),
    });
  }

  // --- House bill / NEP project lines (four programs) ----------------------
  for (let i = 0; i < hgabJobsList.length; i += 4) {
    const slice = hgabJobsList.slice(i, i + 4);
    await Promise.all(
      slice.map(async ({ dataset, q }) => {
        const { list, rows, truncated } = await client.allProjects(dataset, { q }).finally(tick);
        let kept = 0;
        for (const r of rows) {
          const titleMatch = matchZdn(r.title, { regionKey: r.region_key });
          const officeMatch = r.office ? matchZdn(r.office, { regionKey: r.region_key }) : null;
          if (!titleMatch.matched && !(officeMatch && officeMatch.matched)) continue;
          const reasons = [
            ...(titleMatch.matched ? titleMatch.reasons : []),
            ...(officeMatch && officeMatch.matched ? officeMatch.reasons : []),
          ];
          kept++;
          add(hgabLine(r, [...new Set(reasons)]));
        }
        if (list.data.total > 0) {
          queries.push({
            kind: 'hgab',
            label: `House bill / NEP ${dataset} titles naming “${q}”`,
            matched: truncated ? Math.min(list.data.total, MAX_ROWS_PER_QUERY) : list.data.total,
            kept,
            api: client.href(`/datasets/${dataset}/projects`, { q }),
          });
        }
      }),
    );
  }

  const lines = [...byKey.values()].sort(
    (a, b) => (b.nep_php ?? b.house_php ?? latestGaa(b) ?? 0) - (a.nep_php ?? a.house_php ?? latestGaa(a) ?? 0)
      || a.title.localeCompare(b.title),
  );

  return {
    lines,
    queries: queries.sort((a, b) => b.kept - a.kept || b.matched - a.matched),
    departments: nepDepts,
    gaaDepartments: gaaDepts,
    totals: buildTotals(lines),
    gaps: buildGaps(nepDepts, lines),
  };
}

function keepNepRollup(
  client: Client,
  d: NepDepartment,
  dimension: 'operating_unit' | 'agency',
  rows: NepRollupRow[],
  queries: AgencyQuery[],
  add: (line: AgencyLine) => void,
) {
  let kept = 0;
  for (const r of rows) {
    if (r.code === '__unassigned__' || r.code === '__other__' || r.code === '0000000') continue;
    if (!r.description || r.description === '(not attributed)') continue;
    const m = matchZdn(r.description);
    if (!m.matched) continue;
    kept++;
    const source = dimension === 'operating_unit' ? 'nep-ou' : 'nep-agency';
    add({
      key: `nep:${d.id}:${dimension}:${r.code}`,
      source,
      department_id: d.id,
      department: d.description,
      agency: dimension === 'agency' ? r.description : null,
      operating_unit: dimension === 'operating_unit' ? r.description : null,
      program: null,
      title: r.description,
      nep_php: r.amount,
      base_php: r.base_amount,
      house_php: null,
      gaa: emptyGaa(),
      reasons: m.reasons,
      url: `https://budget.bettergov.ph/nep/2027/d/${d.id}`,
      api_url: client.href(`/api/v1/nep/2027/departments/${d.id}/rollups/${dimension}`),
    });
  }
  if (kept > 0) {
    queries.push({
      kind: dimension === 'operating_unit' ? 'nep-ou' : 'nep-agency',
      label: `NEP ${dimension === 'operating_unit' ? 'operating units' : 'agencies'}`,
      department_id: d.id,
      department: d.description,
      matched: rows.length,
      kept,
      api: client.href(`/api/v1/nep/2027/departments/${d.id}/rollups/${dimension}`),
    });
  }
}

function emptyGaa(): Record<string, number | null> {
  const o: Record<string, number | null> = {};
  for (const y of GAA_YEARS) o[String(y)] = null;
  return o;
}

function gaaLine(client: Client, d: GaaDepartment, r: GaaProgram, reasons: string[], via: string): AgencyLine {
  void via;
  const gaa = emptyGaa();
  for (const y of GAA_YEARS) gaa[String(y)] = hasYear(r, y) ? r.years[String(y)].amount : null;
  return {
    key: `gaa:${r.fam_key}`,
    source: 'gaa',
    department_id: r.department_id || d.id,
    department: d.description,
    agency: r.agency_id,
    operating_unit: null,
    program: r.name,
    title: r.name,
    nep_php: null,
    base_php: null,
    house_php: null,
    gaa,
    reasons,
    url: `https://budget.bettergov.ph/d/${r.department_id || d.id}`,
    api_url: client.href(`/api/v1/gaa/departments/${r.department_id || d.id}/programs`, { q: r.name.slice(0, 80) }),
  };
}

function hgabLine(r: ProjectRow, reasons: string[]): AgencyLine {
  const dept =
    r.dataset === 'dpwh' ? { id: '18', name: 'Department of Public Works and Highways (DPWH)' }
    : r.dataset === 'hfep' ? { id: '13', name: 'Department of Health (DOH)' }
    : { id: '05', name: 'Department of Agriculture (DA)' };
  return {
    key: `hgab:${r.dataset}:${r.id}`,
    source: 'hgab',
    dataset: r.dataset,
    department_id: dept.id,
    department: dept.name,
    agency: r.dataset.toUpperCase(),
    operating_unit: r.office,
    program: r.program ?? r.pap,
    title: r.title,
    nep_php: r.nep_php,
    base_php: null,
    house_php: r.house_php,
    gaa: emptyGaa(),
    reasons,
    url: r.url,
    api_url: r.api_url,
  };
}

function latestGaa(line: AgencyLine): number | null {
  for (let i = GAA_YEARS.length - 1; i >= 0; i--) {
    const v = line.gaa[String(GAA_YEARS[i])];
    if (v != null && v > 0) return v;
  }
  return null;
}

/** NEP totals from rollups only; House from HGAB only — never mixed into one sum. */
export function buildTotals(lines: readonly AgencyLine[]): DeptTotal[] {
  const map = new Map<string, DeptTotal>();
  const ensure = (line: AgencyLine) => {
    let t = map.get(line.department_id);
    if (!t) {
      t = {
        department_id: line.department_id,
        department: line.department,
        short: departmentShort(line.department),
        nep_php: 0,
        nep_rows: 0,
        house_php: 0,
        house_rows: 0,
        gaa: Object.fromEntries(GAA_YEARS.map((y) => [String(y), { php: 0, rows: 0 }])),
        lines: 0,
      };
      map.set(line.department_id, t);
    }
    return t;
  };

  for (const line of lines) {
    const t = ensure(line);
    t.lines++;
    if (line.source === 'nep-ou' || line.source === 'nep-agency') {
      if (line.nep_php != null) {
        t.nep_php += line.nep_php;
        t.nep_rows++;
      }
    }
    if (line.source === 'hgab' && line.house_php != null) {
      t.house_php += line.house_php;
      t.house_rows++;
    }
    if (line.source === 'gaa') {
      for (const y of GAA_YEARS) {
        const v = line.gaa[String(y)];
        if (v != null && v > 0) {
          t.gaa[String(y)].php += v;
          t.gaa[String(y)].rows++;
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => b.nep_php - a.nep_php || b.house_php - a.house_php || a.short.localeCompare(b.short));
}

function buildGaps(nepDepts: NepDepartment[], lines: AgencyLine[]): AgencyGap[] {
  const withNep = new Set(lines.filter((l) => l.source === 'nep-ou' || l.source === 'nep-agency').map((l) => l.department_id));
  const notes: Record<string, string> = {
    '05': 'DA Regional Office – IX is a Zamboanga Peninsula lump sum. It is not split to Zamboanga del Norte in the NEP, so only titled projects (farm-to-market roads and other lines that name the place) appear here.',
    '20': 'DSWD Regional Office – IX is peninsula-wide. No ZDN operating unit is published; provincial figures cannot be read from the NEP rollup.',
    '14': 'DILG’s “Zamboanga Peninsula (Region IX)” office covers the whole region. It is excluded so peninsula money is not counted as ZDN.',
    '10': 'DENR shows PENRO Zamboanga del Norte. CENROs are not listed as separate NEP operating units in the API, so they are not itemised here.',
    '13': 'DOH shows Dr. Jose Rizal Memorial Hospital when named. Regional health-office money for Region IX is peninsula-wide and excluded. HFEP project lines appear when the title names ZDN.',
    '07': 'DepEd divisions and schools are matched by name. National DepEd programs with no school or division tag have no location and cannot be assigned to ZDN.',
    '18': 'DPWH district engineering offices are matched by name. Central Office projects appear only when the title names ZDN (or a place in it).',
    '08': 'JRMSU is included as a whole agency. Other SUCs in Region IX (Zamboanga City / peninsula) are excluded.',
    AUTO: 'Automatic appropriations are national. None are attributed to ZDN in the NEP operating-unit list.',
    SPF: 'Special purpose funds are national lump sums with no ZDN operating unit.',
  };
  const gaps: AgencyGap[] = [];
  for (const d of nepDepts) {
    const note = notes[d.id];
    if (note) gaps.push({ department_id: d.id, department: d.description, short: departmentShort(d.description), note });
    else if (!withNep.has(d.id)) {
      gaps.push({
        department_id: d.id,
        department: d.description,
        short: departmentShort(d.description),
        note: 'No ZDN operating unit or agency appears in the NEP rollups. Any ZDN activity would be inside a national or regional lump sum that the documents do not locate.',
      });
    }
  }
  return gaps.sort((a, b) => a.short.localeCompare(b.short));
}

export function agenciesCsv(lines: readonly AgencyLine[]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    'source', 'department', 'department_id', 'agency', 'operating_unit', 'program', 'title',
    'nep_2027_php', 'gaa_2026_baseline_php', 'house_bill_php',
    ...GAA_YEARS.map((y) => `gaa_${y}_php`),
    'why_listed', 'url', 'api_url',
  ];
  const out = [head.join(',')];
  for (const r of lines) {
    out.push([
      r.source,
      departmentShort(r.department),
      r.department_id,
      r.agency,
      r.operating_unit,
      r.program,
      r.title,
      r.nep_php,
      r.base_php,
      r.house_php,
      ...GAA_YEARS.map((y) => r.gaa[String(y)]),
      r.reasons.join('; '),
      r.url,
      r.api_url,
    ].map(cell).join(','));
  }
  return out.join('\r\n') + '\r\n';
}
