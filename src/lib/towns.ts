/**
 * Resolve a scoped project to a ZDN municipality/city for the map.
 * Matching uses title / program / PAP / office text against known place aliases.
 * Unresolved rows are grouped as district-wide under their DPWH office.
 */
import { ZDN_PLACES, ZDN_PROVINCE, matchZdn } from './zdn';
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
