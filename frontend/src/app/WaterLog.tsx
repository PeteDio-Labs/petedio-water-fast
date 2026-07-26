import type { WaterEntry } from "@shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { entryLabel, logStamp } from "../lib/format.ts";

/**
 * The entry list. `source === "seed"` rows are tagged — those are the drinks backfilled
 * from before the app existed, and it's worth being able to tell them from what you logged
 * yourself.
 */
export function WaterLog(props: { entries: WaterEntry[]; onDelete: (id: string) => void }) {
  if (props.entries.length === 0) {
    return (
      <GlassCard>
        <p class="empty">Nothing logged yet. Tap an amount above when you drink.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <ul class="log">
        {props.entries.map((entry) => (
          <li key={entry.id}>
            <span class="time">{logStamp(entry.loggedAt)}</span>
            <span class="oz">{entryLabel(entry.oz)}</span>
            {entry.source === "seed" && <span class="src">SEED</span>}
            <button
              type="button"
              aria-label={`Remove the ${entry.oz} ounce entry`}
              onClick={() => props.onDelete(entry.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
