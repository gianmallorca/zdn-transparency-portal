/**
 * Plain-language project cards: category icons + one-sentence titles.
 * Categories are derived from dataset / agency / program / title text.
 */
import type { DatasetKey } from '../config';
import type { BridgeGroup } from '../api/types';
import { php } from './format';
import type { ScopedProject } from './scope';

export type ProjectCategory = 'bridge' | 'road' | 'building' | 'farm_road' | 'irrigation' | 'health' | 'generic';

export function projectCategory(p: ScopedProject): ProjectCategory {
  const hay = [p.title, p.program, p.pap, p.dataset].filter(Boolean).join(' ').toLowerCase();
  if (p.dataset === 'hfep' || /\b(hospital|health|rhus?|barangay health|birthing|medical)\b/.test(hay)) return 'health';
  if (p.dataset === 'nia' || /\b(irrigation|nis|cis|canal|n\.?\s*i\.?\s*a\.?)\b/.test(hay)) return 'irrigation';
  if (p.dataset === 'fmr' || /\bfarm[- ]?to[- ]?market\b|\bfmr\b/.test(hay)) return 'farm_road';
  if (/\bbridge\b|\bbypass bridge\b/.test(hay)) return 'bridge';
  if (/\b(road|highway|pavement|concrete|asphalt|pathway|access)\b/.test(hay)) return 'road';
  if (/\b(building|school|classroom|multi-purpose|evacuation|covered court|hospital|facility)\b/.test(hay)) return 'building';
  if (p.dataset === 'dpwh') return 'road';
  return 'generic';
}

const CATEGORY_LABEL: Record<ProjectCategory, string> = {
  bridge: 'Bridge',
  road: 'Road',
  building: 'Building',
  farm_road: 'Farm road',
  irrigation: 'Irrigation',
  health: 'Health',
  generic: 'Project',
};

export function categoryLabel(c: ProjectCategory): string {
  return CATEGORY_LABEL[c];
}

/** Pull a barangay / place fragment from a title when present. */
function placeHint(title: string): string | null {
  const brgy = /\b(?:Barangay|Brgy\.?)\s+([A-Za-zÑñ][\wÑñ]*(?:\s+[A-Za-zÑñ][\wÑñ]*){0,3})/i.exec(title);
  if (brgy?.[1]) return `Barangay ${brgy[1].trim()}`;
  const inOf = /\b(?:in|at|for)\s+([A-ZÑ][\wÑñ]*(?:\s+[A-ZÑ][\wÑñ]*){0,4})/.exec(title);
  if (inOf?.[1] && !/Construction|Rehabilitation|Improvement|Proposed/i.test(inOf[1])) return inOf[1].trim();
  return null;
}

function kindNoun(cat: ProjectCategory, title: string): string {
  if (cat === 'bridge' || /\bbridge\b/i.test(title)) return 'bridge';
  if (cat === 'farm_road') return 'farm-to-market road';
  if (cat === 'irrigation') return 'irrigation project';
  if (cat === 'health') {
    if (/\bhospital\b/i.test(title)) return 'hospital project';
    if (/\brhu\b|health station|barangay health/i.test(title)) return 'health facility';
    return 'health project';
  }
  if (cat === 'building') {
    if (/\bschool|classroom\b/i.test(title)) return 'school building';
    return 'building project';
  }
  if (cat === 'road' || /\broad\b/i.test(title)) return 'road';
  return 'project';
}

/**
 * One-sentence plain title, e.g. "₱100M bridge for Barangay La Union".
 * Uses House amount when present, else NEP.
 */
export function plainTitle(p: ScopedProject): string {
  const amount = p.house_php ?? p.nep_php;
  const cat = projectCategory(p);
  const noun = kindNoun(cat, p.title);
  const place = placeHint(p.title);
  const money = amount != null ? php(amount) : 'A';
  if (place) return `${money} ${noun} for ${place}`;
  // Fall back: shorten the official title.
  const short = p.title
    .replace(/^(Construction|Rehabilitation|Improvement|Repair|Proposed Construction)\s+(of\s+)?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (short.length > 0 && short.length < 90) return `${money} ${noun}: ${short}`;
  return `${money} ${noun}`;
}

export type StageKind = 'house' | 'nep' | 'both' | 'gaa';

export function stageBadge(p: ScopedProject): { kind: StageKind; label: string; tip: string } {
  const hasNep = p.nep_php != null;
  const hasHouse = p.house_php != null;
  if (p.bridge_group === 'house_only' || (hasHouse && !hasNep)) {
    return {
      kind: 'house',
      label: 'House version',
      tip: 'In the House bill (HB 10858) but not in the President’s proposal (NEP).',
    };
  }
  if (p.bridge_group === 'nep_only' || (hasNep && !hasHouse)) {
    return {
      kind: 'nep',
      label: 'President’s proposal',
      tip: 'In the National Expenditure Program (NEP) — the budget the President submits — but not in the House bill.',
    };
  }
  return {
    kind: 'both',
    label: 'In both versions',
    tip: 'Appears in both the President’s proposal (NEP) and the House bill. Compare the amounts; do not add them.',
  };
}

export function changeVsNep(p: ScopedProject): { dir: 'up' | 'down' | 'same' | 'new' | 'cut'; text: string } | null {
  if (p.bridge_group === 'house_only') return { dir: 'new', text: 'Added by the House' };
  if (p.bridge_group === 'nep_only') return { dir: 'cut', text: 'Not in the House bill' };
  if (p.delta_php == null || p.delta_php === 0) return { dir: 'same', text: 'Same as the proposal' };
  if (p.delta_php > 0) return { dir: 'up', text: `${php(p.delta_php)} more than the proposal` };
  return { dir: 'down', text: `${php(Math.abs(p.delta_php))} less than the proposal` };
}

export function programPlain(dataset: DatasetKey): string {
  switch (dataset) {
    case 'dpwh': return 'Public works';
    case 'fmr': return 'Farm-to-market roads';
    case 'hfep': return 'Health facilities';
    case 'nia': return 'Irrigation';
  }
}

export function groupFriendly(g: BridgeGroup): string {
  switch (g) {
    case 'house_only': return 'Added by the House';
    case 'nep_only': return 'Only in the proposal';
    case 'unchanged': return 'Unchanged';
    case 'increased': return 'Increased';
    case 'decreased': return 'Decreased';
    case 'scope_review': return 'Needs a closer look';
  }
}
