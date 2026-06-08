import { Check, Package, Sparkles, Shirt, Eraser, Wrench, Lock, Crop } from "lucide-react";
import type { Operation } from "../lib/options";
import type { LucideIcon } from "lucide-react";

export type PresetKey =
  | "product_pack"
  | "product_lifestyle"
  | "apparel_ghost"
  | "cleanup"
  | "resize_ad"
  | "custom";

type PresetDef = {
  key: PresetKey;
  title: string;
  description: string;
  operations: Operation[];
  icon: LucideIcon;
  /** Set when this preset can't be picked without the reference style image. */
  requiresReference?: boolean;
};

export const PRESETS: PresetDef[] = [
  {
    key: "product_pack",
    title: "Product pack",
    description: "Cutout + white studio shot · for PDPs and Amazon main image",
    operations: ["isolate", "background_replace"],
    icon: Package,
  },
  {
    key: "product_lifestyle",
    title: "Product + lifestyle",
    description: "Cutout + studio + 3 lifestyle scenes matched to your reference style",
    operations: ["isolate", "background_replace", "lifestyle_scenes"],
    icon: Sparkles,
    requiresReference: true,
  },
  {
    key: "apparel_ghost",
    title: "Apparel ghost mannequin",
    description: "Strip the model — garment alone on white. Use for clothing on a model.",
    operations: ["remove_model", "background_replace"],
    icon: Shirt,
  },
  {
    key: "cleanup",
    title: "Cleanup only",
    description: "Strip watermarks, supplier text, prop hands · keep the original",
    operations: ["remove_object"],
    icon: Eraser,
  },
  {
    key: "resize_ad",
    title: "Resize ad creative",
    description: "Drop a finished ad / image · smart-resize it to every selected platform ratio",
    operations: ["resize_only"],
    icon: Crop,
  },
  {
    key: "custom",
    title: "Custom",
    description: "Pick any combination of operations · advanced",
    operations: [],
    icon: Wrench,
  },
];

/** Identify which preset (if any) matches the current operations selection. */
export function detectPreset(ops: Operation[]): PresetKey {
  const set = new Set(ops);
  for (const p of PRESETS) {
    if (p.key === "custom") continue;
    if (p.operations.length !== set.size) continue;
    if (p.operations.every((o) => set.has(o))) return p.key;
  }
  return "custom";
}

type Props = {
  selected: PresetKey;
  hasReference: boolean;
  onChange: (preset: PresetKey, operations: Operation[]) => void;
};

export function PresetPicker({ selected, hasReference, onChange }: Props) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
      {PRESETS.map((p) => {
        const isOn = selected === p.key;
        const Icon = p.icon;
        const locked = !!p.requiresReference && !hasReference;
        return (
          <button
            key={p.key}
            type="button"
            disabled={locked}
            onClick={() => !locked && onChange(p.key, p.operations)}
            title={locked ? "Upload a reference style image to unlock this preset" : undefined}
            className={
              "relative text-left p-3 border rounded-lg transition-all flex flex-col gap-2 " +
              (locked
                ? "border-line bg-panel-2/40 opacity-60 cursor-not-allowed"
                : isOn
                ? "border-amber bg-amber-soft shadow-soft"
                : "border-line bg-panel hover:border-amber-border hover:shadow-soft")
            }
          >
            <div className="flex items-center gap-2">
              <div
                className={
                  "flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center " +
                  (locked ? "bg-panel-2 text-faint" : isOn ? "bg-amber text-white" : "bg-panel-2 text-ink-2")
                }
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-sm font-semibold leading-snug">{p.title}</div>
            </div>
            <div className="text-[11px] text-muted leading-snug">{p.description}</div>
            {locked ? (
              <div className="absolute top-2 right-2 inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-[3px] rounded bg-panel border border-line text-muted">
                <Lock className="w-2.5 h-2.5" />
                Needs reference
              </div>
            ) : isOn ? (
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
