import { GALLON_OZ } from "@shared/types.ts";

/**
 * The water column. Carried over from the original mock more or less intact — the drifting
 * wave pair, the quarter ticks, the dashed 1 GAL marker — because it is the one piece of
 * the page that reads at a glance from across the kitchen.
 *
 * `aria-hidden`: the same numbers are announced by the entry-count line, so a screen reader
 * would otherwise hear the total twice.
 */
export function Vessel(props: { totalOz: number; goalOz: number }) {
  const percent = Math.max(0, Math.min(100, (props.totalOz / props.goalOz) * 100));
  const showGallonMark = props.goalOz > GALLON_OZ;

  return (
    <div class="vessel" aria-hidden="true">
      <div class="ticks">
        {[25, 50, 75].map((bottom) => (
          <i key={bottom} style={{ bottom: `${bottom}%` }} />
        ))}
      </div>

      <div class="fill" style={{ height: `${percent}%` }}>
        <svg class="wave" viewBox="0 0 200 14" preserveAspectRatio="none">
          <path d="M0,7 C25,0 25,14 50,7 C75,0 75,14 100,7 C125,0 125,14 150,7 C175,0 175,14 200,7 L200,14 L0,14 Z" />
        </svg>
        <svg class="wave b" viewBox="0 0 200 14" preserveAspectRatio="none">
          <path d="M0,7 C25,1 25,13 50,7 C75,1 75,13 100,7 C125,1 125,13 150,7 C175,1 175,13 200,7 L200,14 L0,14 Z" />
        </svg>
      </div>

      {showGallonMark && (
        <div class="gal" style={{ bottom: `${(GALLON_OZ / props.goalOz) * 100}%` }} />
      )}

      <div class="amount">
        {props.totalOz}
        <span>OZ WATER</span>
      </div>
    </div>
  );
}
