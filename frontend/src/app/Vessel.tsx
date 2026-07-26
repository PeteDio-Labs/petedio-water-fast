import { useEffect, useRef, useState } from "preact/hooks";
import { GALLON_OZ } from "@shared/types.ts";

/**
 * The water column. Carried over from the original mock — the quarter ticks, the dashed
 * 1 GAL marker, the drifting waves — because it is the one piece of the page that reads at
 * a glance from across the kitchen.
 *
 * The motion is doing a job, not decorating: the column has to look like *water* at a
 * glance, and a single sliding wave read as a striped bar. Three wave layers at different
 * speeds and wavelengths (one running backwards) never line up the same way twice, the
 * surface swells on its own slower cycle, bubbles rise, and logging water sends a ripple
 * across the waterline — so a glance from the kitchen tells you something moved.
 *
 * `aria-hidden`: the same numbers are announced by the entry-count line, so a screen reader
 * would otherwise hear the total twice. Everything below is decoration over that number.
 */

/**
 * Fixed, not random: a `Math.random()` here would reshuffle every bubble on every render
 * (each countdown tick re-renders this page), which reads as a glitch rather than as fizz.
 * Deliberately co-prime-ish durations so the column doesn't fall into a visible loop.
 */
const BUBBLES = [
  { left: 22, size: 3.5, dur: 6.5, delay: 0, sway: 5 },
  { left: 61, size: 2.5, dur: 8.3, delay: 1.7, sway: -4 },
  { left: 40, size: 4.5, dur: 5.4, delay: 3.1, sway: 3 },
  { left: 78, size: 3, dur: 9.7, delay: 0.8, sway: -6 },
  { left: 12, size: 2.5, dur: 7.1, delay: 4.4, sway: 4 },
  { left: 52, size: 3.5, dur: 10.6, delay: 2.3, sway: -3 },
];

export function Vessel(props: { totalOz: number; goalOz: number }) {
  const percent = Math.max(0, Math.min(100, (props.totalOz / props.goalOz) * 100));
  const showGallonMark = props.goalOz > GALLON_OZ;

  // Held one frame behind the real value so the level always arrives by transition: on
  // mount the column pours up from empty, and every later change rides the same easing.
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLevel(percent));
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  // A splash is the *rise* of the waterline, so it fires on an increase only — deleting an
  // entry drops the level quietly rather than celebrating it.
  const [splashing, setSplashing] = useState(false);
  const previousOz = useRef(props.totalOz);
  useEffect(() => {
    const rose = props.totalOz > previousOz.current;
    previousOz.current = props.totalOz;
    if (!rose) return;
    setSplashing(true);
    const timer = setTimeout(() => setSplashing(false), 1200);
    return () => clearTimeout(timer);
  }, [props.totalOz]);

  return (
    <div class={splashing ? "vessel splashing" : "vessel"} aria-hidden="true">
      <div class="ticks">
        {[25, 50, 75].map((bottom) => (
          <i key={bottom} style={{ bottom: `${bottom}%` }} />
        ))}
      </div>

      <div class="fill" style={{ height: `${level}%` }}>
        {/* Clipped to the water body so the light and the bubbles stay under the surface. */}
        <div class="depths">
          <div class="sheen" />
          <div class="bubbles">
            {BUBBLES.map((b) => (
              <i
                key={b.left}
                style={{
                  left: `${b.left}%`,
                  width: `${b.size}px`,
                  height: `${b.size}px`,
                  "--dur": `${b.dur}s`,
                  "--delay": `${b.delay}s`,
                  "--sway": `${b.sway}px`,
                }}
              />
            ))}
          </div>
        </div>

        <div class="surface">
          <svg class="wave c" viewBox="0 0 200 14" preserveAspectRatio="none">
            <path d="M0,7 C50,-1 50,15 100,7 C150,-1 150,15 200,7 L200,14 L0,14 Z" />
          </svg>
          <svg class="wave b" viewBox="0 0 200 14" preserveAspectRatio="none">
            <path d="M0,7 C25,1 25,13 50,7 C75,1 75,13 100,7 C125,1 125,13 150,7 C175,1 175,13 200,7 L200,14 L0,14 Z" />
          </svg>
          <svg class="wave a" viewBox="0 0 200 14" preserveAspectRatio="none">
            <path d="M0,7 C25,0 25,14 50,7 C75,0 75,14 100,7 C125,0 125,14 150,7 C175,0 175,14 200,7 L200,14 L0,14 Z" />
          </svg>
          <div class="ripple" />
        </div>
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
