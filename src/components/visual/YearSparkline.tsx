import { GAA_YEARS, type GaaYear } from '../../api/types';
import { php, phpFull } from '../../lib/format';

const W = 280;
const H = 56;
const PAD = { t: 6, r: 8, b: 18, l: 8 };

/** Compact 2020–2026 SVG sparkline — same gap rules as Figures OfficeTrend. */
export default function YearSparkline({
  series,
  label,
}: {
  series: { year: GaaYear; amount: number | null }[];
  label: string;
}) {
  const known = series.map((p) => p.amount).filter((n): n is number => n != null && n > 0);
  if (!known.length) return null;
  const max = Math.max(...known);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / (GAA_YEARS.length - 1)) * innerW;
  const y = (v: number) => PAD.t + (1 - v / max) * innerH;

  const segments: string[] = [];
  let current = '';
  series.forEach((p, i) => {
    if (p.amount == null) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.amount).toFixed(1)}`;
  });
  if (current) segments.push(current);

  return (
    <figure className="year-spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {segments.map((d) => (
          <path key={d} d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
        ))}
        {series.map((p, i) =>
          p.amount != null ? (
            <circle key={p.year} cx={x(i)} cy={y(p.amount)} r="3" fill="var(--accent)">
              <title>{`${p.year}: ${phpFull(p.amount)}`}</title>
            </circle>
          ) : null,
        )}
        {GAA_YEARS.map((year, i) => (
          <text key={year} x={x(i)} y={H - 2} textAnchor="middle" fill="var(--ink-3)" fontSize="9">
            {String(year).slice(2)}
          </text>
        ))}
      </svg>
      <ul className="year-spark-years">
        {series.map((p) => (
          <li key={p.year}>
            <span className="label">{p.year}</span>
            <span className="num">{p.amount == null ? '—' : php(p.amount)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
