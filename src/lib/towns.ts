/**
 * Resolve a scoped project to a ZDN municipality/city for the map.
 * Matching uses title / program / PAP / office text against known place aliases.
 * Unresolved rows are grouped as district-wide under their DPWH office.
 *
 * Past enacted (GAA 2020–2026) lines that name a town are loaded separately via
 * gaaSearch — they are different records from 2027 projects and are never joined.
 */
import type { Client } from '../api/client';
import { GAA_YEARS, type GaaSearchRow, type GaaYear, type GaaYears } from '../api/types';
import { ZDN_PLACES, ZDN_PROVINCE, isZdnText, matchZdn } from './zdn';
import type { ScopedProject } from './scope';

/** Canonical town id used by the map, population file, and panels. */
export type TownId = string;

export const DISTRICT_WIDE = '__district_wide__';

/** GeoJSON `adm3_en` → canonical town id (matches population JSON keys). */
export const GEO_NAME_TO_TOWN: Record<string, TownId> = {
  'City of Dipolog': 'Dipolog',
  'City of Dapitan': 'Dapitan',
  Baliguian: 'Baliguian',
  Godod: 'Godod',
  Gutalac: 'Gutalac',
  'Jose Dalman': 'Jose Dalman',
  Kalawit: 'Kalawit',
  Katipunan: 'Katipunan',
  'La Libertad': 'La Libertad',
  Labason: 'Labason',
  'Leon T. Postigo': 'Leon B. Postigo',
  Liloy: 'Liloy',
  Manukan: 'Manukan',
  Mutia: 'Mutia',
  Piñan: 'Piñan',
  Polanco: 'Polanco',
  'Pres. Manuel A. Roxas': 'President Manuel A. Roxas',
  Rizal: 'Rizal',
  Salug: 'Salug',
  'Sergio Osmeña Sr.': 'Sergio Osmeña Sr.',
  Siayan: 'Siayan',
  Sibuco: 'Sibuco',
  Sibutad: 'Sibutad',
  Sindangan: 'Sindangan',
  Siocon: 'Siocon',
  Sirawai: 'Sirawai',
  Tampilisan: 'Tampilisan',
};

/** Display labels for towns (short, resident-friendly). */
export const TOWN_LABEL: Record<TownId, string> = {
  Dipolog: 'Dipolog City',
  Dapitan: 'Dapitan City',
  Baliguian: 'Baliguian',
  Godod: 'Godod',
  Gutalac: 'Gutalac',
  'Jose Dalman': 'Jose Dalman',
  Kalawit: 'Kalawit',
  Katipunan: 'Katipunan',
  'La Libertad': 'La Libertad',
  Labason: 'Labason',
  'Leon B. Postigo': 'Leon B. Postigo',
  Liloy: 'Liloy',
  Manukan: 'Manukan',
  Mutia: 'Mutia',
  Piñan: 'Piñan',
  Polanco: 'Polanco',
  'President Manuel A. Roxas': 'Pres. Manuel A. Roxas',
  Rizal: 'Rizal',
  Salug: 'Salug',
  'Sergio Osmeña Sr.': 'Sergio Osmeña Sr.',
  Siayan: 'Siayan',
  Sibuco: 'Sibuco',
  Sibutad: 'Sibutad',
  Sindangan: 'Sindangan',
  Siocon: 'Siocon',
  Sirawai: 'Sirawai',
  Tampilisan: 'Tampilisan',
};

const MUNICIPALITY_PLACES = ZDN_PLACES.filter((p) => p.label !== ZDN_PROVINCE);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '');
}

function aliasPattern(alias: string): RegExp {
  const body = escapeRe(normalize(alias)).replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${body}(?=$|[^\\p{L}\\p{N}])`, 'iu');
}

/** Map ZDN_PLACES label → canonical TownId. */
const PLACE_TO_TOWN: Record<string, TownId> = {
  Dipolog: 'Dipolog',
  Dapitan: 'Dapitan',
  'Bacungan (Leon B. Postigo)': 'Leon B. Postigo',
  Baliguian: 'Baliguian',
  Godod: 'Godod',
  Gutalac: 'Gutalac',
  'Jose Dalman': 'Jose Dalman',
  Kalawit: 'Kalawit',
  Katipunan: 'Katipunan',
  'La Libertad': 'La Libertad',
  Labason: 'Labason',
  Liloy: 'Liloy',
  Manukan: 'Manukan',
  Mutia: 'Mutia',
  Piñan: 'Piñan',
  Polanco: 'Polanco',
  'President Manuel A. Roxas': 'President Manuel A. Roxas',
  Rizal: 'Rizal',
  Salug: 'Salug',
  'Sergio Osmeña Sr.': 'Sergio Osmeña Sr.',
  Siayan: 'Siayan',
  Sibuco: 'Sibuco',
  Sibutad: 'Sibutad',
  Sindangan: 'Sindangan',
  Siocon: 'Siocon',
  Sirawai: 'Sirawai',
  Tampilisan: 'Tampilisan',
};

export interface TownAssignment {
  townId: TownId | typeof DISTRICT_WIDE;
  /** Human label for the bucket. */
  label: string;
  /** DEO name when district-wide. */
  office: string | null;
}

function projectText(p: ScopedProject): string {
  return [p.title, p.program, p.pap, p.office, p.region].filter(Boolean).join(' ');
}

/** Prefer the most specific municipality mentioned in the project text. */
export function resolveTown(p: ScopedProject): TownAssignment {
  const text = projectText(p);
  const n = normalize(text);
  const hits: TownId[] = [];

  for (const place of MUNICIPALITY_PLACES) {
    const hit = place.aliases.some((a) => aliasPattern(a).test(n));
    if (!hit) continue;
    if (place.needsAnchor) {
      const m = matchZdn(text, { regionKey: p.region_key });
      if (!m.matched) continue;
    }
    if (place.label.startsWith('President Manuel') && /\broxas city\b/i.test(n) && !/president|pres\.?/i.test(n)) continue;
    const townId = PLACE_TO_TOWN[place.label];
    if (townId) hits.push(townId);
  }

  const uniq = [...new Set(hits)];
  if (uniq.length === 1) {
    const townId = uniq[0]!;
    return { townId, label: TOWN_LABEL[townId] ?? townId, office: p.office };
  }
  if (uniq.length > 1) {
    // Multi-town titles: keep the first municipality alias that appears in text order.
    let best: TownId | null = null;
    let bestPos = Infinity;
    for (const townId of uniq) {
      const place = MUNICIPALITY_PLACES.find((pl) => PLACE_TO_TOWN[pl.label] === townId);
      if (!place) continue;
      for (const a of place.aliases) {
        const m = aliasPattern(a).exec(n);
        if (m && m.index < bestPos) {
          bestPos = m.index;
          best = townId;
        }
      }
    }
    if (best) return { townId: best, label: TOWN_LABEL[best] ?? best, office: p.office };
  }

  const office = p.office;
  const deo = office ? office.replace(/ District Engineering Office$/, ' DEO') : 'province-wide';
  return {
    townId: DISTRICT_WIDE,
    label: office ? `District-wide · ${deo}` : 'District-wide',
    office,
  };
}

export interface TownBucket {
  townId: TownId | typeof DISTRICT_WIDE;
  label: string;
  office: string | null;
  projects: ScopedProject[];
  /** Proposed funding: prefer House amount, else NEP. */
  totalPhp: number;
}

export function groupByTown(projects: readonly ScopedProject[]): {
  towns: TownBucket[];
  districtWide: TownBucket[];
  unmapped: ScopedProject[];
} {
  const map = new Map<string, TownBucket>();
  const unmapped: ScopedProject[] = [];

  for (const p of projects) {
    const a = resolveTown(p);
    const key = a.townId === DISTRICT_WIDE ? `${DISTRICT_WIDE}:${a.office ?? 'none'}` : a.townId;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { townId: a.townId, label: a.label, office: a.office, projects: [], totalPhp: 0 };
      map.set(key, bucket);
    }
    bucket.projects.push(p);
    const amt = p.house_php ?? p.nep_php ?? 0;
    bucket.totalPhp += amt;
    if (a.townId === DISTRICT_WIDE) unmapped.push(p);
  }

  const all = [...map.values()];
  const towns = all
    .filter((b) => b.townId !== DISTRICT_WIDE)
    .sort((a, b) => b.totalPhp - a.totalPhp || a.label.localeCompare(b.label));
  const districtWide = all
    .filter((b) => b.townId === DISTRICT_WIDE)
    .sort((a, b) => b.totalPhp - a.totalPhp || a.label.localeCompare(b.label));

  return { towns, districtWide, unmapped };
}

export function townTotals(projects: readonly ScopedProject[]): Map<TownId, number> {
  const totals = new Map<TownId, number>();
  for (const p of projects) {
    const a = resolveTown(p);
    if (a.townId === DISTRICT_WIDE) continue;
    totals.set(a.townId, (totals.get(a.townId) ?? 0) + (p.house_php ?? p.nep_php ?? 0));
  }
  return totals;
}

/** One enacted GAA family assigned to a town (2020–2026). Not a 2027 project. */
export interface EnactedTownLine {
  fam_key: string;
  name: string;
  department: string;
  years: GaaYears;
}

export interface EnactedTownBucket {
  townId: TownId;
  label: string;
  lines: EnactedTownLine[];
  /** Sum of years[y].amount where amount > 0, per year — missing years stay null. */
  series: { year: GaaYear; amount: number | null }[];
}

function townIdFromMatchReasons(reasons: string[]): TownId | null {
  for (const reason of reasons) {
    const fromPlace = PLACE_TO_TOWN[reason];
    if (fromPlace) return fromPlace;
  }
  return null;
}

/** Year series for a set of enacted lines: amount only when > 0; else null (not ₱0). */
export function enactedSeries(lines: readonly EnactedTownLine[]): { year: GaaYear; amount: number | null }[] {
  return GAA_YEARS.map((year) => {
    let sum = 0;
    let any = false;
    for (const line of lines) {
      const cell = line.years[String(year)];
      if (cell && cell.amount > 0) {
        sum += cell.amount;
        any = true;
      }
    }
    return { year, amount: any ? sum : null };
  });
}

/**
 * Load enacted GAA lines that name ZDN towns via /gaa/search (100-row cap per query).
 * One query for the province plus one per place alias; dedupe by fam_key.
 */
export async function loadEnactedByTown(client: Client): Promise<Map<TownId, EnactedTownBucket>> {
  const queries = new Set<string>();
  queries.add('Zamboanga del Norte');
  for (const place of ZDN_PLACES) {
    for (const alias of place.aliases) queries.add(alias);
  }

  const seen = new Map<string, GaaSearchRow>();
  const list = [...queries];
  for (let i = 0; i < list.length; i += 6) {
    const batch = list.slice(i, i + 6);
    const pages = await Promise.all(batch.map((q) => client.gaaSearch(q)));
    for (const page of pages) {
      for (const row of page.data) {
        if (!seen.has(row.fam_key)) seen.set(row.fam_key, row);
      }
    }
  }

  const byTown = new Map<TownId, EnactedTownLine[]>();
  for (const row of seen.values()) {
    if (!isZdnText(row.name)) continue;
    const m = matchZdn(row.name);
    if (!m.matched) continue;
    const townId = townIdFromMatchReasons(m.reasons);
    if (!townId) continue;
    const listForTown = byTown.get(townId) ?? [];
    listForTown.push({
      fam_key: row.fam_key,
      name: row.name,
      department: row.department,
      years: row.years,
    });
    byTown.set(townId, listForTown);
  }

  const out = new Map<TownId, EnactedTownBucket>();
  for (const [townId, lines] of byTown) {
    out.set(townId, {
      townId,
      label: TOWN_LABEL[townId] ?? townId,
      lines,
      series: enactedSeries(lines),
    });
  }
  return out;
}
