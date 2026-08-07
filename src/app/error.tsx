"use client";

import { useEffect } from "react";

/**
 * The last line of defence for an unhandled render or action error.
 *
 * Deliberately says nothing about what went wrong. `error.message` is only the
 * real message in development — in a production build React replaces it with a
 * digest — and even where it is real it is not something to put in front of a
 * family looking at a calendar. The digest is logged instead, which is what
 * matches a report to a server log.
 */
// Not named `Error`: that would shadow the global, and the annotation on the
// prop below refers to exactly that global.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Onverwachte fout", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="page page-centered">
      <div className="card auth-card">
        <h1 className="auth-title">Er ging iets mis</h1>
        <p className="auth-lede">
          De bus is er nog, maar wij konden hem even niet vinden. Probeer het
          opnieuw.
        </p>
        {error.digest && <p className="error-digest">Code: {error.digest}</p>}
        <button
          type="button"
          className="btn btn-primary btn-block flow-cta"
          onClick={reset}
        >
          Opnieuw proberen
        </button>
      </div>
    </div>
  );
}
