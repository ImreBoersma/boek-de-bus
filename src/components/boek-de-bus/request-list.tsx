"use client";

import { useState, useTransition } from "react";
import { approveTrip, rejectTrip } from "@/lib/actions/trips";
import { Check, TriangleAlert, Xmark } from "./icons";

/**
 * One row's worth of a pending request, already worded by the server so this
 * component carries no date logic and no `Day` values.
 */
export type PendingView = {
  id: string;
  requester: string;
  initial: string;
  period: string;
  days: string;
  destination: string;
  note: string;
  /** The requested days have already passed. */
  past: boolean;
  /** An approved trip now covers some of these days, so approving will fail. */
  conflicts: boolean;
};

/**
 * The approve/reject queue.
 *
 * Pending state is tracked per row, so deciding on one request does not freeze
 * the others. A decided row disappears when the server sends the refreshed list;
 * until then its buttons stay disabled, which keeps a double-tap from firing a
 * second decision at a request that is already settled.
 */
export function RequestList({
  requests,
}: {
  requests: readonly PendingView[];
}) {
  return (
    <ul className="queue">
      {requests.map((request) => (
        <RequestRow key={request.id} request={request} />
      ))}
    </ul>
  );
}

function RequestRow({ request }: { request: PendingView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [settled, setSettled] = useState(false);

  const decide = (approve: boolean) => {
    setError("");
    startTransition(async () => {
      const result = approve
        ? await approveTrip(request.id)
        : await rejectTrip(request.id);
      if (result.ok) {
        // Hold the row disabled until the refreshed list removes it, rather than
        // letting it look actionable again for a frame.
        setSettled(true);
      } else {
        setError(result.error);
      }
    });
  };

  const busy = pending || settled;
  const blocked = request.conflicts || request.past;

  return (
    <li className="queue-row" data-busy={busy || undefined}>
      <div className="queue-head">
        <span className="queue-chip" aria-hidden="true">
          {request.initial}
        </span>
        <div className="queue-head-text">
          <p className="queue-who">{request.requester}</p>
          <p className="queue-period">
            {request.period}{" "}
            <span className="queue-days">· {request.days}</span>
          </p>
        </div>
      </div>

      {(request.destination || request.note) && (
        <dl className="queue-detail">
          {request.destination && (
            <>
              <dt>Bestemming</dt>
              <dd>{request.destination}</dd>
            </>
          )}
          {request.note && (
            <>
              <dt>Notitie</dt>
              <dd>{request.note}</dd>
            </>
          )}
        </dl>
      )}

      {blocked && (
        <p className="queue-warn">
          <TriangleAlert />
          <span>
            {request.past
              ? "Deze dagen zijn al voorbij. Je kunt de aanvraag nog afwijzen."
              : "Deze dagen zijn inmiddels geboekt. Goedkeuren kan niet meer."}
          </span>
        </p>
      )}

      {/* Mounted while empty so a refusal is announced when it arrives. */}
      <div role="alert">
        {error && (
          <p className="queue-warn queue-warn-error">
            <TriangleAlert />
            <span>{error}</span>
          </p>
        )}
      </div>

      <div className="queue-actions">
        <button
          type="button"
          className="btn btn-secondary queue-btn"
          onClick={() => decide(false)}
          disabled={busy}
        >
          <Xmark size={17} />
          Afwijzen
        </button>
        <button
          type="button"
          className="btn btn-primary queue-btn"
          onClick={() => decide(true)}
          disabled={busy || blocked}
        >
          <Check size={17} />
          Goedkeuren
        </button>
      </div>
    </li>
  );
}
