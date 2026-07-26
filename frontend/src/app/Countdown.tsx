import type { Progress } from "../lib/clock.ts";
import { countdownParts, elapsedLabel, longStamp } from "../lib/format.ts";

/**
 * Time until the first meal.
 *
 * `role="timer"` with `aria-live="off"`: the value changes every second, and an assertive
 * live region would make a screen reader read the whole countdown once a second, which is
 * unusable. The meal stamp and the elapsed line carry the same information statically.
 */
export function Countdown(props: { progress: Progress; targetEndAt: string }) {
  const { hh, mm, ss } = countdownParts(props.progress.remainingMs);

  return (
    <div class="clock">
      <div class="label">{props.progress.complete ? "Fast complete" : "Until first meal"}</div>

      <div
        class="count"
        role="timer"
        aria-live="off"
        aria-label={`${hh} hours ${mm} minutes until your first meal`}
      >
        <span>{hh}</span>
        <span class="u">h</span>
        <span>{mm}</span>
        <span class="u">m</span>
        <span class="sec">{ss}</span>
        <span class="u">s</span>
      </div>

      {props.progress.complete ? (
        <div class="done-msg">Fast complete. Go eat.</div>
      ) : (
        <>
          <div class="meal-at">
            <span class="dot" />
            {longStamp(props.targetEndAt)}
          </div>
          <div class="elapsed">{elapsedLabel(props.progress.elapsedMs)}</div>
        </>
      )}
    </div>
  );
}
