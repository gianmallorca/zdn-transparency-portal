import { useEffect, useState } from 'react';
import { plural } from '../../lib/format';
import { usePortal } from '../../lib/portal-context';
import {
  loadEnactedByTown,
  type EnactedTownBucket,
  type TownId,
} from '../../lib/towns';
import InfoTip from './InfoTip';
import YearSparkline from './YearSparkline';

let cache: Promise<Map<TownId, EnactedTownBucket>> | null = null;

function enactedMap(client: ReturnType<typeof usePortal>['client']) {
  if (!cache) {
    cache = loadEnactedByTown(client).catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

type LoadState =
  | { townId: TownId; status: 'loading' }
  | { townId: TownId; status: 'error'; error: string }
  | { townId: TownId; status: 'ready'; bucket: EnactedTownBucket | null };

export default function PastYearsSection({
  townId,
  townLabel,
}: {
  townId: TownId;
  townLabel: string;
}) {
  const { client } = usePortal();
  const [load, setLoad] = useState<LoadState>({ townId, status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    enactedMap(client)
      .then((map) => {
        if (!cancelled) setLoad({ townId, status: 'ready', bucket: map.get(townId) ?? null });
      })
      .catch((e: Error) => {
        if (!cancelled) setLoad({ townId, status: 'error', error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [client, townId]);

  const active = load.townId === townId ? load : { townId, status: 'loading' as const };
  const error = active.status === 'error' ? active.error : null;
  const bucket = active.status === 'ready' ? active.bucket : undefined;

  return (
    <section className="past-years-section" aria-labelledby={`past-h-${townId}`}>
      <div className="section-head-row">
        <h3 id={`past-h-${townId}`} className="friendly-compare-h">
          Enacted budget lines naming this town
        </h3>
        <InfoTip label="What's this?" title="Past enacted lines">
          Enacted GAA lines (2020–2026) whose names mention {townLabel}. These are different records from
          2027 projects — they are never joined or added together. This is not “all spending” in the town.
        </InfoTip>
      </div>
      <p className="fine past-years-note">
        2027 projects and past enacted lines are different records; never join or add them.
      </p>

      {error && (
        <p className="state state-error" role="alert">
          Could not load enacted lines. {error}
        </p>
      )}
      {!error && bucket === undefined && (
        <p className="state" role="status">
          <span className="spinner" aria-hidden="true" /> Loading enacted lines…
        </p>
      )}
      {!error && bucket === null && (
        <p className="section-empty">No enacted budget lines name this town (2020–2026)</p>
      )}
      {!error && bucket && (
        <>
          <YearSparkline
            series={bucket.series}
            label={`Enacted amounts naming ${townLabel}, 2020 to 2026`}
          />
          <p className="fine">
            {plural(bucket.lines.length, 'enacted line')} naming {townLabel} · amounts where the GAA funded that year
          </p>
        </>
      )}
    </section>
  );
}
