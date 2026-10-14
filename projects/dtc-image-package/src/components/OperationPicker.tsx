import { Check, Lock } from "lucide-react";
import { OPERATIONS, type Operation } from "../lib/options";

type Props = {
  selected: Operation[];
  hasReference: boolean;
  onChange: (next: Operation[]) => void;
};

/** Operations that require the reference style image to make sense. */
const REQUIRES_REFERENCE: Operation[] = ["lifestyle_scenes"];

export function OperationPicker({ selected, hasReference, onChange }: Props) {
  const toggle = (key: Operation) => {
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else onChange([...selected, key]);
  };

  // resize_only is a mode-switch, not a regular op — it's only reachable
  // through the "Resize ad creative" preset, never the advanced grid.
  const visibleOps = OPERATIONS.filter((o) => o.key !== "resize_only");

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
      {visibleOps.map((op) => {
        const isOn = selected.includes(op.key);
        const Icon = op.icon;
        const needsRef = REQUIRES_REFERENCE.includes(op.key) && !hasReference;
        const locked = op.soon || needsRef;
        const tooltip = op.soon
          ? "Coming soon"
          : needsRef
          ? "Upload a reference style image to unlock this operation"
          : undefined;
        return (
          <button
            key={op.key}
            type="button"
            disabled={locked}
            onClick={() => !locked && toggle(op.key)}
            title={tooltip}
            className={
              "relative text-left p-3 border rounded-lg transition-all flex gap-3 items-start " +
              (locked
                ? "border-line bg-panel-2/30 opacity-60 cursor-not-allowed"
                : isOn
                ? "border-amber bg-amber-soft shadow-soft"
                : "border-line bg-panel hover:border-amber-border hover:shadow-soft")
            }
          >
            <div
              className={
                "flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center " +
                (locked ? "bg-panel-2 text-faint" : isOn ? "bg-amber text-white" : "bg-panel-2 text-ink-2")
              }
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="text-sm font-semibold leading-snug">{op.title}</div>
                {op.soon ? (
                  <span className="font-mono uppercase text-[8px] tracking-wider px-1 py-[2px] rounded bg-panel-2 text-muted border border-line font-bold">
                    SOON
                  </span>
                ) : null}
                {needsRef ? (
                  <span className="inline-flex items-center gap-0.5 font-mono uppercase text-[8px] tracking-wider px-1 py-[2px] rounded bg-panel-2 text-muted border border-line font-bold">
                    <Lock className="w-2 h-2" />
                    Needs ref
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-muted leading-snug">{op.description}</div>
            </div>
            {isOn && !locked ? (
              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" strokeWidth={3} />
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
