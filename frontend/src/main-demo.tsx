/**
 * demo.html — the real app against a fully in-memory backend, so the UI can be reviewed and
 * driven with no server, no database and no Cloudflare Access in front of it. Never served
 * in production; the backend only ever serves index.html.
 *
 * Switching scenario remounts the app with a fresh mock, which is what makes the cold-start
 * flow ("no fast yet" → start one → stat page) reviewable in a couple of clicks.
 */
import { render } from "preact";
import { useMemo, useState } from "preact/hooks";
import { App } from "./app/App.tsx";
import { createMockBackend, type Scenario } from "./lib/mock.ts";
import "./styles/tokens.css";
import "./styles/app.css";

function Demo() {
  const [scenario, setScenario] = useState<Scenario>("fasting");
  const [nonce, setNonce] = useState(0);

  // Memoised per (scenario, nonce): constructing the mock inline in JSX would build a fresh
  // one — with its seed state restored — on every render, so nothing you logged would ever
  // stick, and App's `refresh` callback would change identity on each pass and re-fetch in
  // a loop.
  const backend = useMemo(() => createMockBackend(scenario), [scenario, nonce]);

  function pick(next: Scenario) {
    setScenario(next);
    setNonce((n) => n + 1);
  }

  return (
    <>
      <div class="demo-banner">Demo — mock data, nothing is saved</div>
      <div class="demo-switch">
        <button
          type="button"
          class={scenario === "fasting" ? "on" : ""}
          onClick={() => pick("fasting")}
        >
          Mid-fast
        </button>
        <button
          type="button"
          class={scenario === "no-fast" ? "on" : ""}
          onClick={() => pick("no-fast")}
        >
          No fast yet
        </button>
      </div>
      <div class="wrap">
        <App key={`${scenario}-${nonce}`} backend={backend} />
      </div>
    </>
  );
}

render(<Demo />, document.getElementById("app")!);
