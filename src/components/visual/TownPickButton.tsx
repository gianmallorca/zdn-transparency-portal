import { ChevronRight } from 'lucide-react';
import { php, plural } from '../../lib/format';
import type { TownBucket } from '../../lib/towns';

export default function TownPickButton({
  label,
  bucket,
  active = false,
  onPick,
}: {
  label: string;
  bucket: TownBucket;
  active?: boolean;
  onPick: (b: TownBucket) => void;
}) {
  return (
    <button
      type="button"
      className={`click-box town-pick-btn${active ? ' is-active' : ''}`}
      onClick={() => onPick(bucket)}
      aria-pressed={active}
    >
      <span className="click-box-copy">
        <span className="click-box-title">{label}</span>
        <span className="click-box-meta">
          <span className="click-box-accent">{php(bucket.totalPhp)}</span>
          <span className="click-box-sub">{plural(bucket.projects.length, 'project')}</span>
        </span>
      </span>
      <ChevronRight className="click-box-chevron" size={18} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}
