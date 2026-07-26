import type { WaterEntry } from "@shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { logStamp } from "../lib/format.ts";

/**
 * The entry list: when, and how much.
 *
 * Ounces only. The row used to read "1 bottle · 16.9 oz", which is the same quantity twice
 * — bottles are the vocabulary of the *buttons*, where they're an input affordance, not of
 * the record. `source` is still on the wire but no longer badged: "SEED" named a one-off
 * backfill in the app's own vocabulary, and nobody drinking the water needed to decode it.
 */
export function WaterLog(props: { entries: WaterEntry[]; onDelete: (id: string) => void }) {
  if (props.entries.length === 0) {
    return (
      <GlassCard>
        <p class="empty">Nothing logged yet.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <ul class="log">
        {props.entries.map((entry) => (
          <li key={entry.id}>
            <span class="time">{logStamp(entry.loggedAt)}</span>
            <span class="oz">{entry.oz} oz</span>
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
