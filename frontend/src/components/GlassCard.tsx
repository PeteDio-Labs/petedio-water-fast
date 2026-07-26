import type { ComponentChildren } from "preact";

/**
 * The glass material — the panel's `.glass-card`. A component rather than a bare class so
 * the surface can gain behaviour (a rim that reacts to the state tint, a contrast fallback)
 * in one place.
 */
export function GlassCard(props: { children: ComponentChildren; class?: string }) {
  return <section class={`glass-card ${props.class ?? ""}`}>{props.children}</section>;
}
