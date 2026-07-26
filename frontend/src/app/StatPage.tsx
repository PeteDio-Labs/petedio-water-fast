import { useState } from "preact/hooks";
import type { FamilyMember, Fast, PersonalStats } from "@shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { Modal } from "../components/Modal.tsx";
import { progressOf, useNow } from "../lib/clock.ts";
import { goalNote } from "../lib/format.ts";
import { Countdown } from "./Countdown.tsx";
import { FamilyStrip } from "./FamilyStrip.tsx";
import { LogWater } from "./LogWater.tsx";
import { RecordRow } from "./RecordRow.tsx";
import { Timeline } from "./Timeline.tsx";
import { Vessel } from "./Vessel.tsx";
import { WaterLog } from "./WaterLog.tsx";

/**
 * The page you see while fasting — the original mock's layout, in glass.
 *
 * All mutations go through the callbacks rather than being applied locally first: the
 * server owns the running total, and an optimistic local sum that disagreed with it after a
 * failed write would be worse than a brief spinner.
 */
export function StatPage(props: {
  fast: Fast;
  family: FamilyMember[];
  busy: boolean;
  onLogWater: (oz: number) => void;
  onDeleteEntry: (id: string) => void;
  onEndFast: () => void;
  stats: PersonalStats | null;
  onOpenStats: () => void;
}) {
  const now = useNow();
  const progress = progressOf(props.fast.startedAt, props.fast.targetEndAt, now);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  const totalHours = Math.round(
    (new Date(props.fast.targetEndAt).getTime() - new Date(props.fast.startedAt).getTime()) /
      3_600_000,
  );
  const hour = Math.floor(progress.elapsedMs / 3_600_000) + 1;

  return (
    <>
      <div class="eyebrow">
        <span>
          Water fast · <b>{totalHours}</b> hours
        </span>
        <span>{progress.complete ? "Complete" : `Hour ${Math.min(hour, totalHours)} of ${totalHours}`}</span>
      </div>

      <div class="stack">
        <GlassCard>
          <div class="hero">
            <Vessel totalOz={props.fast.totalOz} goalOz={props.fast.goalOz} />
            <Countdown progress={progress} targetEndAt={props.fast.targetEndAt} />
          </div>
          <Timeline
            progress={progress}
            startedAt={props.fast.startedAt}
            targetEndAt={props.fast.targetEndAt}
          />
        </GlassCard>

        <div>
          {/* Just what's left. The running total is the vessel's number, in 20px type a
              thumb's width above this line; pairing it with a bottle count here wrapped
              the heading onto two lines at 320px and said nothing new. */}
          <div class="section-head">
            <h2>Water logged</h2>
            <span class="meta">{goalNote(props.fast.goalOz, props.fast.totalOz)}</span>
          </div>
          <LogWater busy={props.busy} onLog={props.onLogWater} />
        </div>

        <div>
          <div class="section-head">
            <h2>Entries</h2>
          </div>
          <WaterLog entries={props.fast.entries} onDelete={props.onDeleteEntry} />
        </div>

        <FamilyStrip members={props.family} />

        <RecordRow stats={props.stats} onOpen={props.onOpenStats} />

        <div>
          <button type="button" class="big-btn plain" onClick={() => setConfirmingEnd(true)}>
            {progress.complete ? "Finish fast" : "Break fast"}
          </button>
        </div>
      </div>

      {/* Confirming closes the modal before the request goes out, so a failure lands on the
          error bar where it can actually be seen — the top layer paints over it. */}
      <Modal
        open={confirmingEnd}
        onClose={() => setConfirmingEnd(false)}
        labelledBy="end-fast-title"
      >
        <GlassCard>
          <div class="card-pad">
            <p class="modal-title" id="end-fast-title">
              {progress.complete ? "Finish this fast?" : "Break this fast early?"}
            </p>
            <p class="modal-body">
              Your entries are kept, and the fast goes to your stats.
            </p>
            <button
              type="button"
              class="big-btn danger"
              disabled={props.busy}
              onClick={() => {
                setConfirmingEnd(false);
                props.onEndFast();
              }}
            >
              {progress.complete ? "Finish fast" : "Break fast"}
            </button>
            {/* Focus the safe option, not the destructive one: `showModal` otherwise lands
                on the first focusable child, and Enter would break the fast outright. */}
            <button
              type="button"
              class="big-btn plain"
              autofocus
              onClick={() => setConfirmingEnd(false)}
            >
              Keep going
            </button>
          </div>
        </GlassCard>
      </Modal>
    </>
  );
}
