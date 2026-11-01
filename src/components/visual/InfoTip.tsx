import { useId, useState, type ReactNode } from 'react';

/** Small “What’s this?” control for jargon (NEP / GAA / House). */
export default function InfoTip({ label = "What's this?", children }: { label?: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="info-tip">
      <button
        type="button"
        className="info-tip-btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <span id={id} role="note" className="info-tip-panel">
          {children}
        </span>
      )}
    </span>
  );
}
