import { useEffect, useMemo, useState } from 'react';
import type { HearingHit } from '../../api/types';
import { External } from '../Bits';
import InfoTip from './InfoTip';
import { usePortal } from '../../lib/portal-context';

const AGENCY_CHIPS: { id: string; label: string; match?: RegExp }[] = [
  { id: 'all', label: 'All' },
  { id: 'DPWH', label: 'DPWH', match: /DPWH/i },
  { id: 'DA/NIA', label: 'DA/NIA', match: /DA|NIA/i },
  { id: 'DOH', label: 'DOH', match: /DOH/i },
];

type LoadState =
  | { query: string; status: 'loading' }
  | { query: string; status: 'error'; error: string }
  | { query: string; status: 'ready'; hits: HearingHit[] };

export default function HearingsMentions({
  query,
  emptyMessage = 'No hearing mentions found',
  showHeading = true,
}: {
  query: string;
  emptyMessage?: string;
  showHeading?: boolean;
}) {
  const { client } = usePortal();
  const [load, setLoad] = useState<LoadState>({ query, status: 'loading' });
  const [chip, setChip] = useState('all');

  useEffect(() => {
    let cancelled = false;
    client
      .hearingSearch(query)
      .then((res) => {
        if (!cancelled) {
          setChip('all');
          setLoad({ query, status: 'ready', hits: res.data ?? [] });
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setLoad({ query, status: 'error', error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [client, query]);

  const active = load.query === query ? load : { query, status: 'loading' as const };
  const hits = active.status === 'ready' ? active.hits : null;
  const error = active.status === 'error' ? active.error : null;

  const filtered = useMemo(() => {
    if (!hits) return [];
    if (chip === 'all') return hits;
    const rule = AGENCY_CHIPS.find((c) => c.id === chip);
    if (!rule?.match) return hits;
    return hits.filter((h) => rule.match!.test(h.hearing.agency));
  }, [hits, chip]);

  const headingId = `hearing-h-${query.replace(/\W+/g, '-')}`;

  return (
    <section className="hearing-section" aria-labelledby={showHeading ? headingId : undefined}>
      {showHeading && (
        <div className="section-head-row">
          <h3 id={headingId} className="friendly-compare-h">
            What was said in Congress
          </h3>
          <InfoTip label="What's this?" title="Hearing mentions">
            These are the Budget API’s summaries of House appropriations hearings that mention this place.
            Quoted lines are the spoken moments exactly as the API returns them — no added commentary.
          </InfoTip>
        </div>
      )}

      {error && (
        <p className="state state-error" role="alert">
          Could not load hearings. {error}
        </p>
      )}
      {!error && hits == null && (
        <p className="state" role="status">
          <span className="spinner" aria-hidden="true" /> Loading hearing mentions…
        </p>
      )}
      {!error && hits != null && hits.length === 0 && (
        <p className="section-empty">{emptyMessage}</p>
      )}
      {!error && hits != null && hits.length > 0 && (
        <>
          <div className="hearing-chips" role="group" aria-label="Filter by agency">
            {AGENCY_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`hearing-chip${chip === c.id ? ' is-active' : ''}`}
                aria-pressed={chip === c.id}
                onClick={() => setChip(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className="section-empty">No hearing mentions found for this agency filter.</p>
          ) : (
            <ul className="hearing-list">
              {filtered.map((hit) => (
                <li key={`${hit.hearing.video_id}-${hit.topic.index}`} className="hearing-card">
                  <p className="hearing-agency label">{hit.hearing.agency}</p>
                  <h4 className="hearing-topic">
                    <External href={hit.topic.url}>{hit.topic.topic}</External>
                  </h4>
                  <p className="hearing-summary">{hit.topic.summary}</p>
                  {hit.matching_moments.length > 0 && (
                    <ul className="hearing-moments">
                      {hit.matching_moments.map((m) => (
                        <li key={`${m.seconds}-${m.said.slice(0, 24)}`}>
                          <p className="hearing-moment-meta">
                            <span className="hearing-speaker">{m.speaker}</span>
                            <span className="sep">·</span>
                            <External href={m.url}>{m.timestamp}</External>
                          </p>
                          <blockquote className="hearing-said">“{m.said}”</blockquote>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="fine">API summaries and exact quotes from matching moments. No commentary added.</p>
        </>
      )}
    </section>
  );
}
