import type { PersonalStats } from "@shared/types.ts";
import { durationLabel } from "../lib/format.ts";

/**
 * The way into the stats page, from both the stat page and the start screen.
 *
 * It shows the record rather than saying "Stats", so it earns its line: a nav button with
 * no information in it would be exactly the chrome the rest of the page was just cleared
 * of. Before the first fast is broken there is no record and this renders nothing — the
 * stats page has nothing to show yet, so nothing points at it.
 */
export function RecordRow(props: { stats: PersonalStats | null; onOpen: () => void }) {
  const longest = props.stats?.longest;
  if (!longest) return null;

  return (
    <button type="button" class="record-row" onClick={props.onOpen}>
      <span class="k">Longest fast</span>
      <span class="v">{durationLabel(longest.durationMs)}</span>
      <span class="chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
