import {
  type CalendarCell,
  type Day,
  fullDateWords,
  WEEKDAY_HEADINGS,
} from "@/lib/boek-de-bus/schedule";

/**
 * One month of squares. Every visual state the prototype computed inline is a
 * data attribute here; `src/styles/boek-de-bus.css` layers them in the same
 * order the prototype's style objects were merged.
 *
 * The grid needs no grouping role of its own — it follows the month heading,
 * and every day names its own full date.
 */
export function MonthGrid({
  cells,
  onPick,
}: {
  cells: readonly CalendarCell[];
  onPick: (date: Day) => void;
}) {
  return (
    <>
      {/* Decorative: each day's own label already spells its weekday out. */}
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAY_HEADINGS.map((wd) => (
          <span key={wd}>{wd}</span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((cell) => (
          <DayCell key={cell.date} cell={cell} onPick={onPick} />
        ))}
      </div>
    </>
  );
}

function DayCell({
  cell,
  onPick,
}: {
  cell: CalendarCell;
  onPick: (date: Day) => void;
}) {
  const { booking, selection } = cell;
  // A day being chosen hides its pending ring, so the selection reads cleanly.
  const pending =
    selection || cell.pendingCount === 0
      ? undefined
      : cell.pendingCount === 1
        ? "1"
        : "many";

  return (
    <button
      type="button"
      className="cal-cell"
      disabled={!cell.selectable}
      aria-label={dayLabel(cell)}
      aria-pressed={cell.selectable ? selection != null : undefined}
      onClick={cell.selectable ? () => onPick(cell.date) : undefined}
      data-out-of-month={cell.inMonth ? undefined : ""}
      data-past={cell.past ? "" : undefined}
      data-today={cell.isToday ? "" : undefined}
      data-pending={pending}
      data-booked={booking ? (booking.own ? "own" : "other") : undefined}
      data-run-start={booking?.isStart ? "" : undefined}
      data-run-end={booking?.isEnd ? "" : undefined}
      data-selected={selection ? "" : undefined}
      data-sel-start={selection?.isStart ? "" : undefined}
      data-sel-end={selection?.isEnd ? "" : undefined}
      data-sel-edge={selection?.isStart || selection?.isEnd ? "" : undefined}
    >
      <span className="cal-fill">
        <span className="cal-num">
          {cell.number}
          {pending === "1" && <span className="cal-dot" />}
          {pending === "many" && (
            <>
              <span className="cal-dot" />
              <span className="cal-dot" />
            </>
          )}
        </span>
        {booking?.chip && <span className="cal-chip">{booking.chip}</span>}
      </span>
    </button>
  );
}

/** The full date, plus whatever makes this day special. */
function dayLabel(cell: CalendarCell): string {
  const parts = [fullDateWords(cell.date)];
  if (cell.isToday) parts.push("vandaag");
  if (cell.past) parts.push("voorbij");
  if (cell.booking) {
    // The badge only prints an initial, and `aria-label` suppresses it, so
    // whose trip it is has to be said here or it is lost.
    parts.push(
      cell.booking.own ? "jouw rit" : `geboekt door ${cell.booking.initial}`,
    );
  } else if (cell.pendingCount === 1) {
    parts.push("1 aanvraag");
  } else if (cell.pendingCount > 1) {
    parts.push(`${cell.pendingCount} aanvragen`);
  }
  return parts.join(", ");
}
