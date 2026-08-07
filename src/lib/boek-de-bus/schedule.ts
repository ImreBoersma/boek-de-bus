/**
 * Domain logic for the "plan een rit" flow.
 *
 * Everything here is pure: no clock reads, no I/O, no React. "Now" is always
 * passed in. That is what makes the calendar testable, and it is also a
 * correctness requirement — a module-level `Date.now()` would freeze "today"
 * at process start for the whole life of a long-running server.
 *
 * Days are identified by the epoch-ms of their UTC midnight, so a day's
 * identity is the same on the server and in the browser. Every calendar field
 * is read back with the matching `getUTC*` accessor, and day arithmetic can use
 * plain `+ DAY_MS` because UTC has no DST steps.
 */

/** Epoch-ms of a day's UTC midnight. The app's identity for "a date". */
export type Day = number;

/**
 * A month as `year * 12 + monthIndex` (monthIndex 0-based, as in `Date`).
 * Absolute rather than 0–11 so stepping and clamping cross year boundaries.
 */
export type YearMonth = number;

export const DAY_MS = 86_400_000;

/** Build a `Day` from calendar parts, month 0-indexed as in `Date`. */
export function day(year: number, month: number, date: number): Day {
  return Date.UTC(year, month, date);
}

/** The `Day` containing `now`, in UTC. The only place a clock is read. */
export function dayOf(now: Date): Day {
  return day(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Both weekday tables are indexed by `getUTCDay()`, so both start at Sunday.
 *
 * This is not the same order as `WEEKDAY_HEADINGS` below, which is Monday-first
 * because it is printed as the grid's column headers rather than looked up by
 * date. Conflating the two is exactly the bug this ordering fixes: the short
 * table used to be Monday-first while still being indexed by `getUTCDay()`,
 * which shifted every abbreviation in `rangeWords` by one day.
 */
const WEEKDAYS_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const WEEKDAYS_LONG = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];
const MONTHS_LONG = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];
const MONTHS_SHORT = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

/** Monday-first weekday initials, matching the calendar's column headers. */
export const WEEKDAY_HEADINGS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

const weekday = (d: Day) => new Date(d).getUTCDay();
const dayOfMonth = (d: Day) => new Date(d).getUTCDate();
const monthIndex = (d: Day) => new Date(d).getUTCMonth();
const yearOf = (d: Day) => new Date(d).getUTCFullYear();

/** Pack calendar parts into a `YearMonth`. */
export function yearMonth(year: number, month: number): YearMonth {
  return year * 12 + month;
}

/** The `YearMonth` a day falls in. */
export function yearMonthOf(d: Day): YearMonth {
  return yearMonth(yearOf(d), monthIndex(d));
}

export const yearOfMonth = (ym: YearMonth) => Math.floor(ym / 12);
export const monthOfMonth = (ym: YearMonth) => ym - yearOfMonth(ym) * 12;

/** First day of a `YearMonth`. */
export function firstDayOfMonth(ym: YearMonth): Day {
  return day(yearOfMonth(ym), monthOfMonth(ym), 1);
}

/**
 * How far ahead the calendar opens. A rolling window from the current month, so
 * the app never runs out of bookable months the way a hardcoded range does.
 */
export const BOOKABLE_MONTHS = 12;

/** The window of months a trip may be placed in, given "today". */
export function bookableRange(today: Day): {
  first: YearMonth;
  last: YearMonth;
} {
  const first = yearMonthOf(today);
  return { first, last: first + BOOKABLE_MONTHS - 1 };
}

/** The last day a trip may end on — the final day of the last bookable month. */
export function lastBookableDay(today: Day): Day {
  const { last } = bookableRange(today);
  // Day 0 of the following month is the last day of this one.
  return day(yearOfMonth(last), monthOfMonth(last) + 1, 0);
}

/** "augustus 2026" — the month heading above the grid. */
export function monthWords(ym: YearMonth): string {
  return `${MONTHS_LONG[monthOfMonth(ym)]} ${yearOfMonth(ym)}`;
}

/** "vrijdag 31 juli 2026" — spelled out in full, for assistive tech. */
export function fullDateWords(d: Day): string {
  return `${WEEKDAYS_LONG[weekday(d)]} ${dayOfMonth(d)} ${MONTHS_LONG[monthIndex(d)]} ${yearOf(d)}`;
}

/**
 * How a chosen period is worded: one day spells its month out, a same-month
 * range names the month once at the end, and a range crossing a month boundary
 * abbreviates both. The year is appended only when it is not the current one,
 * which keeps the common case short without ever being ambiguous.
 */
export function rangeWords(
  from: Day | null,
  to: Day | null,
  today: Day,
): string {
  if (from == null) return "";
  const thisYear = yearOf(today);
  const suffix = (d: Day) => (yearOf(d) === thisYear ? "" : ` ${yearOf(d)}`);

  if (to == null || from === to) {
    return `${WEEKDAYS_SHORT[weekday(from)]} ${dayOfMonth(from)} ${MONTHS_LONG[monthIndex(from)]}${suffix(from)}`;
  }
  const a = `${WEEKDAYS_SHORT[weekday(from)]} ${dayOfMonth(from)}`;
  const b = `${WEEKDAYS_SHORT[weekday(to)]} ${dayOfMonth(to)}`;
  if (monthIndex(from) === monthIndex(to) && yearOf(from) === yearOf(to)) {
    return `${a} t/m ${b} ${MONTHS_LONG[monthIndex(to)]}${suffix(to)}`;
  }
  return `${a} ${MONTHS_SHORT[monthIndex(from)]}${suffix(from)} t/m ${b} ${MONTHS_SHORT[monthIndex(to)]}${suffix(to)}`;
}

/** "1 dag" / "5 dagen". */
export function dayCountWords(from: Day | null, to: Day | null): string {
  if (from == null) return "";
  return countWords(dayCount(from, to));
}

/** Inclusive number of days in a period. */
export function dayCount(from: Day, to: Day | null): number {
  return Math.round(((to ?? from) - from) / DAY_MS) + 1;
}

function countWords(n: number): string {
  return n === 1 ? "1 dag" : `${n} dagen`;
}

/** A trip that is settled — these days are locked for everyone else. */
export type Booking = {
  start: Day;
  end: Day;
  /** Initial shown on the first day of the run. */
  chip: string;
  /** Belongs to the person using the app, so it is drawn in the accent ramp. */
  own: boolean;
};

/** A trip that is still waiting on a decision. These may overlap freely. */
export type PendingRequest = { start: Day; end: Day; own: boolean };

export type Schedule = {
  bookings: readonly Booking[];
  pending: readonly PendingRequest[];
};

export const EMPTY_SCHEDULE: Schedule = { bookings: [], pending: [] };

const covers = (r: { start: Day; end: Day }, d: Day) =>
  d >= r.start && d <= r.end;

/** Days in the past and days already booked cannot be chosen. */
export function isBlocked(
  d: Day,
  bookings: readonly Booking[],
  today: Day,
): boolean {
  return d < today || bookings.some((r) => covers(r, d));
}

/**
 * Whether a whole period is placeable. The reducer uses this to refuse a second
 * tap, and the server action re-runs it before writing — a client can post
 * anything, so the check that matters is the one next to the data.
 */
export function isRangeFree(
  start: Day,
  end: Day,
  bookings: readonly Booking[],
  today: Day,
): boolean {
  if (end < start) return false;
  for (let d = start; d <= end; d += DAY_MS) {
    if (isBlocked(d, bookings, today)) return false;
  }
  return true;
}

/** Whether a period sits inside the bookable window. */
export function isWithinWindow(start: Day, end: Day, today: Day): boolean {
  return start >= today && end <= lastBookableDay(today);
}

/** One square of the month grid, reduced to the states the styles care about. */
export type CalendarCell = {
  date: Day;
  /** The number printed in the square. */
  number: number;
  /** False for the leading/trailing days borrowed from the adjacent months. */
  inMonth: boolean;
  past: boolean;
  isToday: boolean;
  /** How many pending requests cover this day; 2+ all draw two dots. */
  pendingCount: number;
  booking: {
    own: boolean;
    isStart: boolean;
    isEnd: boolean;
    /** Whose trip it is, on every day of the run — for the day's label. */
    initial: string;
    /** The same initial, but only on the day that draws the badge. */
    chip: string;
  } | null;
  selection: { isStart: boolean; isEnd: boolean } | null;
  selectable: boolean;
};

export type Selection = { start: Day | null; end: Day | null };

/**
 * Lay out one month, Monday-first, padded with adjacent-month days to whole
 * weeks. The padding days are styled like any other: the 31st of July still
 * reads as "today" in August's grid, and a trip booked in late August still
 * shows up in September's leading square.
 */
export function buildMonth(
  ym: YearMonth,
  schedule: Schedule,
  selection: Selection,
  today: Day,
): CalendarCell[] {
  const year = yearOfMonth(ym);
  const month = monthOfMonth(ym);
  const firstOfMonth = day(year, month, 1);
  // Date's week starts on Sunday; this grid starts on Monday.
  const leading = (weekday(firstOfMonth) + 6) % 7;
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cellCount = Math.ceil((leading + length) / 7) * 7;
  const lastDay = lastBookableDay(today);

  const { start, end } = selection;
  const cells: CalendarCell[] = [];

  for (let i = 0; i < cellCount; i++) {
    const date = day(year, month, 1 - leading + i);
    const inMonth = yearMonthOf(date) === ym;
    const booked = schedule.bookings.find((r) => covers(r, date)) ?? null;

    const isAnchor = start != null && end == null && date === start;
    const inRange =
      start != null && end != null && date >= start && date <= end;

    cells.push({
      date,
      number: dayOfMonth(date),
      inMonth,
      past: date < today,
      isToday: date === today,
      pendingCount: schedule.pending.filter((r) => covers(r, date)).length,
      booking: booked && {
        own: booked.own,
        isStart: date === booked.start,
        isEnd: date === booked.end,
        initial: booked.chip,
        chip: date === booked.start ? booked.chip : "",
      },
      selection:
        isAnchor || inRange
          ? {
              isStart: isAnchor || date === start,
              isEnd: isAnchor || date === end,
            }
          : null,
      selectable: inMonth && date >= today && date <= lastDay && !booked,
    });
  }

  return cells;
}

export type Step = "cal" | "form" | "done";

/**
 * Client-side state for the flow. Deliberately holds no trip records: the
 * schedule is server data, passed in as `FlowContext`, so a submit is reflected
 * by the server re-rendering rather than by the client patching its own copy.
 */
export type FlowState = {
  step: Step;
  month: YearMonth;
  selStart: Day | null;
  selEnd: Day | null;
  destination: string;
  note: string;
  error: string;
  /** The period as worded when it was submitted, held for the done screen. */
  doneWords: string;
  /** Whether the submitted trip was settled outright (owner) or is pending. */
  doneApproved: boolean;
};

/** Server-provided facts the reducer needs to validate a tap. */
export type FlowContext = {
  schedule: Schedule;
  today: Day;
};

export function initialFlowState(today: Day): FlowState {
  return {
    step: "cal",
    month: yearMonthOf(today),
    selStart: null,
    selEnd: null,
    destination: "",
    note: "",
    error: "",
    doneWords: "",
    doneApproved: false,
  };
}

export const RANGE_BLOCKED_ERROR =
  "Die periode bevat al geboekte dagen. Kies een andere.";
export const RANGE_TOO_FAR_ERROR =
  "Die periode valt buiten de kalender. Kies een eerdere datum.";

export type FlowAction =
  | { type: "pickDay"; date: Day }
  | { type: "stepMonth"; by: number }
  | { type: "toForm" }
  | { type: "toCalendar" }
  | { type: "setDestination"; value: string }
  | { type: "setNote"; value: string }
  | { type: "submitted"; words: string; approved: boolean }
  | { type: "failed"; error: string }
  | { type: "startOver" };

/**
 * Tapping a day: the first tap sets the anchor, the second closes the period,
 * and a third starts over. Tapping backwards moves the anchor instead of
 * making an inverted period, and closing over an already-booked day is
 * refused — the tapped day becomes the new anchor so the next tap can retry.
 */
function pickDay(state: FlowState, date: Day, ctx: FlowContext): FlowState {
  const { bookings } = ctx.schedule;
  if (isBlocked(date, bookings, ctx.today)) return state;
  if (date > lastBookableDay(ctx.today)) {
    return { ...state, error: RANGE_TOO_FAR_ERROR };
  }

  if (state.selStart == null || state.selEnd != null) {
    return { ...state, selStart: date, selEnd: null, error: "" };
  }
  if (date < state.selStart) {
    return { ...state, selStart: date, error: "" };
  }
  if (!isRangeFree(state.selStart, date, bookings, ctx.today)) {
    return {
      ...state,
      selStart: date,
      selEnd: null,
      error: RANGE_BLOCKED_ERROR,
    };
  }
  return { ...state, selEnd: date, error: "" };
}

export function flowReducer(
  state: FlowState,
  action: FlowAction,
  ctx: FlowContext,
): FlowState {
  switch (action.type) {
    case "pickDay":
      return pickDay(state, action.date, ctx);

    case "stepMonth": {
      const { first, last } = bookableRange(ctx.today);
      const month = Math.min(last, Math.max(first, state.month + action.by));
      return month === state.month ? state : { ...state, month };
    }

    case "toForm":
      return state.selStart == null
        ? state
        : { ...state, step: "form", error: "" };

    // Going back keeps the period, the destination and the note, so "wijzig"
    // returns to the form with everything still filled in.
    case "toCalendar":
      return { ...state, step: "cal", error: "" };

    case "setDestination":
      return { ...state, destination: action.value };

    case "setNote":
      return { ...state, note: action.value };

    case "submitted":
      return {
        ...state,
        step: "done",
        error: "",
        doneWords: action.words,
        doneApproved: action.approved,
      };

    // The server refused the write — surface it on the form, keep the input.
    case "failed":
      return { ...state, error: action.error };

    // Back to an empty calendar. The trip that was just submitted arrives via
    // fresh server data, and the month you were looking at stays put.
    case "startOver":
      return {
        ...state,
        step: "cal",
        selStart: null,
        selEnd: null,
        destination: "",
        note: "",
        error: "",
      };
  }
}

/** The line under the heading that coaches the next tap. */
export function statusText({ selStart, selEnd }: FlowState): string {
  if (selStart == null) return "Tik op je eerste dag.";
  if (selEnd == null) {
    return "Tik op je laatste dag — of ga meteen verder voor één dag.";
  }
  return "Klopt de periode? Ga verder.";
}
