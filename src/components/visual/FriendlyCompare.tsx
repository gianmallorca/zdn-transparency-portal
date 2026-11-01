import { useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { php, phpDelta } from '../../lib/format';

export interface CompareRow {
  id: string;
  label: string;
  /** Positive = increase vs baseline. */
  deltaPhp: number | null;
  /** Optional percent for the expandable detail. */
  pct: number | null;
  currentPhp: number | null;
  baselinePhp: number | null;
  baselineLabel: string;
  currentLabel: string;
}

function sentence(row: CompareRow): { dir: 'up' | 'down' | 'flat'; text: string } {
  if (row.deltaPhp == null || row.deltaPhp === 0) {
    return { dir: 'flat', text: `${row.label}: about the same as ${row.baselineLabel}` };
  }
  if (row.deltaPhp > 0) {
    return { dir: 'up', text: `${row.label}: more than ${row.baselineLabel}` };
  }
  return { dir: 'down', text: `${row.label}: less than ${row.baselineLabel}` };
}

export default function FriendlyCompare({
  title,
  rows,
}: {
  title: string;
  rows: CompareRow[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!rows.length) return null;

  return (
    <section className="friendly-compare" aria-label={title}>
      <h3 className="friendly-compare-h">{title}</h3>
      <ul className="friendly-list">
        {rows.map((row) => {
          const s = sentence(row);
          const open = openId === row.id;
          const Icon = s.dir === 'up' ? ArrowUp : s.dir === 'down' ? ArrowDown : Minus;
          return (
            <li key={row.id}>
              <button
                type="button"
                className={`friendly-row dir-${s.dir}`}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : row.id)}
              >
                <span className={`friendly-arrow dir-${s.dir}`} aria-hidden="true">
                  <Icon size={28} strokeWidth={2.25} />
                </span>
                <span className="friendly-text">
                  <span className="friendly-sentence">{s.text}</span>
                  <span className="friendly-cue muted">{open ? 'Hide figures' : 'Show figures'}</span>
                </span>
              </button>
              {open && (
                <div className="friendly-detail">
                  <p>
                    {row.currentLabel}: <span className="num">{php(row.currentPhp)}</span>
                    <span className="sep">·</span>
                    {row.baselineLabel}: <span className="num">{php(row.baselinePhp)}</span>
                  </p>
                  <p>
                    Change: <span className="num">{phpDelta(row.deltaPhp)}</span>
                    {row.pct != null && Number.isFinite(row.pct) && (
                      <>
                        <span className="sep">·</span>
                        {row.pct > 0 ? '+' : ''}
                        {row.pct.toFixed(1)}%
                      </>
                    )}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
