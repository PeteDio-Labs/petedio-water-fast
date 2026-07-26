import { useState } from "preact/hooks";
import { BOTTLE_OZ } from "@shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";

/** The mock's four quick amounts, in bottles. */
const QUICK = [
  { label: "½", sub: "BOTTLE", oz: 8.45 },
  { label: "1", sub: "BOTTLE", oz: BOTTLE_OZ },
  { label: "2", sub: "BOTTLES", oz: 33.8 },
  { label: "3", sub: "BOTTLES", oz: 50.7 },
] as const;

/**
 * Logging water. `busy` disables every control while a write is in flight — on a phone the
 * quick buttons are large and easy to double-tap, and the fix belongs here rather than in a
 * server-side dedupe guess.
 */
export function LogWater(props: { busy: boolean; onLog: (oz: number) => void }) {
  const [custom, setCustom] = useState("");

  function submitCustom() {
    const oz = Number(custom);
    if (!Number.isFinite(oz) || oz <= 0) return;
    props.onLog(oz);
    setCustom("");
  }

  return (
    <GlassCard>
      <div class="quick">
        {QUICK.map((q) => (
          <button
            key={q.oz}
            type="button"
            disabled={props.busy}
            onClick={() => props.onLog(q.oz)}
            aria-label={`Log ${q.oz} ounces`}
          >
            {q.label}
            <small>{q.sub}</small>
          </button>
        ))}
      </div>

      <div class="custom">
        <label class="hidden" for="custom-oz">
          Other amount in ounces
        </label>
        <input
          id="custom-oz"
          type="number"
          inputMode="decimal"
          min="0.1"
          max="300"
          step="0.1"
          placeholder="Other amount in oz"
          value={custom}
          disabled={props.busy}
          onInput={(e) => setCustom((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitCustom();
          }}
        />
        <button type="button" disabled={props.busy || !custom} onClick={submitCustom}>
          Add
        </button>
      </div>
    </GlassCard>
  );
}
