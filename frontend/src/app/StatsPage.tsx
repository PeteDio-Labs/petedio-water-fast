import type { Fast, PersonalStats } from "@shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { useNow } from "../lib/clock.ts";
import { dayStamp, durationLabel } from "../lib/format.ts";

/**
 * Personal records — what's left of a fast once it's over.
 *
 * Ending a fast has always written `ended_at` rather than deleting anything, so every fast
 * the family has ever broken was already in the database; there was just no way to look at
 * it. This page is that way. Nothing here is retroactive — it reads history that existed.
 *
 * Numbers, not prose, on purpose: the page is a record board, and the app's other pages
 * were just cut back for exactly this reason.
 */
export function StatsPage(props: {
  stats: PersonalStats;
  activeFast: Fast | null;
  displayName: string;
  onBack: () => void;
}) {
  const now = useNow();
  const { longest } = props.stats;

  // Only meaningful while a fast is running, and only interesting if there's a record to
  // chase — the gap to beat is the reason to look at this page mid-fast.
  const inProgressMs = props.activeFast
    ? Math.max(0, now.getTime() - new Date(props.activeFast.startedAt).getTime())
    : null;
  const toBeatMs =
    inProgressMs !== null && longest ? longest.durationMs - inProgressMs : null;

  return (
    <>
      <div class="eyebrow">
        <button type="button" class="back" onClick={props.onBack}>
          ‹ Back
        </button>
        <span>{props.displayName}</span>
      </div>

      {/* A guard, not a screen anyone routes to: RecordRow is the only way in and it hides
          itself until there's a record, so an empty stats page isn't reachable today. It
          stays because the alternative to an empty state here is a crash. */}
      {props.stats.fastsFinished === 0 ? (
        <GlassCard>
          <p class="empty">No finished fasts yet. Break one and it lands here.</p>
        </GlassCard>
      ) : (
        <div class="stack">
          <GlassCard>
            <div class="record">
              <div class="label">Longest fast</div>
              <div class="big">{durationLabel(longest!.durationMs)}</div>
              <div class="sub">
                {dayStamp(longest!.startedAt)} · {longest!.totalOz} oz
                {longest!.reachedTarget && <span class="hit"> · hit target</span>}
              </div>
            </div>

            {inProgressMs !== null && (
              <div class="in-progress">
                <span class="dot" />
                Now at {durationLabel(inProgressMs)}
                {toBeatMs !== null &&
                  (toBeatMs > 0
                    ? ` · ${durationLabel(toBeatMs)} to beat it`
                    : " · new record")}
              </div>
            )}
          </GlassCard>

          <div class="tiles">
            <Tile k="Fasts" v={String(props.stats.fastsFinished)} />
            <Tile k="Total fasted" v={durationLabel(props.stats.totalFastedMs)} />
            <Tile k="Average" v={durationLabel(props.stats.averageFastedMs)} />
            <Tile k="Water" v={`${props.stats.totalOz} oz`} />
          </div>

          <div>
            <div class="section-head">
              <h2>History</h2>
              <span class="meta">
                {props.stats.reachedTargetCount} of {props.stats.fastsFinished} hit target
              </span>
            </div>

            <GlassCard>
              <ul class="history">
                {props.stats.history.map((fast) => (
                  <li key={fast.id}>
                    <span class="when">{dayStamp(fast.startedAt)}</span>
                    <span class="ran">{durationLabel(fast.durationMs)}</span>
                    <span class="oz">{fast.totalOz} oz</span>
                    {/* aria-hidden: "hit target" is already in the section meta as a
                        count, and a checkmark per row would be read out as noise. */}
                    <span class={fast.reachedTarget ? "flag on" : "flag"} aria-hidden="true">
                      ✓
                    </span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>
        </div>
      )}
    </>
  );
}

function Tile(props: { k: string; v: string }) {
  return (
    <GlassCard class="tile">
      <div class="k">{props.k}</div>
      <div class="v">{props.v}</div>
    </GlassCard>
  );
}
