// Side-drawer that lets a user add more formats to an existing pack.
// Picks ops that aren't already in the pack and platforms whose ratios
// aren't already covered. The supplier image is implicit (taken from the pack).

import { useMemo, useState, useEffect } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { OPERATIONS, PLATFORMS, type Operation, type Platform, type AspectRatio } from "../lib/options";
import { Dropzone } from "./Dropzone";
import type { RecentPack } from "../lib/history";

type Props = {
  open: boolean;
  pack: RecentPack | null;
  onClose: () => void;
  onConfirm: (input: { addOperations: Operation[]; addPlatforms: Platform[]; reference: File | null }) => void;
  /** True when an extend job for this pack is currently running. */
  busy?: boolean;
};

/** Operations already covered by the pack — these are disabled in the picker. */
function existingOps(pack: RecentPack): Set<Operation> {
  const have = new Set<string>(pack.assets.map((a) => a.key));
  const ops = new Set<Operation>();
  if (have.has("cutout")) ops.add("isolate");
  if (have.has("cleaned")) ops.add("remove_object");
  if (have.has("white")) ops.add("background_replace");
  if (have.has("life_a")) ops.add("lifestyle_scenes");
  if (have.has("ghost_mannequin")) ops.add("remove_model");
  return ops;
}

/** Ratios already covered (inferred from `*_WxH` asset keys). */
function existingRatios(pack: RecentPack): Set<AspectRatio> {
  const r = new Set<AspectRatio>();
  for (const a of pack.assets) {
    const m = a.key.match(/_(\d+x\d+)$/);
    if (m) r.add(m[1].replace("x", ":") as AspectRatio);
  }
  r.add("1:1");
  return r;
}

export function ExtendDrawer({ open, pack, onClose, onConfirm, busy }: Props) {
  const [selectedOps, setSelectedOps] = useState<Operation[]>([]);
  const [selectedPlats, setSelectedPlats] = useState<Platform[]>([]);
  const [reference, setReference] = useState<File | null>(null);

  // Reset whenever the drawer (re-)opens for a different pack.
  useEffect(() => {
    if (open) {
      setSelectedOps([]);
      setSelectedPlats([]);
      setReference(null);
    }
  }, [open, pack?.id]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const opsHave = useMemo(() => (pack ? existingOps(pack) : new Set<Operation>()), [pack]);
  const ratiosHave = useMemo(() => (pack ? existingRatios(pack) : new Set<AspectRatio>()), [pack]);

  // Ops the user can ADD: not already in the pack + not the resize_only mode-switch.
  const addableOps = OPERATIONS.filter((o) => !o.soon && o.key !== "resize_only" && !opsHave.has(o.key));

  // Platforms whose ratios aren't fully covered yet.
  const addablePlatforms = PLATFORMS.filter((p) => p.ratios.some((r) => !ratiosHave.has(r)));

  const needsReference = selectedOps.includes("lifestyle_scenes");
  const canSubmit =
    !!pack &&
    !busy &&
    (selectedOps.length > 0 || selectedPlats.length > 0) &&
    (!needsReference || !!reference);

  const toggleOp = (k: Operation) =>
    setSelectedOps((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const togglePlat = (k: Platform) =>
    setSelectedPlats((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  if (!open || !pack) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-[520px] h-full bg-bg border-l border-line flex flex-col shadow-card">
        {/* header */}
        <div className="px-5 py-4 border-b border-line">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono uppercase tracking-wider text-[10px] text-muted font-bold">
                Extend pack
              </div>
              <h3 className="text-base font-semibold leading-tight">Add more formats</h3>
              <p className="text-[11px] text-muted mt-0.5 line-clamp-1">
                {pack.product || "Pack"} · {pack.assets.length} asset{pack.assets.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full text-ink-2 hover:bg-panel-2 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto">
          {/* operations */}
          <section className="px-5 py-4 border-b border-line">
            <div className="font-mono uppercase tracking-wider text-[11px] text-muted font-bold mb-2">
              New operations
            </div>
            {addableOps.length === 0 ? (
              <div className="text-[12px] text-muted">
                Every operation has already run on this pack.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {addableOps.map((o) => {
                  const Icon = o.icon;
                  const isOn = selectedOps.includes(o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => toggleOp(o.key)}
                      className={
                        "text-left p-2.5 border rounded-md transition-all flex gap-2 items-start " +
                        (isOn
                          ? "border-amber bg-amber-soft shadow-soft"
                          : "border-line bg-panel hover:border-amber-border")
                      }
                    >
                      <div
                        className={
                          "flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center " +
                          (isOn ? "bg-amber text-white" : "bg-panel-2 text-ink-2")
                        }
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold leading-snug">{o.title}</div>
                        <div className="text-[10px] text-muted leading-snug line-clamp-2">{o.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {needsReference ? (
              <div className="mt-3">
                <Dropzone
                  label="Reference style"
                  hint="Drop an ad you want to match"
                  subHint="Required for lifestyle scenes — we'll match its lighting, palette, mood."
                  file={reference}
                  onChange={setReference}
                />
              </div>
            ) : null}
          </section>

          {/* platforms */}
          <section className="px-5 py-4">
            <div className="font-mono uppercase tracking-wider text-[11px] text-muted font-bold mb-2">
              New platforms (ratios)
            </div>
            {addablePlatforms.length === 0 ? (
              <div className="text-[12px] text-muted">
                Every ratio is already covered.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {addablePlatforms.map((p) => {
                  const isOn = selectedPlats.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => togglePlat(p.key)}
                      className={
                        "text-left p-2.5 border rounded-md transition-all " +
                        (isOn
                          ? "border-amber bg-amber-soft shadow-soft"
                          : "border-line bg-panel hover:border-amber-border")
                      }
                    >
                      <div className="text-[12px] font-semibold leading-snug">{p.label}</div>
                      <div className="text-[10px] text-muted mb-1">{p.hint}</div>
                      <div className="flex flex-wrap gap-1">
                        {p.ratios.map((r) => (
                          <span
                            key={r}
                            className={
                              "font-mono text-[9px] px-1.5 py-0.5 rounded " +
                              (ratiosHave.has(r)
                                ? "bg-panel-2 text-muted line-through"
                                : "bg-panel-2 text-ink-2")
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
            )}
          </section>
        </div>

        {/* footer */}
        <div className="px-5 py-3.5 border-t border-line bg-panel flex items-center justify-between gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-xs font-semibold text-ink-2 hover:text-amber disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onConfirm({
                addOperations: selectedOps,
                addPlatforms: selectedPlats,
                reference,
              })
            }
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink hover:bg-amber text-white text-xs font-semibold rounded-md shadow-soft transition-colors disabled:bg-faint disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin-slow" /> : <Plus className="w-3.5 h-3.5" />}
            {busy ? "Extending…" : "Generate more"}
          </button>
        </div>
      </aside>
    </div>
  );
}
