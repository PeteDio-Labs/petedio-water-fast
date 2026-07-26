/**
 * A single shared 1 Hz tick.
 *
 * Every component that shows elapsed or remaining time subscribes to this rather than
 * running its own `setInterval` — with the countdown, the timeline, the vessel and the
 * family strip all animating, independent timers would drift apart and the seconds digit
 * would visibly disagree with the progress bar.
 */
import { useEffect, useState } from "preact/hooks";

type Listener = (now: Date) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | undefined;

function ensureTimer() {
  if (timer !== undefined) return;
  timer = setInterval(() => {
    const now = new Date();
    for (const listener of listeners) listener(now);
  }, 1000);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  ensureTimer();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Re-renders the calling component once a second, returning the current time. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => subscribe(setNow), []);
  return now;
}

export interface Progress {
  elapsedMs: number;
  remainingMs: number;
  percent: number;
  complete: boolean;
}

/**
 * Mirror of the backend's `fastProgress` — same clamping at both ends, so the page never
 * shows a negative countdown or a bar past 100%.
 */
export function progressOf(startedAt: string, targetEndAt: string, now: Date): Progress {
  const start = new Date(startedAt).getTime();
  const end = new Date(targetEndAt).getTime();
  const total = end - start;
  const elapsed = now.getTime() - start;
  const remaining = end - now.getTime();

  return {
    elapsedMs: Math.max(0, elapsed),
    remainingMs: Math.max(0, remaining),
    percent: total <= 0 ? 100 : Math.max(0, Math.min(100, (elapsed / total) * 100)),
    complete: remaining <= 0,
  };
}

export type Phase = "idle" | "early" | "mid" | "late" | "done";

/** Maps progress onto the body[data-phase] tint that warms the page toward the meal color. */
export function phaseOf(percent: number, complete: boolean): Phase {
  if (complete) return "done";
  if (percent >= 75) return "late";
  if (percent >= 30) return "mid";
  return "early";
}
