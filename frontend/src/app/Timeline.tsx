import type { Progress } from "../lib/clock.ts";
import { shortStamp } from "../lib/format.ts";

/** The fast as a line: start on the left, first meal (the diamond) on the right. */
export function Timeline(props: { progress: Progress; startedAt: string; targetEndAt: string }) {
  const percent = props.progress.percent;

  return (
    <div class="timeline">
      <div
        class="track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="Fast progress"
      >
        <div class="done" style={{ width: `${percent}%` }} />
        <div class="mid" style={{ left: "33.33%" }} />
        <div class="mid" style={{ left: "66.66%" }} />
        <div class="now" style={{ left: `${percent}%` }} />
        <div class="end" />
      </div>

      <div class="stamps">
        <span>{shortStamp(props.startedAt)}</span>
        <span class="r">First meal</span>
      </div>
    </div>
  );
}
