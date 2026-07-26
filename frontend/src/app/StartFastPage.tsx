import { useMemo, useState } from "preact/hooks";
import type { FamilyMember, StartFastBody } from "@shared/types.ts";
import { DEFAULT_GOAL_OZ } from "@shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { DropIcon } from "../components/Icons.tsx";
import { Seg } from "../components/Seg.tsx";
import { longStamp } from "../lib/format.ts";
import { FamilyStrip } from "./FamilyStrip.tsx";

const DURATIONS = [
  { value: 16, label: "16h" },
  { value: 24, label: "24h" },
  { value: 36, label: "36h" },
  { value: 48, label: "48h" },
  { value: 72, label: "72h" },
] as const;

type StartWhen = "now" | "midnight";

/**
 * The cold-start screen — what Michelle and Marcos see first.
 *
 * "Started at midnight" is offered as a first-class choice rather than buried in a date
 * picker because it is how these fasts actually begin: you decide the night before, and you
 * open the app somewhere in the middle of the next morning.
 */
export function StartFastPage(props: {
  displayName: string;
  family: FamilyMember[];
  busy: boolean;
  onStart: (body: StartFastBody) => void;
}) {
  const [hours, setHours] = useState<number>(36);
  const [when, setWhen] = useState<StartWhen>("now");
  const [goalOz, setGoalOz] = useState<number>(DEFAULT_GOAL_OZ);

  const startedAt = useMemo(() => {
    if (when === "now") return undefined;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return midnight.toISOString();
  }, [when]);

  const targetEndAt = useMemo(() => {
    const base = startedAt ? new Date(startedAt) : new Date();
    return new Date(base.getTime() + hours * 3_600_000).toISOString();
  }, [startedAt, hours]);

  // Backdating to midnight only makes sense while the resulting window is still ahead of us.
  const alreadyOver = new Date(targetEndAt).getTime() <= Date.now();

  return (
    <>
      <div class="eyebrow">
        <span>Water fast</span>
        <span>{props.displayName}</span>
      </div>

      <div class="stack">
        <GlassCard>
          <div class="start-hero">
            <div class="drop">
              <DropIcon />
            </div>
            {/* No subtitle: the two field labels below it already say "How long" and
                "Starting from", which is what the sentence was explaining. */}
            <h1>Start a fast</h1>
          </div>

          <div class="start-body">
            <div class="field-label">How long</div>
            <Seg
              ariaLabel="Fast length"
              options={DURATIONS}
              selected={hours}
              onSelect={setHours}
            />

            <div class="field-label">Starting from</div>
            <Seg
              ariaLabel="When the fast started"
              options={[
                { value: "now" as StartWhen, label: "Right now" },
                { value: "midnight" as StartWhen, label: "Midnight today" },
              ]}
              selected={when}
              onSelect={setWhen}
            />

            <div class="field-label">Water target</div>
            <div class="group">
              <div class="irow">
                <span class="ik">Ounces</span>
                <span class="iv">
                  <input
                    type="number"
                    min="8"
                    max="400"
                    step="0.1"
                    value={goalOz}
                    aria-label="Water target in ounces"
                    onInput={(e) => setGoalOz(Number((e.target as HTMLInputElement).value))}
                    style={{
                      width: "74px",
                      background: "transparent",
                      border: "none",
                      color: "var(--water)",
                      font: "inherit",
                      textAlign: "right",
                    }}
                  />
                </span>
              </div>
            </div>

            <div class="preview">
              {alreadyOver ? (
                <>That window has already passed — pick a longer fast, or start from now.</>
              ) : (
                <>
                  First meal <b>{longStamp(targetEndAt)}</b>
                </>
              )}
            </div>

            <button
              type="button"
              class="big-btn go"
              disabled={props.busy || alreadyOver || !(goalOz >= 8 && goalOz <= 400)}
              onClick={() => props.onStart({ hours, goalOz, startedAt })}
            >
              {props.busy ? "Starting…" : "Begin fast"}
            </button>
          </div>
        </GlassCard>

        <FamilyStrip members={props.family} />
      </div>

      <p class="note">
        You can break a fast at any time, and nothing here is medical advice — if you feel
        unwell, stop and eat.
      </p>
    </>
  );
}
