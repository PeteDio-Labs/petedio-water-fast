/** The panel's segmented control, generic over its option values. */
export function Seg<T extends string | number>(props: {
  options: readonly { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div class="seg" role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === props.selected}
          class={option.value === props.selected ? "selected" : ""}
          onClick={() => props.onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
