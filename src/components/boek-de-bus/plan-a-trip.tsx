"use client";

import {
  type Dispatch,
  type RefObject,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useTransition,
} from "react";
import { submitTrip } from "@/lib/actions/trips";
import {
  bookableRange,
  buildMonth,
  type Day,
  dayCountWords,
  type FlowAction,
  type FlowContext,
  type FlowState,
  flowReducer,
  initialFlowState,
  monthWords,
  rangeWords,
  type Schedule,
  type Step,
  statusText,
} from "@/lib/boek-de-bus/schedule";
import { MAX_DESTINATION, MAX_NOTE } from "@/lib/boek-de-bus/trips";
import {
  BusMark,
  CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
} from "./icons";
import { MonthGrid } from "./month-grid";

/**
 * "Plan een rit" — pick a period, describe the trip, and either book it
 * outright or put in a request.
 *
 * This is the whole flow's client boundary. It owns interaction state only: the
 * step, the month being viewed, and the period being picked. The schedule and
 * "today" arrive as props from the server on every render, so a submitted trip
 * shows up because the server re-rendered, not because this component patched a
 * local copy of the calendar.
 *
 * The tap validation here is for feedback, not enforcement — `submitTrip`
 * re-checks everything against stored data before it writes.
 */
export function PlanATrip({
  schedule,
  today,
  isOwner,
}: {
  schedule: Schedule;
  today: Day;
  isOwner: boolean;
}) {
  const ctx: FlowContext = { schedule, today };
  const [state, dispatch] = useReducer(
    (current: FlowState, action: FlowAction) =>
      flowReducer(current, action, ctx),
    today,
    initialFlowState,
  );
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<Step | null>(null);

  // A step swaps out the whole frame, so the control that was just pressed
  // stops existing and focus would drop to the document. Move it to the new
  // step's heading instead — on a real change only, not on the first paint.
  useEffect(() => {
    const previous = shown.current;
    shown.current = state.step;
    if (previous !== null && previous !== state.step) {
      heading.current?.focus();
    }
  }, [state.step]);

  const submit = useCallback(() => {
    if (state.selStart == null) return;
    const start = state.selStart;
    const end = state.selEnd ?? start;
    startTransition(async () => {
      const result = await submitTrip({
        start,
        end,
        destination: state.destination,
        note: state.note,
      });
      if (result.ok) {
        dispatch({
          type: "submitted",
          words: result.words,
          approved: result.approved,
        });
      } else {
        dispatch({ type: "failed", error: result.error });
      }
    });
  }, [state.selStart, state.selEnd, state.destination, state.note]);

  const step = { state, dispatch, heading, today, isOwner };

  return (
    <div className="phone" aria-busy={pending || undefined}>
      {state.step === "cal" && <CalendarStep {...step} ctx={ctx} />}
      {state.step === "form" && (
        <RequestForm {...step} onSubmit={submit} pending={pending} />
      )}
      {state.step === "done" && <Confirmation {...step} />}
    </div>
  );
}

type StepProps = {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  heading: RefObject<HTMLHeadingElement | null>;
  today: Day;
  isOwner: boolean;
};

function CalendarStep({
  state,
  dispatch,
  heading,
  today,
  ctx,
}: StepProps & { ctx: FlowContext }) {
  const cells = buildMonth(
    state.month,
    ctx.schedule,
    { start: state.selStart, end: state.selEnd },
    today,
  );
  const { first, last } = bookableRange(today);

  return (
    <>
      <header className="cal-brand">
        <BusMark />
        <span className="cal-brand-name">Boek de Bus</span>
      </header>

      <div className="cal-intro">
        <h1 className="cal-title" ref={heading} tabIndex={-1}>
          Wanneer wil je eropuit?
        </h1>
        <p className="cal-status" id="cal-status" aria-live="polite">
          {statusText(state)}
        </p>
      </div>

      <div className="cal-nav">
        <h2 className="cal-month">{monthWords(state.month)}</h2>
        <button
          type="button"
          className="btn btn-icon btn-secondary cal-nav-btn"
          onClick={() => dispatch({ type: "stepMonth", by: -1 })}
          disabled={state.month <= first}
          aria-label="vorige maand"
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="btn btn-icon btn-secondary cal-nav-btn"
          onClick={() => dispatch({ type: "stepMonth", by: 1 })}
          disabled={state.month >= last}
          aria-label="volgende maand"
        >
          <ChevronRight />
        </button>
      </div>

      <MonthGrid
        cells={cells}
        onPick={(date) => dispatch({ type: "pickDay", date })}
      />

      <ul className="cal-legend">
        <li>
          <span className="cal-legend-bar" data-kind="booked" />
          gereserveerd
        </li>
        <li>
          <span className="cal-legend-ring" />
          aangevraagd
        </li>
        <li>
          <span className="cal-legend-bar" data-kind="picked" />
          jouw keuze
        </li>
      </ul>

      {/* Stays mounted while empty so the alert is announced when it fills. */}
      <div role="alert">
        {state.error && (
          <div className="cal-error">
            <TriangleAlert />
            <span>{state.error}</span>
          </div>
        )}
      </div>

      <div className="cal-footer">
        <div className="cal-picked">
          {rangeWords(state.selStart, state.selEnd, today)}
        </div>
        {/* Points at the coaching line, so the reason it is disabled is
            reachable rather than implied. */}
        <button
          type="button"
          className="btn btn-primary btn-block flow-cta"
          onClick={() => dispatch({ type: "toForm" })}
          disabled={state.selStart == null}
          aria-describedby="cal-status"
        >
          Verder
        </button>
      </div>
    </>
  );
}

function RequestForm({
  state,
  dispatch,
  heading,
  today,
  isOwner,
  onSubmit,
  pending,
}: StepProps & { onSubmit: () => void; pending: boolean }) {
  const end = state.selEnd ?? state.selStart;
  const back = () => dispatch({ type: "toCalendar" });

  return (
    <>
      <header className="form-head">
        <button
          type="button"
          className="btn btn-icon btn-secondary form-back"
          onClick={back}
          aria-label="terug"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="form-head-title" ref={heading} tabIndex={-1}>
          {isOwner ? "Nieuwe rit" : "Nieuwe aanvraag"}
        </h1>
      </header>

      <form
        className="form-body"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="form-summary">
          <CalendarIcon />
          <div className="form-summary-text">
            <div className="form-summary-range">
              {rangeWords(state.selStart, end, today)}
            </div>
            <div className="form-summary-days">
              {dayCountWords(state.selStart, end)}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost form-summary-edit"
            onClick={back}
            disabled={pending}
          >
            wijzig
          </button>
        </div>

        <div className="field">
          <label className="form-label" htmlFor="boek-de-bus-destination">
            Bestemming <span className="form-label-optional">(mag leeg)</span>
          </label>
          <input
            id="boek-de-bus-destination"
            className="input form-input"
            placeholder="Bijv. Texel"
            maxLength={MAX_DESTINATION}
            value={state.destination}
            disabled={pending}
            onChange={(event) =>
              dispatch({ type: "setDestination", value: event.target.value })
            }
          />
        </div>

        <div className="field">
          <label className="form-label" htmlFor="boek-de-bus-note">
            Notitie <span className="form-label-optional">(mag leeg)</span>
          </label>
          <textarea
            id="boek-de-bus-note"
            className="input form-textarea"
            placeholder="Iets wat handig is om te weten"
            maxLength={MAX_NOTE}
            value={state.note}
            disabled={pending}
            onChange={(event) =>
              dispatch({ type: "setNote", value: event.target.value })
            }
          />
        </div>

        {/* Mounted while empty so a refusal from the server is announced. */}
        <div role="alert">
          {state.error && (
            <div className="cal-error form-error">
              <TriangleAlert />
              <span>{state.error}</span>
            </div>
          )}
        </div>

        <div className="form-actions">
          <p className="form-hint">
            {isOwner
              ? "Jouw ritten staan meteen vast — jij bent de eigenaar."
              : "Jan & Els krijgen je aanvraag in de mail."}
          </p>
          <button
            type="submit"
            className="btn btn-primary btn-block flow-cta"
            disabled={pending}
          >
            {pending ? "Bezig…" : isOwner ? "Zet in de kalender" : "Vraag aan"}
          </button>
        </div>
      </form>
    </>
  );
}

function Confirmation({ state, dispatch, heading }: StepProps) {
  const settled = state.doneApproved;

  return (
    <div className="done">
      <span className="done-icon" data-settled={String(settled)}>
        <Check />
      </span>
      <h1 className="done-title" ref={heading} tabIndex={-1}>
        {settled ? "Goedgekeurd" : "Aangevraagd"}
      </h1>
      <div className="done-range">{state.doneWords}</div>
      {state.destination && (
        <div className="done-dest">naar {state.destination}</div>
      )}
      <p className="done-body">
        {settled
          ? "Je rit staat in de kalender. De dagen zijn geblokkeerd voor de rest."
          : "Je hoort het zodra Jan of Els beslist. Tot die tijd staat je aanvraag met streepjes op de kalender."}
      </p>
      <button
        type="button"
        className="btn btn-primary done-cta"
        onClick={() => dispatch({ type: "startOver" })}
      >
        Naar de kalender
      </button>
    </div>
  );
}
