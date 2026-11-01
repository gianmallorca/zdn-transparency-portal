import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { count, php, plural } from '../../lib/format';
import { perResidentCopy, townPopulation } from '../../lib/population';
import { DISTRICT_WIDE, type TownBucket } from '../../lib/towns';
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

  useEffect(() => {
    if (!bucket) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [bucket, onClose]);

  if (!bucket) return null;

  const pop = bucket.townId !== DISTRICT_WIDE ? townPopulation(bucket.townId) : null;
  const per = perResidentCopy(bucket.totalPhp, pop);
  const sorted = [...bucket.projects].sort(
    (a, b) => (b.house_php ?? b.nep_php ?? 0) - (a.house_php ?? a.nep_php ?? 0),
  );

  return (
    <div className="town-sheet-root" role="presentation">
      <button type="button" className="town-sheet-backdrop" aria-label="Close town panel" onClick={onClose} />
      <div
        ref={panelRef}
        className="town-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="town-sheet-handle" aria-hidden="true" />
        <header className="town-sheet-head">
          <div>
            <h2 id={titleId} className="town-sheet-title">{bucket.label}</h2>
            <p className="town-sheet-sub">
              {plural(bucket.projects.length, 'project')}
              <span className="sep">·</span>
              {php(bucket.totalPhp)} proposed
            </p>
            {per && (
              <p className="relatable">
                <span className="relatable-friendly">{per.friendly}</span>
                <span className="relatable-exact">{per.exact}</span>
              </p>
            )}
          </div>
          <button type="button" className="town-sheet-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>
        <div className="town-sheet-list">
          {sorted.length === 0 ? (
            <p className="state">No projects mapped to this place.</p>
          ) : (
            sorted.map((p) => <ProjectCard key={p.key} project={p} />)
          )}
          <p className="fine">{count(sorted.length)} listed · amounts from the BetterGov Budget API</p>
        </div>
      </div>
    </div>
  );
}
