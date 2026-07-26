import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

/**
 * A centred modal, on the native `<dialog>` element.
 *
 * `showModal()` rather than a hand-rolled overlay div, because it brings the three things
 * a hand-rolled one always gets wrong: focus is trapped inside the dialog, Escape closes
 * it, and the rest of the page goes inert so a stray tap behind the veil can't log water
 * while you're deciding whether to break your fast. It also renders in the top layer, so
 * it can't be trapped under a stacking context the way a z-index overlay can.
 *
 * The dialog can close itself (Escape), so the `close` event is mirrored back into the
 * caller's state rather than assumed — otherwise `open` would say true for a dialog the
 * browser had already dismissed, and the next open would be a no-op.
 */
export function Modal(props: {
  open: boolean;
  onClose: () => void;
  /** id of the element naming this dialog, for screen readers. */
  labelledBy: string;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (props.open && !el.open) el.showModal();
    else if (!props.open && el.open) el.close();
  }, [props.open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => props.onClose();
    el.addEventListener("close", sync);
    return () => el.removeEventListener("close", sync);
  }, [props.onClose]);

  // `showModal` makes the page inert but does not stop it scrolling underneath, which on a
  // phone reads as the modal sliding around. Cleanup also runs on unmount, so ending the
  // fast — which swaps this whole page out — can't leave the body locked.
  useEffect(() => {
    if (!props.open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [props.open]);

  return (
    <dialog
      ref={ref}
      class="modal"
      aria-labelledby={props.labelledBy}
      // Only a click that lands on the dialog box itself is a backdrop click; anything on
      // the panel is a child and doesn't match.
      onClick={(event) => {
        if (event.target === ref.current) props.onClose();
      }}
    >
      <div class="modal-panel">{props.children}</div>
    </dialog>
  );
}
