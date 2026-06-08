import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { listPacks, type RecentPack, makeBlobUrl } from "../lib/history";

type Props = {
  refreshKey: number;
  onOpen: (pack: RecentPack) => void;
  onNew: () => void;
};

export function RecentPacks({ refreshKey, onOpen, onNew }: Props) {
  const [packs, setPacks] = useState<RecentPack[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    listPacks(30).then((list) => {
      if (!alive) return;
      setPacks(list);
      const next: Record<string, string> = {};
      list.forEach((p) => { next[p.id] = makeBlobUrl(p.thumb); });
      // revoke old object URLs from previous render
      setThumbs((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
        return next;
      });
    });
    return () => { alive = false; };
  }, [refreshKey]);

  if (packs.length === 0) return null;

  return (
    <section className="mb-9">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-mono uppercase tracking-wider text-[11px] font-bold text-muted">Recent packs</h2>
        <button onClick={onNew} className="inline-flex items-center gap-1 text-amber text-xs font-semibold hover:underline">
          <Plus className="w-3 h-3" />
          New pack
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
        {packs.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className="bg-panel border border-line rounded-lg overflow-hidden flex flex-col text-left hover:border-amber-border hover:shadow-soft hover:-translate-y-px transition-all"
          >
            <div className="aspect-square bg-panel-2 overflow-hidden relative">
              <img src={thumbs[p.id]} className="w-full h-full object-cover" loading="lazy" />
              <span className="absolute top-1.5 right-1.5 font-mono uppercase tracking-wider text-[9px] font-bold px-1.5 py-[3px] rounded bg-green/85 text-white">
                done
              </span>
            </div>
            <div className="px-2.5 py-2 flex flex-col gap-0.5">
              <div className="text-xs font-semibold leading-snug truncate" title={p.product}>{p.product}</div>
              <div className="text-[10px] text-muted font-mono">
                {new Date(p.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
