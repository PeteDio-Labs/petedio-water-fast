import { useCallback, useEffect, useState } from "preact/hooks";
import type { FamilyMember, Me, StartFastBody } from "@shared/types.ts";
import { ApiError, type Backend } from "../lib/api.ts";
import { phaseOf, progressOf, useNow } from "../lib/clock.ts";
import { StartFastPage } from "./StartFastPage.tsx";
import { StatPage } from "./StatPage.tsx";

/**
 * The whole app. One decision drives everything: `me.activeFast` is either there (show the
 * stat page) or it isn't (show the start screen) — the same check the backend makes, and
 * the reason `GET /api/me` returns the fast rather than a boolean.
 *
 * State is re-fetched from the server after every mutation instead of being patched locally.
 * Totals, ordering, and the one-active-fast rule are all decided server-side, so re-reading
 * is the only way the page is guaranteed to agree with the database.
 */
export function App(props: { backend: Backend }) {
  const [me, setMe] = useState<Me | null>(null);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const now = useNow();

  const refresh = useCallback(async () => {
    const [next, familyView] = await Promise.all([props.backend.me(), props.backend.family()]);
    setMe(next);
    setFamily(familyView.members);
  }, [props.backend]);

  useEffect(() => {
    refresh()
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => setLoaded(true));
  }, [refresh]);

  /**
   * Runs a mutation, then re-reads. `busy` guards against a second write landing while the
   * first is in flight — the quick-add buttons are large and easy to double-tap.
   */
  const mutate = useCallback(
    async (action: () => Promise<unknown>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await action();
        await refresh();
      } catch (err: unknown) {
        setError(messageOf(err));
        // Re-read anyway: the write may have landed even though the response didn't arrive,
        // and a stale page is more confusing than an error with the right numbers under it.
        await refresh().catch(() => undefined);
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  // Drive the page's colour tint from how far through the fast we are.
  useEffect(() => {
    const fast = me?.activeFast;
    const phase = fast
      ? phaseOf(
          progressOf(fast.startedAt, fast.targetEndAt, now).percent,
          progressOf(fast.startedAt, fast.targetEndAt, now).complete,
        )
      : "idle";
    document.body.dataset.phase = phase;
  }, [me, now]);

  if (!loaded) {
    return <div class="loading">Loading…</div>;
  }

  return (
    <>
      {error && (
        <div class="errbar" role="alert">
          {error}
        </div>
      )}

      {me?.activeFast ? (
        <StatPage
          fast={me.activeFast}
          family={family}
          busy={busy}
          onLogWater={(oz) => mutate(() => props.backend.logWater(me.activeFast!.id, { oz }))}
          onDeleteEntry={(id) => mutate(() => props.backend.deleteWater(id))}
          onEndFast={() => mutate(() => props.backend.endFast(me.activeFast!.id))}
        />
      ) : (
        <StartFastPage
          displayName={me?.displayName ?? ""}
          family={family}
          busy={busy}
          onStart={(body: StartFastBody) => mutate(() => props.backend.startFast(body))}
        />
      )}
    </>
  );
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
