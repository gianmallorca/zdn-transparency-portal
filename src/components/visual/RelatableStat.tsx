import { php } from '../../lib/format';
import { perResidentCopy, PROVINCE_POPULATION } from '../../lib/population';
import InfoTip from './InfoTip';

export default function RelatableStat({
  label,
  amount,
  tip,
  population = PROVINCE_POPULATION,
  accent = false,
}: {
  label: string;
  amount: number | null;
  tip?: string;
  population?: number;
  accent?: boolean;
}) {
  const per = perResidentCopy(amount, population);
  return (
    <div className="relatable-stat">
      <dt className="label">
        {label}
        {tip && (
          <>
            {' '}
            <InfoTip>{tip}</InfoTip>
          </>
        )}
      </dt>
      <dd className={`stat num${accent ? ' stat-accent' : ''}`}>{per ? per.friendly : php(amount)}</dd>
      {per && <dd className="relatable-exact">{per.exact}</dd>}
      {!per && amount != null && <dd className="stat-sub muted">{php(amount)}</dd>}
    </div>
  );
}
