/**
 * How this portal decides a budget line belongs to Zamboanga del Norte.
 *
 * The Budget API rarely tags a city or municipality. Matching is by text in
 * operating-unit, agency, and program/project titles, plus region IX only as a
 * keep-filter when a line already carries a region. Region IX alone is never
 * enough: it covers the whole Zamboanga Peninsula.
 *
 * These rules are printed on the About page. Keep the two in sync.
 */

/** Cities (component) and the 25 municipalities of the province. */
export interface ZdnPlace {
  /** Canonical label for “why listed”. */
  label: string;
  /** Forms matched as whole words / phrases (case-insensitive). */
  aliases: string[];
  /**
   * Ambiguous names also used outside ZDN (Rizal, Roxas, La Libertad, …).
   * They match only with a ZDN anchor in the same text.
   */
  needsAnchor?: boolean;
}

export const ZDN_PROVINCE = 'Zamboanga del Norte';

/** False provinces / cities in Region IX — never treat as ZDN. */
export const ZDN_FALSE_PLACES = [
  'Zamboanga del Sur',
  'Zamboanga Sibugay',
  'Zamboanga City',
  'City of Zamboanga',
] as const;

/**
 * Operating units / agencies that sit in ZDN even when the title omits the
 * province (DepEd city divisions, JRMSU, the provincial hospital, …).
 */
export const ZDN_KNOWN_UNITS: { label: string; pattern: RegExp }[] = [
  { label: 'Division of Dipolog City', pattern: /\bdivision of dipolog\b/i },
  { label: 'Division of Dapitan City', pattern: /\bdivision of dapitan\b/i },
  { label: 'Jose Rizal Memorial State University', pattern: /\bjose rizal memorial state university\b|\bjrmsu\b/i },
  { label: 'Dr. Jose Rizal Memorial Hospital', pattern: /\bdr\.?\s*jose rizal memorial hospital\b/i },
  { label: 'Dipolog School of Fisheries', pattern: /\bdipolog school of fisheries\b/i },
  { label: 'PENRO Zamboanga del Norte', pattern: /\bpenro\s+zamboanga del norte\b/i },
  { label: 'CENRO (Zamboanga del Norte)', pattern: /\bcenro\b.{0,40}\bzamboanga del norte\b|\bzamboanga del norte\b.{0,40}\bcenro\b/i },
  { label: 'PARO Zamboanga del Norte', pattern: /\bparo\b.{0,20}\bzamboanga del norte\b/i },
];

/**
 * GAA agency ids that are wholly in ZDN (fetch every program under them).
 * JRMSU does not put the province in every program name.
 */
export const ZDN_GAA_AGENCIES: { agency_id: string; label: string; department_id: string }[] = [
  { agency_id: '08-085', label: 'Jose Rizal Memorial State University', department_id: '08' },
];

/** Searches run against every GAA department and every House-bill program. */
export const ZDN_PRIMARY_QUERIES: string[] = [
  'Zamboanga del Norte',
  'Dipolog',
  'Dapitan',
];

/**
 * Extra title searches for departments that list local projects by municipality
 * (DPWH, DA, DOH). Other departments rarely put a barangay name without the
 * province, which the primary queries already catch.
 */
export const ZDN_EXTRA_QUERIES: string[] = [
  'Sindangan',
  'Liloy',
  'Siocon',
  'Sibuco',
  'Sirawai',
  'Manukan',
  'Labason',
  'Salug',
  'Jose Dalman',
  'Leon B. Postigo',
  'President Manuel A. Roxas',
];

/** GAA / House-bill department ids that get the extra municipality searches. */
export const ZDN_EXTRA_DEPARTMENTS = new Set(['18', '05', '13']);

/** All API search strings (primary + extra), for docs and progress labels. */
export const ZDN_SEARCH_QUERIES: string[] = [...ZDN_PRIMARY_QUERIES, ...ZDN_EXTRA_QUERIES];

/** Full place list for client-side title / OU matching. */
export const ZDN_PLACES: ZdnPlace[] = [
  { label: 'Zamboanga del Norte', aliases: ['Zamboanga del Norte', 'Zamboanga Del Norte'] },
  { label: 'Dipolog', aliases: ['Dipolog City', 'Dipolog'] },
  { label: 'Dapitan', aliases: ['Dapitan City', 'Dapitan'] },
  { label: 'Bacungan (Leon B. Postigo)', aliases: ['Leon B. Postigo', 'Leon B Postigo', 'Bacungan'] },
  { label: 'Baliguian', aliases: ['Baliguian'] },
  { label: 'Godod', aliases: ['Godod'] },
  { label: 'Gutalac', aliases: ['Gutalac'] },
  { label: 'Jose Dalman', aliases: ['Jose Dalman'] },
  { label: 'Kalawit', aliases: ['Kalawit'] },
  { label: 'Katipunan', aliases: ['Katipunan'] },
  { label: 'La Libertad', aliases: ['La Libertad'], needsAnchor: true },
  { label: 'Labason', aliases: ['Labason'] },
  { label: 'Liloy', aliases: ['Liloy'] },
  { label: 'Manukan', aliases: ['Manukan'] },
  { label: 'Mutia', aliases: ['Mutia'] },
  { label: 'Piñan', aliases: ['Piñan', 'Pinan'] },
  { label: 'Polanco', aliases: ['Polanco'] },
  { label: 'President Manuel A. Roxas', aliases: ['President Manuel A. Roxas', 'Pres. Manuel A. Roxas', 'President Manuel Roxas'] },
  { label: 'Rizal', aliases: ['Rizal'], needsAnchor: true },
  { label: 'Salug', aliases: ['Salug'] },
  { label: 'Sergio Osmeña Sr.', aliases: ['Sergio Osmeña', 'Sergio Osmena', 'Sergio Osmeña Sr', 'Sergio Osmena Sr'] },
  { label: 'Siayan', aliases: ['Siayan'] },
  { label: 'Sibuco', aliases: ['Sibuco'] },
  { label: 'Sibutad', aliases: ['Sibutad'] },
  { label: 'Sindangan', aliases: ['Sindangan'] },
  { label: 'Siocon', aliases: ['Siocon'] },
  { label: 'Sirawai', aliases: ['Sirawai'] },
  { label: 'Tampilisan', aliases: ['Tampilisan'] },
];

export interface ZdnMatch {
  matched: true;
  /** Place or known-unit labels that fired. */
  reasons: string[];
}

export interface ZdnReject {
  matched: false;
  reason?: string;
}

const FALSE_RE = ZDN_FALSE_PLACES.map((p) => new RegExp(`\\b${escapeRe(p)}\\b`, 'i'));

/** Peninsula-wide or other-province units that must not count as ZDN. */
const LUMP_OR_OTHER_RE: RegExp[] = [
  /\bzamboanga peninsula\b/i,
  /\bregion ix\b/i,
  /\bregional office\s*[-–]?\s*ix\b/i,
  /\bzamboanga peninsula polytechnic\b/i,
  /\bzamboanga state college of marine\b/i,
  /\bzamboanga city medical center\b/i,
  /\bzamboanga regional medical center\b/i,
  /\bzamboanga city treatment\b/i,
  /\bzamboanga peninsula center for health\b/i,
  /\bdivision of roxas city\b/i,
  /\broxas city\b/i,
  /\buniversity of rizal\b/i,
  /\brizal technological university\b/i,
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '');
}

function hasFalsePlace(text: string): boolean {
  const n = normalize(text);
  // "Zamboanga del Norte" must not trip "Zamboanga" alone; use full false names.
  return FALSE_RE.some((re) => re.test(n));
}

function hasProvinceAnchor(text: string): boolean {
  return /\bzamboanga del norte\b/i.test(normalize(text));
}

function hasCityAnchor(text: string): boolean {
  const n = normalize(text);
  return /\bdipolog\b/i.test(n) || /\bdapitan\b/i.test(n);
}

function hasZdnAnchor(text: string): boolean {
  return hasProvinceAnchor(text) || hasCityAnchor(text) || ZDN_KNOWN_UNITS.some((u) => u.pattern.test(text));
}

function aliasPattern(alias: string): RegExp {
  // Whole-phrase match; allow flexible whitespace.
  const body = escapeRe(normalize(alias)).replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${body}(?=$|[^\\p{L}\\p{N}])`, 'iu');
}

/**
 * True when `text` (title, operating unit, or agency name) is about ZDN and
 * not a false peninsula match. Optional `regionKey` (e.g. HGAB `region_key`)
 * drops lines tagged to another region; region IX or missing region is kept.
 */
export function matchZdn(
  text: string | null | undefined,
  opts: { regionKey?: string | null } = {},
): ZdnMatch | ZdnReject {
  if (!text || !text.trim()) return { matched: false, reason: 'empty' };
  const { regionKey } = opts;
  if (regionKey != null && regionKey !== '' && regionKey !== 'IX') {
    return { matched: false, reason: `region ${regionKey}` };
  }

  if (LUMP_OR_OTHER_RE.some((re) => re.test(text)) && !hasProvinceAnchor(text)) {
    return { matched: false, reason: 'peninsula or other-province unit' };
  }
  if (hasFalsePlace(text) && !hasProvinceAnchor(text)) {
    return { matched: false, reason: 'false Zamboanga place' };
  }

  const reasons: string[] = [];
  for (const u of ZDN_KNOWN_UNITS) {
    if (u.pattern.test(text)) reasons.push(u.label);
  }
  if (hasProvinceAnchor(text)) reasons.push(ZDN_PROVINCE);

  const n = normalize(text);
  for (const place of ZDN_PLACES) {
    if (place.label === ZDN_PROVINCE) continue;
    const hit = place.aliases.some((a) => aliasPattern(a).test(n));
    if (!hit) continue;
    if (place.needsAnchor && !hasZdnAnchor(text) && !hasProvinceAnchor(text)) continue;
    // "Roxas" without the presidential municipality form: skip bare Roxas City etc.
    if (place.label.startsWith('President Manuel') && /\broxas city\b/i.test(n) && !/president|pres\.?/i.test(n)) continue;
    reasons.push(place.label);
  }

  // Deduplicate while preserving order.
  const uniq = [...new Set(reasons)];
  if (!uniq.length) return { matched: false, reason: 'no ZDN place or unit' };
  return { matched: true, reasons: uniq };
}

export function isZdnText(text: string | null | undefined, regionKey?: string | null): boolean {
  return matchZdn(text, { regionKey }).matched;
}

/** Plain-language rules for the About page. */
export const ZDN_MATCH_RULES: string[] = [
  'A line is listed for Zamboanga del Norte when its operating unit, agency, or title names the province, Dipolog, Dapitan, or one of the province’s 25 municipalities — or a known ZDN unit such as a DepEd division, JRMSU, Dr. Jose Rizal Memorial Hospital, DENR PENRO/CENRO Zamboanga del Norte, or DAR PARO Zamboanga del Norte.',
  'Titles tagged to a region other than IX are dropped. Region IX alone is never enough: it covers Zamboanga del Sur, Zamboanga Sibugay, and Zamboanga City as well.',
  'Lines that name Zamboanga City, Zamboanga del Sur, Zamboanga Sibugay, or peninsula-wide offices (for example DA/DSWD “Regional Office – IX”) are excluded, unless they also clearly name Zamboanga del Norte.',
  'Ambiguous names such as Rizal and La Libertad count only when a ZDN anchor (the province, Dipolog, Dapitan, or a known ZDN unit) appears in the same text.',
  'Many agency budgets are national or regional lump sums with no location in the documents. Those cannot be shown as ZDN figures — the portal does not invent a share.',
  'Amounts are budgeted appropriations (NEP proposal, House bill, or enacted GAA), not money spent. A dash means that document has no such line, not zero. The NEP and the House bill are never added together.',
];
