import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Bridge,
  Building2,
  ChevronRight,
  CircleDot,
  Droplets,
  HeartPulse,
  Minus,
  Route,
  Tractor,
} from 'lucide-react';
import { php, phpFull } from '../../lib/format';
import {
  changeVsNep,
  projectCategory,
  plainTitle,
  programPlain,
  stageBadge,
  type ProjectCategory,
} from '../../lib/project-plain';
import type { ScopedProject } from '../../lib/scope';

const ICONS: Record<ProjectCategory, typeof Bridge> = {
  bridge: Bridge,
  road: Route,
  building: Building2,
  farm_road: Tractor,
  irrigation: Droplets,
  health: HeartPulse,
  generic: CircleDot,
};

export default function ProjectCard({
  project: p,
  compact = false,
}: {
  project: ScopedProject;
  compact?: boolean;
}) {
  const cat = projectCategory(p);
  const Icon = ICONS[cat];
  const stage = stageBadge(p);
  const change = changeVsNep(p);
  const amount = p.house_php ?? p.nep_php;
  const ChangeIcon = change?.dir === 'up' || change?.dir === 'new'
    ? ArrowUp
    : change?.dir === 'down' || change?.dir === 'cut'
      ? ArrowDown
      : Minus;
  const href = `/projects/${p.dataset}/${encodeURIComponent(p.id)}`;

  if (compact) {
    const stageShort =
      stage.kind === 'both' ? 'In both'
        : stage.kind === 'house' ? 'House only'
          : stage.kind === 'nep' ? 'Proposal only'
            : stage.label;
    return (
      <Link to={href} className="pcard pcard-compact pcard-row">
        <div className="pcard-icon" aria-hidden="true">
          <Icon size={16} strokeWidth={1.75} />
        </div>
        <div className="pcard-body">
          <h3 className="pcard-title">{plainTitle(p)}</h3>
          <div className="pcard-meta">
            <span className={`pcard-badge stage-${stage.kind}`} title={stage.tip}>
              {stageShort}
            </span>
            {change && change.dir !== 'same' && (
              <span className={`pcard-change change-${change.dir}`}>
                <ChangeIcon size={12} aria-hidden="true" />
                {change.text}
              </span>
            )}
          </div>
        </div>
        <div className="pcard-amount">
          <span className="pcard-amount-value">{php(amount)}</span>
          <span className="pcard-amount-prog">{programPlain(p.dataset)}</span>
          <span className="pcard-open">
            Open
            <ChevronRight size={14} strokeWidth={2.25} aria-hidden="true" />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <article className="pcard">
      <div className="pcard-icon" aria-hidden="true">
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <div className="pcard-body">
        <h3 className="pcard-title">{plainTitle(p)}</h3>
        <div className="pcard-meta">
          <span className={`pcard-badge stage-${stage.kind}`} title={stage.tip}>
            {stage.label}
          </span>
          {change && change.dir !== 'same' && (
            <span className={`pcard-change change-${change.dir}`}>
              <ChangeIcon size={14} aria-hidden="true" />
              {change.text}
            </span>
          )}
        </div>
        <p className="pcard-exact muted">
          {phpFull(amount)}
          <span className="sep">·</span>
          {programPlain(p.dataset)}
          {p.house_php != null && p.nep_php != null && p.house_php !== p.nep_php && (
            <>
              <span className="sep">·</span>
              Proposal {php(p.nep_php)} → House {php(p.house_php)}
            </>
          )}
        </p>
        <Link className="pcard-link" to={href}>
          View details
        </Link>
      </div>
    </article>
  );
}
