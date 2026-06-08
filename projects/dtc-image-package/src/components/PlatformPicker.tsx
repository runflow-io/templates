import { Check } from "lucide-react";
import { PLATFORMS, type Platform } from "../lib/options";
import { BrandIcon } from "./BrandIcon";

type Props = {
  selected: Platform[];
  onChange: (next: Platform[]) => void;
};

export function PlatformPicker({ selected, onChange }: Props) {
  const toggle = (key: Platform) => {
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else onChange([...selected, key]);
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
      {PLATFORMS.map((p) => {
        const isOn = selected.includes(p.key);
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => toggle(p.key)}
            className={
              "relative text-left p-2.5 border rounded-lg transition-all " +
              (isOn
                ? "border-amber bg-amber-soft shadow-soft"
                : "border-line bg-panel hover:border-amber-border hover:shadow-soft")
            }
          >
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <BrandIcon
                  platform={p.key}
                  className={
                    "w-3.5 h-3.5 flex-shrink-0 " + (isOn ? "text-amber" : "text-ink-2")
                  }
                />
                <div className="text-xs font-semibold leading-snug truncate">{p.label}</div>
              </div>
              {isOn ? (
                <div className="w-3.5 h-3.5 rounded-full bg-amber text-white flex items-center justify-center flex-shrink-0">
                  <Check className="w-2 h-2" strokeWidth={3} />
                </div>
              ) : null}
            </div>
            <div className="text-[10px] text-muted mb-1.5">{p.hint}</div>
            <div className="flex flex-wrap gap-1">
              {p.ratios.map((r) => (
                <span
                  key={r}
                  className={
                    "font-mono text-[9px] font-bold px-1.5 py-[2px] rounded " +
                    (isOn ? "bg-amber text-white" : "bg-panel-2 text-muted")
                  }
                >
                  {r}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
