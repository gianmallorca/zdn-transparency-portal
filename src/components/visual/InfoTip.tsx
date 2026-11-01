import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type PanelPos = { top: number; left: number; place: 'below' | 'above'; arrowLeft: number };

/** Inviting trivia tip for jargon and figures (NEP / GAA / House). */
export default function InfoTip({
  label = 'Check this',
  title = 'Good to know',
  children,
}: {
  label?: string;
  title?: string;
  children: ReactNode;
}) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);

  const close = () => {
    setOpen(false);
    setPos(null);
    btnRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;

    const place = () => {
      const btn = btnRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!btn) return;

      const gap = 10;
      const width = panel?.width ?? Math.min(320, window.innerWidth - 24);
      const height = panel?.height ?? 120;
      const pad = 12;

      let left = btn.left + btn.width / 2 - width / 2;
      left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

      const belowTop = btn.bottom + gap;
      const aboveTop = btn.top - gap - height;
      const fitsBelow = belowTop + height <= window.innerHeight - pad;
      const placeSide: PanelPos['place'] = fitsBelow || aboveTop < pad ? 'below' : 'above';
      const top = placeSide === 'below' ? belowTop : Math.max(pad, aboveTop);

      const arrowLeft = Math.max(16, Math.min(btn.left + btn.width / 2 - left, width - 16));
      setPos({ top, left, place: placeSide, arrowLeft });
    };

    place();
    // Second pass after panel mounts with real size
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setPos(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  return (
    <span className={`info-tip${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="info-tip-btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="info-tip-q" aria-hidden="true">?</span>
        <span className="info-tip-label">{open ? 'Got it' : label}</span>
      </button>
      {open &&
        createPortal(
          <span
            ref={panelRef}
            id={id}
            role="note"
            className={`info-tip-panel info-tip-panel-${pos?.place ?? 'below'}`}
            style={
              pos
                ? { top: pos.top, left: pos.left, ['--tip-arrow' as string]: `${pos.arrowLeft}px` }
                : { visibility: 'hidden', top: 0, left: 0 }
            }
          >
            <span className="info-tip-head">
              <span className="info-tip-title">{title}</span>
              <button type="button" className="info-tip-dismiss" aria-label="Close tip" onClick={close}>
                <X size={14} strokeWidth={2.25} aria-hidden="true" />
              </button>
            </span>
            <span className="info-tip-body">{children}</span>
          </span>,
          document.body,
        )}
    </span>
  );
}
