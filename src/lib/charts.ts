/**
 * Shapes figures the charts draw. Amounts stay in one version of the budget:
 * a sum is only ever of NEP lines, or only ever of House-bill lines, or a
 * difference the API already publishes (net_php). null stays null — a missing
 * line is not zero.
 */
import type { BridgeGroup, DistrictCard, DistrictOffice, GroupCell } from '../api/types';
import { BRIDGE_GROUPS, GAA_YEARS } from '../api/types';
import { DATASET_KEYS, type DatasetKey } from '../config';
import type { ScopedProject } from './scope';

export const PROGRAM_PLAIN: Record<DatasetKey, string> = {
  dpwh: 'DPWH',
  fmr: 'Farm-to-market roads',
  hfep: 'Health facilities',
  nia: 'Irrigation',
};

export function deoShort(name: string): string {
  const m = /\b(\d+(?:st|nd|rd|th)|Lone)\b/i.exec(name);
  if (!m) return name.replace(/ District Engineering Office$/, ' DEO');
  return `${m[1].toLowerCase() === 'lone' ? 'Lone' : m[1].toLowerCase()} DEO`;
}

export function uniqueOffices(cards: DistrictCard[]): DistrictOffice[] {
  const byId = new Map<string, DistrictOffice>();
  for (const c of cards) for (const o of c.offices) if (!byId.has(o.id)) byId.set(o.id, o);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

function yearSlot(office: DistrictOffice, fy: number, stage: string) {
  return office.years?.find((y) => y.fy === fy && y.stage === stage);
}

function yearPhp(office: DistrictOffice, fy: number, stage: string): number | null {
  const y = yearSlot(office, fy, stage);
  return y ? y.php : null;
}

function firstYearText(offices: DistrictOffice[], fy: number, stage: string, field: 'scope' | 'stage_label', fallback: string): string {
  for (const o of offices) {
    const y = yearSlot(o, fy, stage);
    const text = y?.[field];
    if (text) return text;
  }
  return fallback;
}

export interface CompareSeries {
  key: 'gaa2025' | 'gaa2026' | 'nep' | 'house';
  label: string;
  scope: string;
  sw: string;
}

export interface CompareRow {
  id: string;
  short: string;
  full: string;
  values: Record<CompareSeries['key'], number | null>;
}

/** 2025 GAA, 2026 GAA, 2027 NEP (whole office), 2027 House bill (named projects only). */
export function officeCompare(offices: DistrictOffice[]): { series: CompareSeries[]; rows: CompareRow[] } {
  const label = (fy: number, stage: string, fallback: string) => firstYearText(offices, fy, stage, 'stage_label', fallback);
  const scope = (fy: number, stage: string, fallback: string) => firstYearText(offices, fy, stage, 'scope', fallback);
  const series: CompareSeries[] = [
    { key: 'gaa2025', label: `2025 ${label(2025, 'gaa', 'GAA')}`, scope: scope(2025, 'gaa', 'the whole office'), sw: 'k-gaa' },
    { key: 'gaa2026', label: `2026 ${label(2026, 'gaa', 'GAA')}`, scope: scope(2026, 'gaa', 'the whole office'), sw: 'k-gaa-now' },
    { key: 'nep', label: `2027 ${label(2027, 'nep', 'NEP')}`, scope: scope(2027, 'nep', 'the whole office'), sw: 'k-nep' },
    { key: 'house', label: `2027 ${label(2027, 'hgab3', 'House bill')}`, scope: scope(2027, 'hgab3', 'named projects only'), sw: 'k-house' },
  ];
  const rows = offices.map((o): CompareRow => ({
    id: o.id,
    short: deoShort(o.name),
    full: o.name,
    values: {
      gaa2025: yearPhp(o, 2025, 'gaa'),
      gaa2026: yearPhp(o, 2026, 'gaa'),
      nep: yearPhp(o, 2027, 'nep'),
      house: yearPhp(o, 2027, 'hgab3'),
    },
  }));
  return { series, rows };
}

export function compareMax(rows: CompareRow[]): number {
  const vals = rows.flatMap((r) => Object.values(r.values)).filter((n): n is number => n != null);
  return Math.max(1, ...vals);
}

/** Signed contribution of one bridge group to the office's net. Unchanged lines contribute nothing. */
function signedContribution(cell: GroupCell): number | null {
  if (!cell.rows) return null;
  if (cell.group === 'house_only') return cell.house_php ?? cell.php;
  if (cell.group === 'nep_only') return -(cell.nep_php ?? cell.php);
  if (cell.group === 'increased' || cell.group === 'decreased') {
    if (cell.house_php != null && cell.nep_php != null) return cell.house_php - cell.nep_php;
    return cell.group === 'decreased' ? -Math.abs(cell.php) : Math.abs(cell.php);
  }
  return null;
}

export interface ChangePart {
  group: BridgeGroup;
  label: string;
  rows: number;
  /** Positive magnitude. The side (plus or minus) carries the sign. */
  amount: number;
}

export interface ChangeRow {
  id: string;
  short: string;
  full: string;
  plus: ChangePart[];
  minus: ChangePart[];
  /** API net on the named-project ledger: House bill minus NEP. null if the office has no 2027 ledger. */
  net: number | null;
  unconfirmed: number;
  heldOut: number;
  scopeReview: number;
}

export function officeChanges(offices: DistrictOffice[]): ChangeRow[] {
  return offices.map((o) => {
    const f = o.fy2027;
    const plus: ChangePart[] = [];
    const minus: ChangePart[] = [];
    if (f) {
      for (const g of BRIDGE_GROUPS) {
        const cell = f.bridge.groups[g];
        const signed = cell ? signedContribution(cell) : null;
        if (!cell || signed == null || signed === 0) continue;
        const part = { group: g, label: cell.label, rows: cell.rows, amount: Math.abs(signed) };
        (signed > 0 ? plus : minus).push(part);
      }
    }
    return {
      id: o.id,
      short: deoShort(o.name),
      full: o.name,
      plus,
      minus,
      net: f ? f.bridge.net_php : null,
      unconfirmed: f?.annotations?.unconfirmed_rows ?? 0,
      heldOut: f?.office_change?.rows ?? 0,
      scopeReview: f?.bridge.groups.scope_review?.rows ?? 0,
    };
  });
}

export function changeMax(rows: ChangeRow[]): number {
  const side = (r: ChangeRow) => Math.max(sumParts(r.plus), sumParts(r.minus));
  return Math.max(1, ...rows.map(side));
}

export function sumParts(parts: ChangePart[]): number {
  return parts.reduce((a, p) => a + p.amount, 0);
}

export interface VersionMoney {
  php: number | null;
  rows: number;
}

export interface ShareRow {
  id: string;
  label: string;
  title: string;
  /** Second line under the label: which offices, or why a district is not summed. */
  hint?: string;
  house: VersionMoney;
  nep: VersionMoney;
}

export interface DistrictShareRow extends ShareRow {
  /** Offices summed into this district, or listed and not split. */
  offices: string;
  shared: boolean;
}

const emptyMoney = (): VersionMoney => ({ php: null, rows: 0 });

function money(php: number | null | undefined, rows: number): VersionMoney {
  return { php: php ?? null, rows };
}

function addMoney(parts: VersionMoney[]): VersionMoney {
  const known = parts.filter((p) => p.php != null);
  if (!known.length) return emptyMoney();
  return { php: known.reduce((a, p) => a + (p.php as number), 0), rows: known.reduce((a, p) => a + p.rows, 0) };
}

export function officeShares(offices: DistrictOffice[]): ShareRow[] {
  return offices.map((o) => {
    const f = o.fy2027;
    return {
      id: o.id,
      label: deoShort(o.name),
      title: o.name,
      house: money(f?.hgab3_php, f?.hgab3_records ?? 0),
      nep: money(f?.nep_php, f?.nep_records ?? 0),
    };
  });
}

/**
 * A district's share is the sum of offices that serve only that district.
 * An office that serves several districts is not split; the district is marked shared.
 */
export function districtShares(cards: DistrictCard[]): DistrictShareRow[] {
  return [...cards]
    .sort((a, b) => a.district_label.localeCompare(b.district_label, 'en', { numeric: true }))
    .filter((c) => c.offices.length)
    .map((c) => {
      const shared = c.offices.some((o) => o.district_ids.length !== 1);
      const parts = c.offices.map((o) => ({
        house: money(o.fy2027?.hgab3_php, o.fy2027?.hgab3_records ?? 0),
        nep: money(o.fy2027?.nep_php, o.fy2027?.nep_records ?? 0),
      }));
      return {
        id: c.id,
        label: c.district_label,
        title: c.label,
        offices: c.offices.map((o) => deoShort(o.name)).join(' and '),
        shared,
        hint: shared
          ? 'Shared office, shown whole on the office chart and not split here'
          : c.offices.length > 1
            ? c.offices.map((o) => deoShort(o.name)).join(' and ')
            : undefined,
        house: shared ? emptyMoney() : addMoney(parts.map((p) => p.house)),
        nep: shared ? emptyMoney() : addMoney(parts.map((p) => p.nep)),
      };
    });
}

export function programShares(projects: readonly ScopedProject[]): { rows: ShareRow[]; absent: DatasetKey[] } {
  const rows: ShareRow[] = [];
  const absent: DatasetKey[] = [];
  for (const key of DATASET_KEYS) {
    const mine = projects.filter((p) => p.dataset === key);
    if (!mine.length) {
      absent.push(key);
      continue;
    }
    const nep = mine.filter((p) => p.nep_php != null);
    const house = mine.filter((p) => p.house_php != null);
    rows.push({
      id: key,
      label: PROGRAM_PLAIN[key],
      title: PROGRAM_PLAIN[key],
      house: { php: house.length ? house.reduce((a, p) => a + (p.house_php as number), 0) : null, rows: house.length },
      nep: { php: nep.length ? nep.reduce((a, p) => a + (p.nep_php as number), 0) : null, rows: nep.length },
    });
  }
  return { rows, absent };
}

export function columnTotal(rows: { house: VersionMoney; nep: VersionMoney }[], side: 'house' | 'nep'): number | null {
  return addMoney(rows.map((r) => r[side])).php;
}

/** Share of one column. null when this row has no amount in that document. */
export function sharePct(part: number | null, total: number | null): string {
  if (part == null || total == null || total === 0) return '—';
  const p = (part / total) * 100;
  if (p > 0 && p < 0.05) return '<0.1%';
  return `${p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export interface TrendPoint { year: number; php: number | null }
export interface TrendSeries { id: string; short: string; full: string; points: TrendPoint[] }

/** Enacted GAA only, 2020–2026. 2027 is a proposal and is not on this line. */
export function officeTrends(offices: DistrictOffice[]): TrendSeries[] {
  return offices.map((o) => ({
    id: o.id,
    short: deoShort(o.name),
    full: o.name,
    points: GAA_YEARS.map((year) => ({ year, php: yearPhp(o, year, 'gaa') })),
  }));
}

export interface RankedProject {
  key: string;
  href: string;
  title: string;
  dataset: DatasetKey;
  office: string | null;
  group: BridgeGroup;
  status: string;
  held: boolean;
  nep: number | null;
  house: number | null;
  delta: number | null;
  /** What the bar measures. Never a sum of the two versions. */
  bar: number;
}

function rank(p: ScopedProject, bar: number): RankedProject {
  return {
    key: p.key,
    href: `/projects/${p.dataset}/${encodeURIComponent(p.id)}`,
    title: p.title,
    dataset: p.dataset,
    office: p.office,
    group: p.bridge_group,
    status: p.status_label,
    held: p.held,
    nep: p.nep_php,
    house: p.house_php,
    delta: p.delta_php,
    bar,
  };
}

export function largestInHouse(projects: readonly ScopedProject[], n = 5): RankedProject[] {
  return projects
    .filter((p) => p.house_php != null)
    .sort((a, b) => (b.house_php as number) - (a.house_php as number) || a.title.localeCompare(b.title))
    .slice(0, n)
    .map((p) => rank(p, p.house_php as number));
}

export function largestInGroup(projects: readonly ScopedProject[], group: 'house_only' | 'nep_only', n = 5): RankedProject[] {
  const amount = (p: ScopedProject) => (group === 'house_only' ? p.house_php : p.nep_php);
  return projects
    .filter((p) => p.bridge_group === group && amount(p) != null)
    .sort((a, b) => (amount(b) as number) - (amount(a) as number) || a.title.localeCompare(b.title))
    .slice(0, n)
    .map((p) => rank(p, amount(p) as number));
}

/** The matched line with the largest raise, or the largest cut. null when there is none. */
export function extremeMove(projects: readonly ScopedProject[], dir: 'up' | 'down'): { project: ScopedProject; count: number } | null {
  const group = dir === 'up' ? 'increased' : 'decreased';
  const mine = projects.filter((p) => p.bridge_group === group && p.delta_php != null && p.delta_php !== 0);
  if (!mine.length) return null;
  mine.sort((a, b) => (dir === 'up' ? (b.delta_php as number) - (a.delta_php as number) : (a.delta_php as number) - (b.delta_php as number)));
  return { project: mine[0], count: mine.length };
}
