import { useCallback, useEffect, useId, useRef, useState, type TouchEvent } from 'react';
import { X } from 'lucide-react';
import { count, php, plural } from '../../lib/format';
import { perResidentCopy, townPopulation } from '../../lib/population';
import { DISTRICT_WIDE, TOWN_LABEL, type TownBucket } from '../../lib/towns';
import HearingsMentions from './HearingsMentions';
import InfoTip from './InfoTip';
import PastYearsSection from './PastYearsSection';
import ProjectCard from './ProjectCard';

export default function TownPanel({
  bucket,
  onClose,
}: {
  bucket: TownBucket | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [cached, setCached] = useState<TownBucket | null>(null);
  const [entered, setEntered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragY = useRef(0);
  const startY = useRef<number | null>(null);
  const closing = useRef(false);
  const openTimer = useRef(0);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    window.clearTimeout(openTimer.current);
    setEntered(false);
    window.setTimeout(onClose, 280);
  }, [onClose]);

  useEffect(() => {
    if (!bucket) {
      window.clearTimeout(openTimer.current);
      const closeAnim = window.setTimeout(() => setEntered(false), 0);
      const t = window.setTimeout(() => setCached(null), 300);
      return () => {
        window.clearTimeout(closeAnim);
        window.clearTimeout(t);
      };
    }

    closing.current = false;
    const apply = window.setTimeout(() => {
      setCached(bucket);
      listRef.current?.scrollTo({ top: 0 });
    }, 0);
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setEntered(true), 16);

    return () => {
      window.clearTimeout(apply);
      window.clearTimeout(openTimer.current);
    };
  }, [bucket]);

  useEffect(() => {
    if (!cached) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [cached, requestClose]);

  useEffect(() => {
    if (entered && bucket) panelRef.current?.focus();
  }, [entered, bucket]);

  const onTouchStart = (e: TouchEvent) => {
    startY.current = e.touches[0]?.clientY ?? null;
    dragY.current = 0;
    setDragging(true);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (startY.current == null) return;
    const dy = Math.max(0, (e.touches[0]?.clientY ?? startY.current) - startY.current);
    dragY.current = dy;
    panelRef.current?.style.setProperty('--sheet-drag', `${dy}px`);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (dragY.current > 100) {
      panelRef.current?.style.setProperty('--sheet-drag', '0px');
      requestClose();
    } else {
      panelRef.current?.style.setProperty('--sheet-drag', '0px');
    }
    startY.current = null;
    dragY.current = 0;
  };

  if (!cached) return null;

  const pop = cached.townId !== DISTRICT_WIDE ? townPopulation(cached.townId) : null;
  const per = perResidentCopy(cached.totalPhp, pop);
  const sorted = [...cached.projects].sort(
    (a, b) => (b.house_php ?? b.nep_php ?? 0) - (a.house_php ?? a.nep_php ?? 0),
  );

  return (
    <div
      className={`town-sheet-root${entered ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="town-sheet-backdrop"
        aria-label="Close town panel"
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        className="town-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div
          className="town-sheet-handle"
          aria-hidden="true"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span />
        </div>
        <header className="town-sheet-head">
          <div className="town-sheet-head-copy">
            <p className="label town-sheet-kicker">Projects in this town</p>
            <h2 id={titleId} className="town-sheet-title">{cached.label}</h2>
            <div className="town-sheet-chips" role="list">
              <span className="town-chip" role="listitem">
                <strong>{count(cached.projects.length)}</strong>
                <span>{cached.projects.length === 1 ? 'project' : 'projects'}</span>
              </span>
              <span className="town-chip town-chip-accent" role="listitem">
                <strong>{php(sorted.length ? cached.totalPhp : null)}</strong>
                <span>proposed</span>
              </span>
              {per && sorted.length > 0 && (
                <span className="town-chip" role="listitem">
                  <strong>{per.friendly.replace(/\s+per resident$/i, '')}</strong>
                  <span>per resident</span>
                </span>
              )}
            </div>
            {per && sorted.length > 0 && <p className="relatable-exact town-sheet-exact">{per.exact}</p>}
          </div>
          <button type="button" className="town-sheet-close" onClick={requestClose}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
            <span className="town-sheet-close-label">Close</span>
          </button>
        </header>
        <div className="town-sheet-list" ref={listRef}>
          <section className="town-sheet-block" aria-labelledby={`${titleId}-projects`}>
            <div className="section-head-row">
              <h3 id={`${titleId}-projects`} className="friendly-compare-h">
                2027 projects in this town
              </h3>
              <InfoTip label="What's this?" title="Town projects">
                Named 2027 projects in this portal whose titles place them in {cached.label}. Missing amounts show as a dash, never ₱0.
              </InfoTip>
            </div>
            <p className="label town-sheet-list-label">Largest first</p>
            {sorted.length === 0 ? (
              <p className="section-empty">No named project found for this town in the 2027 data</p>
            ) : (
              <ul className="town-sheet-cards">
                {sorted.map((p) => (
                  <li key={p.key}>
                    <ProjectCard project={p} compact />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {cached.townId !== DISTRICT_WIDE && (
            <>
              <PastYearsSection
                townId={cached.townId}
                townLabel={TOWN_LABEL[cached.townId] ?? cached.label}
              />
              <HearingsMentions
                query={TOWN_LABEL[cached.townId] ?? cached.label}
                emptyMessage="No hearing mentions found for this town"
              />
            </>
          )}

          <p className="fine town-sheet-foot">
            {plural(sorted.length, 'project')} · BetterGov Budget API
          </p>
        </div>
      </div>
    </div>
  );
}
