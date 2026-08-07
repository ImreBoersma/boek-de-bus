"use client";

import { useActionState } from "react";
import { requestSignInLink } from "@/lib/actions/auth";
import { SIGN_IN_IDLE } from "@/lib/auth/shared";
import { Check, TriangleAlert } from "./icons";

/**
 * The sign-in form.
 *
 * A real `<form action>` rather than a click handler, so it submits without
 * JavaScript too — this is the one screen that must work even if the bundle
 * fails, because it is the only way in.
 *
 * On success the form is replaced by the confirmation rather than left filled
 * in: the next step happens in a mail client, so there is nothing useful left to
 * do here, and an untouched form invites a second pointless submit.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(
    requestSignInLink,
    SIGN_IN_IDLE,
  );

  if (state.status === "sent") {
    return (
      // `<output>` rather than a div with role="status": it carries that role
      // implicitly, so the confirmation is announced without the ARIA.
      <output className="auth-sent">
        <span className="done-icon" data-settled="true">
          <Check size={30} />
        </span>
        <p className="auth-sent-text">{state.message}</p>
      </output>
    );
  }

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next} />

      <div className="field">
        <label className="form-label" htmlFor="signin-email">
          E-mailadres
        </label>
        <input
          id="signin-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className="input form-input"
          placeholder="jij@example.com"
          disabled={pending}
          aria-describedby={
            state.status === "error" ? "signin-error" : undefined
          }
        />
      </div>

      {/* Mounted while empty so the message is announced when it arrives. */}
      <div role="alert">
        {state.status === "error" && (
          <div className="cal-error" id="signin-error">
            <TriangleAlert />
            <span>{state.message}</span>
          </div>
        )}
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-block flow-cta"
        disabled={pending}
      >
        {pending ? "Bezig…" : "Stuur me een link"}
      </button>
    </form>
  );
}
