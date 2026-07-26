import type { FamilyMember } from "@shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { useNow, progressOf } from "../lib/clock.ts";
import { initial, round1 } from "../lib/format.ts";

/**
 * Who else in the family is fasting right now.
 *
 * Read-only and deliberately shallow — a name, how far in, how much water. There is no way
 * to open someone else's log from here, and the API never sends it.
 */
export function FamilyStrip(props: { members: FamilyMember[] }) {
  const now = useNow();

  if (props.members.length === 0) return null;

  return (
    <>
      <div class="section-head">
        <h2>Fasting with you</h2>
        <span class="meta">
          {props.members.length} {props.members.length === 1 ? "person" : "people"}
        </span>
      </div>

      <GlassCard class="family">
        {props.members.map((member) => {
          const progress = progressOf(member.startedAt, member.targetEndAt, now);
          const hour = Math.floor(progress.elapsedMs / 3_600_000);
          const waterPercent = Math.max(
            0,
            Math.min(100, (member.totalOz / member.goalOz) * 100),
          );

          return (
            <div class="fam-row" key={`${member.displayName}-${member.startedAt}`}>
              <div class="fam-avatar" aria-hidden="true">
                {initial(member.displayName)}
              </div>

              <div class="fam-text">
                <strong>{member.displayName}</strong>
                <div class="fam-bar">
                  <i style={{ width: `${waterPercent}%` }} />
                </div>
              </div>

              <div class="fam-meta">
                <b>{progress.complete ? "Done" : `Hour ${hour + 1}`}</b>
                {round1(member.totalOz)} oz
              </div>
            </div>
          );
        })}
      </GlassCard>
    </>
  );
}
