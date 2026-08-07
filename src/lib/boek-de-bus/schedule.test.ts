import { describe, expect, test } from "bun:test";
import {
  type Booking,
  bookableRange,
  buildMonth,
  DAY_MS,
  day,
  dayCount,
  dayCountWords,
  dayOf,
  EMPTY_SCHEDULE,
  flowReducer,
  fullDateWords,
  initialFlowState,
  isBlocked,
  isRangeFree,
  isWithinWindow,
  lastBookableDay,
  monthWords,
  RANGE_BLOCKED_ERROR,
  RANGE_TOO_FAR_ERROR,
  rangeWords,
  type Schedule,
  statusText,
  WEEKDAY_HEADINGS,
  yearMonth,
  yearMonthOf,
} from "./schedule";

// A fixed reference point, so nothing here depends on when the suite runs.
const TODAY = day(2026, 7, 6); // Thursday 6 August 2026
const ctx = (schedule: Schedule = EMPTY_SCHEDULE, today = TODAY) => ({
  schedule,
  today,
});

const booking = (
  start: number,
  end: number,
  chip = "J",
  own = false,
): Booking => ({
  start,
  end,
  chip,
  own,
});

describe("day identity", () => {
  test("a Day is the UTC midnight of its date", () => {
    expect(new Date(day(2026, 7, 6)).toISOString()).toBe(
      "2026-08-06T00:00:00.000Z",
    );
  });

  test("every Day is an exact multiple of a day, which is what lets the server validate one", () => {
    expect(day(2026, 7, 6) % DAY_MS).toBe(0);
    expect(day(1999, 11, 31) % DAY_MS).toBe(0);
  });

  test("dayOf truncates a clock reading to its UTC day", () => {
    expect(dayOf(new Date("2026-08-06T23:59:59.999Z"))).toBe(TODAY);
    expect(dayOf(new Date("2026-08-06T00:00:00.000Z"))).toBe(TODAY);
  });

  test("day arithmetic crosses a DST boundary without drifting", () => {
    // The Netherlands leaves DST on 25 October 2026. In UTC that is not an event.
    const before = day(2026, 9, 24);
    const after = day(2026, 9, 26);
    expect(dayCount(before, after)).toBe(3);
    expect(before + 2 * DAY_MS).toBe(after);
  });
});

describe("year-month cursor", () => {
  test("packs and unpacks", () => {
    expect(yearMonthOf(TODAY)).toBe(yearMonth(2026, 7));
  });

  test("stepping past December rolls into the next year", () => {
    const december = yearMonth(2026, 11);
    expect(monthWords(december)).toBe("december 2026");
    expect(monthWords(december + 1)).toBe("januari 2027");
  });

  test("the bookable window is a rolling 12 months from today", () => {
    const { first, last } = bookableRange(TODAY);
    expect(monthWords(first)).toBe("augustus 2026");
    expect(monthWords(last)).toBe("juli 2027");
  });

  test("the window's last day is the final day of the last month", () => {
    expect(new Date(lastBookableDay(TODAY)).toISOString()).toBe(
      "2027-07-31T00:00:00.000Z",
    );
  });

  test("a leap-year February gets its 29th", () => {
    const feb2028 = yearMonth(2028, 1);
    const cells = buildMonth(
      feb2028,
      EMPTY_SCHEDULE,
      { start: null, end: null },
      TODAY,
    );
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(29);
  });
});

describe("wording", () => {
  test("a single day spells its month out", () => {
    expect(rangeWords(TODAY, null, TODAY)).toBe("do 6 augustus");
    expect(rangeWords(TODAY, TODAY, TODAY)).toBe("do 6 augustus");
  });

  test("a same-month range names the month once, at the end", () => {
    expect(rangeWords(day(2026, 7, 6), day(2026, 7, 9), TODAY)).toBe(
      "do 6 t/m zo 9 augustus",
    );
  });

  test("a range crossing a month abbreviates both", () => {
    // 30 August 2026 is a Sunday, 2 September a Wednesday.
    expect(rangeWords(day(2026, 7, 30), day(2026, 8, 2), TODAY)).toBe(
      "zo 30 aug t/m wo 2 sep",
    );
  });

  test("the short and long weekday names agree, for every day of a week", () => {
    // Guards the ordering bug these two tables invite: both are indexed by
    // `getUTCDay()`, so a Monday-first table in either slot shifts by a day.
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < 7; i++) {
      const d = day(2026, 7, 2 + i); // 2 August 2026 is a Sunday.
      const short = rangeWords(d, null, TODAY).split(" ")[0];
      const long = fullDateWords(d).split(" ")[0];
      pairs.push([short, long]);
    }
    expect(pairs).toEqual([
      ["zo", "zondag"],
      ["ma", "maandag"],
      ["di", "dinsdag"],
      ["wo", "woensdag"],
      ["do", "donderdag"],
      ["vr", "vrijdag"],
      ["za", "zaterdag"],
    ]);
  });

  test("the year appears only when it is not the current one", () => {
    // Same year as TODAY: no year.
    expect(rangeWords(day(2026, 11, 20), day(2026, 11, 27), TODAY)).toBe(
      "zo 20 t/m zo 27 december",
    );
    // Next year: the year has to be there or the date is ambiguous.
    expect(rangeWords(day(2027, 0, 4), day(2027, 0, 8), TODAY)).toBe(
      "ma 4 t/m vr 8 januari 2027",
    );
    // Straddling New Year: both sides carry theirs.
    expect(rangeWords(day(2026, 11, 28), day(2027, 0, 3), TODAY)).toBe(
      "ma 28 dec t/m zo 3 jan 2027",
    );
  });

  test("nothing chosen words to nothing", () => {
    expect(rangeWords(null, null, TODAY)).toBe("");
    expect(dayCountWords(null, null)).toBe("");
  });

  test("day counts are inclusive and singular at one", () => {
    expect(dayCountWords(TODAY, TODAY)).toBe("1 dag");
    expect(dayCountWords(TODAY, null)).toBe("1 dag");
    expect(dayCountWords(TODAY, TODAY + 4 * DAY_MS)).toBe("5 dagen");
  });

  test("the full date is spelled out for assistive tech, year included", () => {
    expect(fullDateWords(TODAY)).toBe("donderdag 6 augustus 2026");
  });
});

describe("availability", () => {
  const schedule: Schedule = {
    bookings: [booking(day(2026, 7, 10), day(2026, 7, 12))],
    pending: [],
  };

  test("the past is blocked, today is not", () => {
    expect(isBlocked(TODAY - DAY_MS, [], TODAY)).toBe(true);
    expect(isBlocked(TODAY, [], TODAY)).toBe(false);
  });

  test("a booked day is blocked, on every day of the run", () => {
    for (const d of [day(2026, 7, 10), day(2026, 7, 11), day(2026, 7, 12)]) {
      expect(isBlocked(d, schedule.bookings, TODAY)).toBe(true);
    }
    expect(isBlocked(day(2026, 7, 13), schedule.bookings, TODAY)).toBe(false);
  });

  test("a range spanning a booked day is not free", () => {
    expect(
      isRangeFree(day(2026, 7, 8), day(2026, 7, 14), schedule.bookings, TODAY),
    ).toBe(false);
    expect(
      isRangeFree(day(2026, 7, 7), day(2026, 7, 9), schedule.bookings, TODAY),
    ).toBe(true);
  });

  test("an inverted range is never free", () => {
    expect(isRangeFree(day(2026, 7, 9), day(2026, 7, 7), [], TODAY)).toBe(
      false,
    );
  });

  test("a single free day is a free range", () => {
    expect(isRangeFree(TODAY, TODAY, [], TODAY)).toBe(true);
  });

  test("the window rejects the past and anything past the horizon", () => {
    expect(isWithinWindow(TODAY, TODAY, TODAY)).toBe(true);
    expect(isWithinWindow(TODAY - DAY_MS, TODAY, TODAY)).toBe(false);
    expect(isWithinWindow(TODAY, lastBookableDay(TODAY), TODAY)).toBe(true);
    expect(isWithinWindow(TODAY, lastBookableDay(TODAY) + DAY_MS, TODAY)).toBe(
      false,
    );
  });
});

describe("buildMonth", () => {
  const cellsFor = (
    schedule = EMPTY_SCHEDULE,
    selection = { start: null, end: null },
  ) => buildMonth(yearMonth(2026, 7), schedule, selection, TODAY);

  test("pads to whole weeks, Monday first", () => {
    const cells = cellsFor();
    expect(cells.length % 7).toBe(0);
    // 1 August 2026 is a Saturday, so the grid opens with five July days.
    expect(cells.slice(0, 5).every((c) => !c.inMonth)).toBe(true);
    expect(cells[5]?.number).toBe(1);
    expect(cells[5]?.inMonth).toBe(true);
  });

  test("every cell sits under the column header for its real weekday", () => {
    // The grid prints `WEEKDAY_HEADINGS` as its columns while `buildMonth`
    // places cells from `getUTCDay()`. Those are two different orderings —
    // Monday-first against Sunday-first — and if they ever disagree, every date
    // in the calendar renders under the wrong day name. Checked across a year so
    // no single month's alignment can carry it.
    for (let step = 0; step < 12; step++) {
      const cells = buildMonth(
        yearMonth(2026, 7) + step,
        EMPTY_SCHEDULE,
        { start: null, end: null },
        TODAY,
      );
      cells.forEach((cell, index) => {
        const actual = new Date(cell.date).getUTCDay(); // 0 = Sunday
        expect(WEEKDAY_HEADINGS[(actual + 6) % 7]).toBe(
          WEEKDAY_HEADINGS[index % 7],
        );
      });
    }
  });

  test("the first column is always a Monday and the last a Sunday", () => {
    const cells = cellsFor();
    expect(new Date(cells[0]?.date ?? 0).getUTCDay()).toBe(1);
    expect(new Date(cells[6]?.date ?? 0).getUTCDay()).toBe(0);
    expect(WEEKDAY_HEADINGS[0]).toBe("ma");
    expect(WEEKDAY_HEADINGS[6]).toBe("zo");
  });

  test("padding days still carry their real state", () => {
    const cells = cellsFor();
    // 31 July 2026 is in August's leading pad and is in the past.
    const leading = cells[4];
    expect(leading?.number).toBe(31);
    expect(leading?.inMonth).toBe(false);
    expect(leading?.past).toBe(true);
    // Never selectable, because it is not in the month being shown.
    expect(leading?.selectable).toBe(false);
  });

  test("marks today, and nothing else", () => {
    const today = cellsFor().filter((c) => c.isToday);
    expect(today).toHaveLength(1);
    expect(today[0]?.number).toBe(6);
  });

  test("a booking draws its chip only on the first day of the run", () => {
    const schedule: Schedule = {
      bookings: [booking(day(2026, 7, 10), day(2026, 7, 12), "E")],
      pending: [],
    };
    const run = cellsFor(schedule).filter((c) => c.booking && c.inMonth);
    expect(run).toHaveLength(3);
    expect(run.map((c) => c.booking?.chip)).toEqual(["E", "", ""]);
    // The initial is on every day, so each day can name its owner out loud.
    expect(run.every((c) => c.booking?.initial === "E")).toBe(true);
    expect(run[0]?.booking?.isStart).toBe(true);
    expect(run[2]?.booking?.isEnd).toBe(true);
  });

  test("counts overlapping pending requests per day", () => {
    const schedule: Schedule = {
      bookings: [],
      pending: [
        { start: day(2026, 7, 10), end: day(2026, 7, 12), own: false },
        { start: day(2026, 7, 11), end: day(2026, 7, 15), own: true },
      ],
    };
    const byDay = new Map(
      cellsFor(schedule)
        .filter((c) => c.inMonth)
        .map((c) => [c.number, c.pendingCount]),
    );
    expect(byDay.get(10)).toBe(1);
    expect(byDay.get(11)).toBe(2);
    expect(byDay.get(15)).toBe(1);
    expect(byDay.get(16)).toBe(0);
  });

  test("days past the bookable horizon are not selectable", () => {
    const beyond = yearMonthOf(lastBookableDay(TODAY)) + 1;
    const cells = buildMonth(
      beyond,
      EMPTY_SCHEDULE,
      { start: null, end: null },
      TODAY,
    );
    expect(cells.some((c) => c.selectable)).toBe(false);
  });
});

describe("flowReducer", () => {
  const start = initialFlowState(TODAY);

  test("opens on the current month with nothing chosen", () => {
    expect(start.step).toBe("cal");
    expect(start.month).toBe(yearMonth(2026, 7));
    expect(start.selStart).toBeNull();
    expect(statusText(start)).toBe("Tik op je eerste dag.");
  });

  test("first tap anchors, second closes the period", () => {
    const a = flowReducer(
      start,
      { type: "pickDay", date: day(2026, 7, 10) },
      ctx(),
    );
    expect(a.selStart).toBe(day(2026, 7, 10));
    expect(a.selEnd).toBeNull();

    const b = flowReducer(
      a,
      { type: "pickDay", date: day(2026, 7, 12) },
      ctx(),
    );
    expect(b.selStart).toBe(day(2026, 7, 10));
    expect(b.selEnd).toBe(day(2026, 7, 12));
    expect(statusText(b)).toBe("Klopt de periode? Ga verder.");
  });

  test("a third tap starts a new period", () => {
    let s = flowReducer(
      start,
      { type: "pickDay", date: day(2026, 7, 10) },
      ctx(),
    );
    s = flowReducer(s, { type: "pickDay", date: day(2026, 7, 12) }, ctx());
    s = flowReducer(s, { type: "pickDay", date: day(2026, 7, 20) }, ctx());
    expect(s.selStart).toBe(day(2026, 7, 20));
    expect(s.selEnd).toBeNull();
  });

  test("tapping backwards moves the anchor instead of inverting the period", () => {
    let s = flowReducer(
      start,
      { type: "pickDay", date: day(2026, 7, 12) },
      ctx(),
    );
    s = flowReducer(s, { type: "pickDay", date: day(2026, 7, 9) }, ctx());
    expect(s.selStart).toBe(day(2026, 7, 9));
    expect(s.selEnd).toBeNull();
  });

  test("a blocked day is not selectable at all", () => {
    const schedule: Schedule = {
      bookings: [booking(day(2026, 7, 10), day(2026, 7, 10))],
      pending: [],
    };
    const s = flowReducer(
      start,
      { type: "pickDay", date: day(2026, 7, 10) },
      ctx(schedule),
    );
    expect(s).toBe(start);
  });

  test("closing a period over a booked day is refused, and the tap re-anchors", () => {
    const schedule: Schedule = {
      bookings: [booking(day(2026, 7, 11), day(2026, 7, 11))],
      pending: [],
    };
    let s = flowReducer(
      start,
      { type: "pickDay", date: day(2026, 7, 10) },
      ctx(schedule),
    );
    s = flowReducer(
      s,
      { type: "pickDay", date: day(2026, 7, 13) },
      ctx(schedule),
    );
    expect(s.error).toBe(RANGE_BLOCKED_ERROR);
    expect(s.selStart).toBe(day(2026, 7, 13));
    expect(s.selEnd).toBeNull();
  });

  test("a day past the horizon is refused with its own message", () => {
    const beyond = lastBookableDay(TODAY) + DAY_MS;
    const s = flowReducer(start, { type: "pickDay", date: beyond }, ctx());
    expect(s.error).toBe(RANGE_TOO_FAR_ERROR);
    expect(s.selStart).toBeNull();
  });

  test("month stepping clamps to the bookable window", () => {
    const { first, last } = bookableRange(TODAY);
    const back = flowReducer(start, { type: "stepMonth", by: -1 }, ctx());
    // Already at the first month, so nothing changes — same object.
    expect(back).toBe(start);

    let s = start;
    for (let i = 0; i < 20; i++) {
      s = flowReducer(s, { type: "stepMonth", by: 1 }, ctx());
    }
    expect(s.month).toBe(last);
    expect(s.month - first).toBe(11);
  });

  test("going to the form needs a period, and going back keeps what was typed", () => {
    expect(flowReducer(start, { type: "toForm" }, ctx())).toBe(start);

    let s = flowReducer(
      start,
      { type: "pickDay", date: day(2026, 7, 10) },
      ctx(),
    );
    s = flowReducer(s, { type: "toForm" }, ctx());
    expect(s.step).toBe("form");

    s = flowReducer(s, { type: "setDestination", value: "Texel" }, ctx());
    s = flowReducer(s, { type: "setNote", value: "met de hond" }, ctx());
    s = flowReducer(s, { type: "toCalendar" }, ctx());
    expect(s.step).toBe("cal");
    expect(s.destination).toBe("Texel");
    expect(s.note).toBe("met de hond");
    expect(s.selStart).toBe(day(2026, 7, 10));
  });

  test("a submission records how it was worded and whether it settled", () => {
    let s = flowReducer(
      start,
      { type: "pickDay", date: day(2026, 7, 10) },
      ctx(),
    );
    s = flowReducer(s, { type: "toForm" }, ctx());
    s = flowReducer(
      s,
      { type: "submitted", words: "do 10 augustus", approved: true },
      ctx(),
    );
    expect(s.step).toBe("done");
    expect(s.doneWords).toBe("do 10 augustus");
    expect(s.doneApproved).toBe(true);
  });

  test("a refused submission surfaces the reason and keeps the input", () => {
    let s = flowReducer(
      start,
      { type: "pickDay", date: day(2026, 7, 10) },
      ctx(),
    );
    s = flowReducer(s, { type: "toForm" }, ctx());
    s = flowReducer(s, { type: "setDestination", value: "Texel" }, ctx());
    s = flowReducer(
      s,
      { type: "failed", error: "Die dagen zijn net vergeven." },
      ctx(),
    );
    expect(s.step).toBe("form");
    expect(s.error).toBe("Die dagen zijn net vergeven.");
    expect(s.destination).toBe("Texel");
  });

  test("starting over clears the period but stays on the month you were reading", () => {
    let s = flowReducer(start, { type: "stepMonth", by: 2 }, ctx());
    const month = s.month;
    s = flowReducer(s, { type: "pickDay", date: day(2026, 9, 10) }, ctx());
    s = flowReducer(s, { type: "setNote", value: "iets" }, ctx());
    s = flowReducer(s, { type: "startOver" }, ctx());
    expect(s.month).toBe(month);
    expect(s.selStart).toBeNull();
    expect(s.selEnd).toBeNull();
    expect(s.note).toBe("");
    expect(s.step).toBe("cal");
  });
});
